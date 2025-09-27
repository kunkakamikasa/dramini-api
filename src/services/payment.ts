import Stripe from 'stripe'
import { PayPalApi, PayPalEnvironment } from '@paypal/paypal-server-sdk'

// 初始化 Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// 初始化 PayPal
const paypalEnvironment = process.env.PAYPAL_ENVIRONMENT === 'live' 
  ? PayPalEnvironment.Live
  : PayPalEnvironment.Sandbox

const paypalClient = new PayPalApi({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  environment: paypalEnvironment,
})

export class PaymentService {
  // Stripe 支付
  async createStripeCheckoutSession(payload: {
    plan: string
    priceCents: number
    meta: {
      coins: number
      bonus: number
      episodeId: string
      titleId: string
      userId?: string
    }
  }) {
    try {
      const { plan, priceCents, meta } = payload
      
      // 创建 Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Coin Package - ${meta.coins} Coins`,
                description: `Get ${meta.coins} coins${meta.bonus > 0 ? ` + ${meta.bonus} bonus` : ''}`,
              },
              unit_amount: priceCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/cancel`,
        metadata: {
          plan,
          coins: meta.coins.toString(),
          bonus: meta.bonus.toString(),
          episodeId: meta.episodeId,
          titleId: meta.titleId,
          userId: meta.userId || 'anonymous',
        },
      })

      return {
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      }
    } catch (error) {
      console.error('Stripe checkout session creation failed:', error)
      throw new Error('Failed to create Stripe checkout session')
    }
  }

  // PayPal 支付
  async createPayPalOrder(payload: {
    plan: string
    priceCents: number
    meta: {
      coins: number
      bonus: number
      episodeId: string
      titleId: string
      userId?: string
    }
  }) {
    try {
      const { plan, priceCents, meta } = payload
      
      // 创建 PayPal 订单
      const order = await paypalClient.orders.create({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: (priceCents / 100).toFixed(2),
            },
            description: `Coin Package - ${meta.coins} Coins${meta.bonus > 0 ? ` + ${meta.bonus} bonus` : ''}`,
            custom_id: JSON.stringify({
              plan,
              coins: meta.coins,
              bonus: meta.bonus,
              episodeId: meta.episodeId,
              titleId: meta.titleId,
              userId: meta.userId || 'anonymous',
            }),
          },
        ],
        application_context: {
          brand_name: 'Dramini',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/success?order_id={order_id}`,
          cancel_url: `${process.env.WEB_BASE_URL || 'https://shortdramini.com'}/payment/cancel`,
        },
      })
      
      return {
        success: true,
        checkoutUrl: order.links?.find(link => link.rel === 'approve')?.href,
        orderId: order.id,
      }
    } catch (error) {
      console.error('PayPal order creation failed:', error)
      throw new Error('Failed to create PayPal order')
    }
  }

  // 验证 Stripe 支付
  async verifyStripePayment(sessionId: string) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      
      if (session.payment_status === 'paid') {
        return {
          success: true,
          session,
          metadata: session.metadata,
        }
      } else {
        return {
          success: false,
          session,
          metadata: session.metadata,
        }
      }
    } catch (error) {
      console.error('Stripe payment verification failed:', error)
      throw new Error('Failed to verify Stripe payment')
    }
  }

  // 验证 PayPal 支付
  async verifyPayPalPayment(orderId: string) {
    try {
      const order = await paypalClient.orders.get(orderId)
      
      return {
        success: order.status === 'COMPLETED',
        order,
        metadata: order.purchase_units?.[0]?.custom_id ? JSON.parse(order.purchase_units[0].custom_id) : {},
      }
    } catch (error) {
      console.error('PayPal payment verification failed:', error)
      throw new Error('Failed to verify PayPal payment')
    }
  }

  // 捕获 PayPal 支付
  async capturePayPalPayment(orderId: string) {
    try {
      const order = await paypalClient.orders.capture(orderId)
      
      return {
        success: true,
        order,
        captureId: order.purchase_units?.[0]?.payments?.captures?.[0]?.id,
      }
    } catch (error) {
      console.error('PayPal payment capture failed:', error)
      throw new Error('Failed to capture PayPal payment')
    }
  }
}