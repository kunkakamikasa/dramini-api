import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import paypal from '@paypal/checkout-server-sdk'
import { PaymentService } from '../services/payment.js'

// 初始化 Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// 初始化 PayPal
const environment = process.env.PAYPAL_ENVIRONMENT === 'live' 
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID!, process.env.PAYPAL_CLIENT_SECRET!)

const paypalClient = new paypal.core.PayPalHttpClient(environment)

const paymentService = new PaymentService()

export async function webhookRoutes(fastify: FastifyInstance) {
  // Stripe Webhook 处理
  fastify.post('/api/v1/webhooks/stripe', async (request, reply) => {
    try {
      const body = request.body as Buffer
      const signature = request.headers['stripe-signature'] as string

      if (!signature) {
        console.error('Missing Stripe signature header')
        return reply.code(400).send({ error: 'Missing signature' })
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not configured')
        return reply.code(500).send({ error: 'Webhook secret not configured' })
      }

      let event: Stripe.Event

      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      } catch (err: any) {
        console.error(`Stripe webhook signature verification failed: ${err.message}`)
        return reply.code(400).send({ error: `Webhook Error: ${err.message}` })
      }

      console.log('Stripe webhook received:', event.type, event.id)

      // 处理支付成功事件
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session
        
        if (session.payment_status === 'paid' && session.metadata?.orderId) {
          try {
            const result = await paymentService.processPaymentSuccess(
              session.metadata.orderId,
              event.id,
              'stripe'
            )
            
            console.log('Stripe payment processed:', {
              orderId: session.metadata.orderId,
              sessionId: session.id,
              alreadyProcessed: result.alreadyProcessed
            })
          } catch (error) {
            console.error('Failed to process Stripe payment:', error)
            // 不返回错误，避免 Stripe 重试
          }
        }
      } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        // 查找对应的订单
        if (paymentIntent.metadata?.orderId) {
          try {
            const result = await paymentService.processPaymentSuccess(
              paymentIntent.metadata.orderId,
              event.id,
              'stripe'
            )
            
            console.log('Stripe payment intent processed:', {
              orderId: paymentIntent.metadata.orderId,
              paymentIntentId: paymentIntent.id,
              alreadyProcessed: result.alreadyProcessed
            })
          } catch (error) {
            console.error('Failed to process Stripe payment intent:', error)
          }
        }
      } else if (event.type === 'charge.refunded' || event.type === 'refund.created') {
        // 处理退款事件
        console.log('Stripe refund event received:', event.type)
        // TODO: 实现退款逻辑
      }

      return reply.send({ received: true })
    } catch (error) {
      console.error('Stripe webhook error:', error)
      return reply.code(500).send({ error: 'Webhook processing failed' })
    }
  })

  // PayPal Webhook 处理
  fastify.post('/api/v1/webhooks/paypal', async (request, reply) => {
    try {
      const body = JSON.stringify(request.body)
      const transmissionId = request.headers['paypal-transmission-id'] as string
      const webhookId = request.headers['paypal-webhook-id'] as string
      const transmissionTime = request.headers['paypal-transmission-time'] as string
      const transmissionSig = request.headers['paypal-transmission-sig'] as string
      const certUrl = request.headers['paypal-cert-url'] as string
      const authAlgo = request.headers['paypal-auth-algo'] as string
      
      if (!transmissionId || !webhookId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
        console.error('Missing PayPal webhook headers')
        return reply.code(400).send({ error: 'Missing headers' })
      }

      const expectedWebhookId = process.env.PAYPAL_WEBHOOK_ID
      if (webhookId !== expectedWebhookId) {
        console.error('Invalid PayPal webhook ID')
        return reply.code(400).send({ error: 'Invalid webhook ID' })
      }

      // 验证 PayPal Webhook 签名
      const isValid = await verifyPayPalWebhook(
        body,
        transmissionId,
        transmissionTime,
        transmissionSig,
        certUrl,
        authAlgo,
        webhookId
      )
      
      if (!isValid) {
        console.error('Invalid PayPal webhook signature')
        return reply.code(400).send({ error: 'Invalid signature' })
      }

      const event = JSON.parse(body)
      console.log('PayPal webhook received:', event.event_type, event.id)

      // 处理支付成功事件
      if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const capture = event.resource
        
        if (capture.status === 'COMPLETED' && capture.custom_id) {
          try {
            const customData = JSON.parse(capture.custom_id)
            
            if (customData.orderId) {
              const result = await paymentService.processPaymentSuccess(
                customData.orderId,
                event.id,
                'paypal'
              )
              
              console.log('PayPal payment processed:', {
                orderId: customData.orderId,
                captureId: capture.id,
                alreadyProcessed: result.alreadyProcessed
              })
            }
          } catch (error) {
            console.error('Failed to process PayPal payment:', error)
            // 不返回错误，避免 PayPal 重试
          }
        }
      } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
        // 处理退款事件
        console.log('PayPal refund event received:', event.event_type)
        // TODO: 实现退款逻辑
      }

      return reply.send({ received: true })
    } catch (error) {
      console.error('PayPal webhook error:', error)
      return reply.code(500).send({ error: 'Webhook processing failed' })
    }
  })
}

// PayPal Webhook 签名验证
async function verifyPayPalWebhook(
  body: string,
  transmissionId: string,
  transmissionTime: string,
  transmissionSig: string,
  certUrl: string,
  authAlgo: string,
  webhookId: string
): Promise<boolean> {
  try {
    const clientId = process.env.PAYPAL_CLIENT_ID
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET
    const environment = process.env.PAYPAL_ENVIRONMENT || 'live'
    
    if (!clientId || !clientSecret) {
      console.error('PayPal credentials not configured')
      return false
    }

    const baseUrl = environment === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com'

    const verifyPayload = {
      auth_algo: authAlgo,
      cert_id: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(body)
    }

    // 获取访问令牌
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials'
    })

    if (!tokenResponse.ok) {
      console.error('Failed to get PayPal access token')
      return false
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // 验证 Webhook 签名
    const verifyResponse = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(verifyPayload)
    })

    if (!verifyResponse.ok) {
      console.error('PayPal webhook verification failed')
      return false
    }

    const verifyResult = await verifyResponse.json()
    return verifyResult.verification_status === 'SUCCESS'

  } catch (error) {
    console.error('PayPal webhook verification error:', error)
    return false
  }
}