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
  // Stripe Webhook 处理 - 需要原始请求体进行签名验证
  fastify.post('/api/v1/webhook/stripe', async (request, reply) => {
    try {
      console.log('🚀 Stripe webhook endpoint hit!')
      // 获取原始请求体 - 手动读取原始数据
      const body = await request.body
      const signatureHeader = request.headers['stripe-signature']
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader

      console.log('📋 Request headers:', {
        'content-type': request.headers['content-type'],
        'stripe-signature': signature ? signature.substring(0, 20) + '...' : 'missing',
        'user-agent': request.headers['user-agent'],
        'content-length': request.headers['content-length']
      })

      console.log('🔍 Stripe webhook body analysis:', {
        bodyType: typeof body,
        bodyLength: typeof body === 'string' ? body.length : JSON.stringify(body).length,
        bodyPreview: typeof body === 'string' ? body.substring(0, 100) + '...' : JSON.stringify(body).substring(0, 100) + '...'
      })

      if (!signature) {
        console.error('❌ Missing Stripe signature header')
        return reply.code(400).send({ error: 'Missing signature' })
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
      if (!webhookSecret) {
        console.error('❌ STRIPE_WEBHOOK_SECRET not configured')
        return reply.code(500).send({ error: 'Webhook secret not configured' })
      }

      console.log('🔐 Webhook secret configured:', webhookSecret.substring(0, 10) + '...')

      let event: Stripe.Event

      try {
        // 将请求体转换为字符串进行签名验证
        const bodyString = typeof body === 'string' ? body : JSON.stringify(body)
        console.log('🔍 Attempting signature verification with:', {
          bodyStringLength: bodyString.length,
          signatureLength: signature.length,
          webhookSecretLength: webhookSecret.length
        })
        
        event = stripe.webhooks.constructEvent(bodyString, signature, webhookSecret)
        console.log('✅ Stripe webhook signature verified successfully!')
        console.log('📊 Event details:', {
          type: event.type,
          id: event.id,
          created: event.created,
          livemode: event.livemode
        })
      } catch (err: any) {
        console.error(`❌ Stripe webhook signature verification failed: ${err.message}`)
        console.error('🔍 Verification details:', {
          errorType: err.constructor.name,
          errorCode: err.code,
          errorStack: err.stack
        })
        return reply.code(400).send({ error: `Webhook Error: ${err.message}` })
      }

      // 处理支付成功事件
      console.log('🎯 Processing event type:', event.type)
      
      if (event.type === 'checkout.session.completed') {
        console.log('💳 Processing checkout.session.completed event')
        const session = event.data.object as Stripe.Checkout.Session
        
        console.log('📋 Session details:', {
          id: session.id,
          payment_status: session.payment_status,
          amount_total: session.amount_total,
          metadata: session.metadata
        })
        
        if (session.payment_status === 'paid' && session.metadata?.orderId) {
          try {
            console.log('🔄 Processing payment success for order:', session.metadata.orderId)
            const result = await paymentService.processPaymentSuccess(
              session.metadata.orderId,
              event.id,
              'stripe'
            )
            
            console.log('✅ Stripe payment processed successfully:', {
              orderId: session.metadata.orderId,
              sessionId: session.id,
              alreadyProcessed: result.alreadyProcessed
            })
          } catch (error) {
            console.error('❌ Failed to process Stripe payment:', error)
            // 不返回错误，避免 Stripe 重试
          }
        } else {
          console.log('⚠️ Session not paid or missing orderId:', {
            payment_status: session.payment_status,
            hasOrderId: !!session.metadata?.orderId
          })
        }
      } else if (event.type === 'payment_intent.succeeded') {
        console.log('💳 Processing payment_intent.succeeded event')
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        
        console.log('📋 PaymentIntent details:', {
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          status: paymentIntent.status,
          metadata: paymentIntent.metadata
        })
        
        // 查找对应的订单
        if (paymentIntent.metadata?.orderId) {
          try {
            console.log('🔄 Processing payment intent success for order:', paymentIntent.metadata.orderId)
            const result = await paymentService.processPaymentSuccess(
              paymentIntent.metadata.orderId,
              event.id,
              'stripe'
            )
            
            console.log('✅ Stripe payment intent processed successfully:', {
              orderId: paymentIntent.metadata.orderId,
              paymentIntentId: paymentIntent.id,
              alreadyProcessed: result.alreadyProcessed
            })
          } catch (error) {
            console.error('❌ Failed to process Stripe payment intent:', error)
          }
        } else {
          console.log('⚠️ PaymentIntent missing orderId in metadata')
        }
      } else if (event.type === 'charge.refunded' || event.type === 'refund.created') {
        // 处理退款事件
        console.log('🔄 Stripe refund event received:', event.type)
        // TODO: 实现退款逻辑
      } else {
        console.log('ℹ️ Unhandled event type:', event.type)
      }

      console.log('✅ Webhook processing completed successfully')
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
      console.log('PayPal webhook headers:', {
        transmissionId,
        webhookId,
        transmissionTime,
        transmissionSig: transmissionSig?.substring(0, 20) + '...',
        certUrl,
        authAlgo
      })
      
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
        console.log('PayPal capture event:', {
          captureId: capture.id,
          status: capture.status,
          custom_id: capture.custom_id,
          amount: capture.amount
        })
        
        if (capture.status === 'COMPLETED' && capture.custom_id) {
          try {
            const customData = JSON.parse(capture.custom_id)
            console.log('PayPal custom data:', customData)
            
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
            } else {
              console.error('No orderId in PayPal custom data:', customData)
            }
          } catch (error) {
            console.error('Failed to process PayPal payment:', error)
            console.error('Error details:', {
              message: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined
            })
            // 不返回错误，避免 PayPal 重试
          }
        } else {
          console.error('PayPal capture not completed or missing custom_id:', {
            status: capture.status,
            custom_id: capture.custom_id
          })
        }
      } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
        // 处理退款事件
        console.log('PayPal refund event received:', event.event_type)
        // TODO: 实现退款逻辑
      } else {
        console.log('PayPal webhook event type not handled:', event.event_type)
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