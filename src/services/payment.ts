import Stripe from 'stripe'
import paypal from '@paypal/checkout-server-sdk'
import { PrismaClient } from '@prisma/client'
import { getTierConfig, validateTierKey, PaymentTier } from '../config/payment-tiers.js'

// 初始化 Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// 初始化 PayPal
const environment = process.env.PAYPAL_ENVIRONMENT === 'live' 
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)

const paypalClient = new paypal.core.PayPalHttpClient(environment)

// 初始化 Prisma
const prisma = new PrismaClient()

export class PaymentService {
  // 创建支付订单记录
  private async createPaymentOrder(
    userId: string,
    tierKey: string,
    provider: 'stripe' | 'paypal',
    tierConfig: PaymentTier,
    providerOrderId?: string
  ) {
    const order = await prisma.paymentOrder.create({
      data: {
        userId,
        tierKey,
        provider,
        providerOrderId,
        amountCents: tierConfig.priceCents,
        coins: tierConfig.coins + tierConfig.bonusCoins,
        status: 'pending',
        metadata: JSON.stringify({
          tierKey,
          coins: tierConfig.coins,
          bonusCoins: tierConfig.bonusCoins,
          isFirstTime: tierConfig.isFirstTime
        })
      }
    })

    return order
  }

  // Get CMS package configuration
  private async getCmsPackageConfig(packageId: string): Promise<PaymentTier | null> {
    try {
      const cmsBase = process.env.CMS_BASE_URL || 'https://cms.shortdramini.com'
      const response = await fetch(`${cmsBase}/api/payment-packages`)
      
      if (!response.ok) {
        console.error(`CMS API error: ${response.status}`)
        return null
      }
      
      const packages = await response.json()
      const pkg = packages.find((p: any) => p.id === packageId)
      
      if (!pkg) {
        return null
      }
      
      // 转换为 PaymentTier 格式
      return {
        key: pkg.id,
        name: pkg.name,
        coins: pkg.coins,
        bonusCoins: pkg.bonus,
        priceCents: Math.round(pkg.price * 100), // 转换为分
        currency: 'USD',
        isFirstTime: pkg.isNewUser,
        description: pkg.description
      }
    } catch (error) {
      console.error('Failed to fetch CMS package config:', error)
      return null
    }
  }

  // Stripe 支付
  async createStripeCheckoutSession(payload: {
    tierKey: string
    userId: string
  }) {
    try {
      const { tierKey, userId } = payload
      
      // 获取套餐配置 - 支持硬编码和CMS动态套餐
      let tierConfig = getTierConfig(tierKey)
      
      // 如果不是硬编码套餐，尝试从CMS获取
      if (!tierConfig) {
        tierConfig = await this.getCmsPackageConfig(tierKey)
      }
      
      if (!tierConfig) {
        throw new Error(`Invalid tier key: ${tierKey}`)
      }
      
      // 创建支付订单记录
      const order = await this.createPaymentOrder(userId, tierKey, 'stripe', tierConfig)
      
      // 创建 Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: tierConfig.currency.toLowerCase(),
              product_data: {
                name: tierConfig.name,
                description: tierConfig.description || `Get ${tierConfig.coins} coins${tierConfig.bonusCoins > 0 ? ` + ${tierConfig.bonusCoins} bonus` : ''}`,
              },
              unit_amount: tierConfig.priceCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/cancel`,
        metadata: {
          orderId: order.id,
          tierKey,
          userId,
        },
        // 设置幂等键
        // idempotency_key: order.id, // Stripe Checkout 不支持此参数
      })

      // 更新订单的 provider_order_id
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { providerOrderId: session.id }
      })

      return {
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        orderId: order.id,
      }
    } catch (error) {
      console.error('Stripe checkout session creation failed:', error)
      throw new Error('Failed to create Stripe checkout session')
    }
  }

  // PayPal 支付
  async createPayPalOrder(payload: {
    tierKey: string
    userId: string
  }) {
    try {
      const { tierKey, userId } = payload
      
      // 获取套餐配置 - 支持硬编码和CMS动态套餐
      let tierConfig = getTierConfig(tierKey)
      
      // 如果不是硬编码套餐，尝试从CMS获取
      if (!tierConfig) {
        tierConfig = await this.getCmsPackageConfig(tierKey)
      }
      
      if (!tierConfig) {
        throw new Error(`Invalid tier key: ${tierKey}`)
      }
      
      // 创建支付订单记录
      const order = await this.createPaymentOrder(userId, tierKey, 'paypal', tierConfig)
      
      // 创建 PayPal 订单请求
      const request = new paypal.orders.OrdersCreateRequest()
      request.prefer('return=representation')
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: tierConfig.currency,
              value: (tierConfig.priceCents / 100).toFixed(2),
            },
            description: tierConfig.description || `Get ${tierConfig.coins} coins${tierConfig.bonusCoins > 0 ? ` + ${tierConfig.bonusCoins} bonus` : ''}`,
            custom_id: JSON.stringify({
              orderId: order.id,
              tierKey,
              userId,
            }),
          },
        ],
        application_context: {
          brand_name: 'Dramini',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING', // 数字商品不需要地址
          return_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/success?order_id={order_id}`,
          cancel_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/cancel`,
        },
      })

      const response = await paypalClient.execute(request)
      
      if (response.statusCode === 201) {
        const paypalOrder = response.result
        
        // 更新订单的 provider_order_id
        await prisma.paymentOrder.update({
          where: { id: order.id },
          data: { providerOrderId: paypalOrder.id }
        })
        
        return {
          success: true,
          checkoutUrl: paypalOrder.links?.find((link: any) => link.rel === 'approve')?.href,
          orderId: order.id,
          paypalOrderId: paypalOrder.id,
        }
      } else {
        throw new Error(`PayPal order creation failed: ${response.statusCode}`)
      }
    } catch (error) {
      console.error('PayPal order creation failed:', error)
      throw new Error('Failed to create PayPal order')
    }
  }

  // 处理支付成功 - 加金币（幂等）
  async processPaymentSuccess(
    orderId: string,
    providerEventId: string,
    provider: 'stripe' | 'paypal'
  ) {
    try {
      // 检查订单是否已处理（幂等）
      const existingOrder = await prisma.paymentOrder.findFirst({
        where: {
          OR: [
            { id: orderId },
            { providerEventId }
          ]
        }
      })

      if (!existingOrder) {
        throw new Error(`Order not found: ${orderId}`)
      }

      if (existingOrder.status === 'completed') {
        console.log(`Order already processed: ${orderId}`)
        return {
          success: true,
          alreadyProcessed: true,
          order: existingOrder
        }
      }

      // 使用事务确保原子性
      const result = await prisma.$transaction(async (tx) => {
        // 更新订单状态
        const updatedOrder = await tx.paymentOrder.update({
          where: { id: orderId },
          data: {
            status: 'completed',
            providerEventId,
            completedAt: new Date()
          }
        })

        // 获取或创建用户金币记录
        const userCoins = await tx.userCoins.upsert({
          where: { userId: updatedOrder.userId },
          update: {
            balance: {
              increment: updatedOrder.coins
            }
          },
          create: {
            userId: updatedOrder.userId,
            balance: updatedOrder.coins
          }
        })

        // 创建金币交易记录
        const transaction = await tx.coinTransaction.create({
          data: {
            userId: updatedOrder.userId,
            orderId: updatedOrder.id,
            coins: updatedOrder.coins,
            transactionType: 'purchase',
            description: `Purchase: ${updatedOrder.tierKey}`
          }
        })

        return {
          order: updatedOrder,
          userCoins,
          transaction
        }
      })

      console.log(`Payment processed successfully: ${orderId}, coins added: ${result.order.coins}`)
      
      return {
        success: true,
        alreadyProcessed: false,
        order: result.order,
        userCoins: result.userCoins,
        transaction: result.transaction
      }
    } catch (error) {
      console.error('Payment processing failed:', error)
      throw error
    }
  }

  // 验证 Stripe 支付（仅用于前端展示）
  async verifyStripePayment(sessionId: string) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      
      // 查找对应的订单
      const order = await prisma.paymentOrder.findFirst({
        where: { providerOrderId: sessionId }
      })

      return {
        success: session.payment_status === 'paid',
        session,
        order,
        metadata: session.metadata,
      }
    } catch (error) {
      console.error('Stripe payment verification failed:', error)
      throw new Error('Failed to verify Stripe payment')
    }
  }

  // 验证 PayPal 支付（仅用于前端展示）
  async verifyPayPalPayment(orderId: string) {
    try {
      const request = new paypal.orders.OrdersGetRequest(orderId)
      const response = await paypalClient.execute(request)
      
      if (response.statusCode === 200) {
        const paypalOrder = response.result
        
        // 查找对应的订单
        const order = await prisma.paymentOrder.findFirst({
          where: { providerOrderId: orderId }
        })
        
        return {
          success: paypalOrder.status === 'COMPLETED',
          order: paypalOrder,
          internalOrder: order,
          metadata: paypalOrder.purchase_units?.[0]?.custom_id ? JSON.parse(paypalOrder.purchase_units[0].custom_id) : {},
        }
      } else {
        throw new Error(`PayPal order verification failed: ${response.statusCode}`)
      }
    } catch (error) {
      console.error('PayPal payment verification failed:', error)
      throw new Error('Failed to verify PayPal payment')
    }
  }

  // 获取订单状态
  async getOrderStatus(orderId: string) {
    try {
      const order = await prisma.paymentOrder.findUnique({
        where: { id: orderId },
        include: {
          coinTransactions: true
        }
      })

      if (!order) {
        throw new Error(`Order not found: ${orderId}`)
      }

      return {
        success: true,
        order
      }
    } catch (error) {
      console.error('Get order status failed:', error)
      throw error
    }
  }

  // 捕获 PayPal 支付
  async capturePayPalPayment(orderId: string) {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId)
      request.requestBody({
        payment_source: {} as any
      })
      
      const response = await paypalClient.execute(request)
      
      if (response.statusCode === 201) {
        const order = response.result
        return {
          success: true,
          order,
          captureId: order.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        }
      } else {
        throw new Error(`PayPal payment capture failed: ${response.statusCode}`)
      }
    } catch (error) {
      console.error('PayPal payment capture failed:', error)
      throw new Error('Failed to capture PayPal payment')
    }
  }
}