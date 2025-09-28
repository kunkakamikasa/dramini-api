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
  // Stripe Webhook 处理 - 子实例隔离解析器，确保原始字节
  fastify.register(async (scope) => {
    // 只在这个子实例里禁用默认解析器，强制把所有 content-type 解析成 Buffer
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
      done(null, body) // 保持原样 Buffer
    })

    scope.post('/api/v1/webhooks/stripe', async (req, reply) => {
      const sig = req.headers['stripe-signature']
      if (!sig) return reply.code(400).send('Missing Stripe-Signature')

      // 这里一定是 Buffer，千万别 toString()/JSON.parse()/JSON.stringify()
      const raw = req.body as Buffer

      // 自检一致性，出问题直接打印并 400
      const hdrLen = Number(req.headers['content-length'] || 0)
      if (!Buffer.isBuffer(raw) || (hdrLen && raw.length !== hdrLen)) {
        console.error('RAW MISMATCH', { isBuffer: Buffer.isBuffer(raw), rawLen: raw?.length, hdrLen })
        return reply.code(400).send('Invalid raw body')
      }

      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })
        const event = stripe.webhooks.constructEvent(
          raw,
          sig as string,
          process.env.STRIPE_WEBHOOK_SECRET! // 来自"沙盒/Test mode"端点的 whsec_...
        )

        console.log('✅ Stripe webhook signature verified successfully!')
        console.log('📊 Event details:', {
          type: event.type,
          id: event.id,
          created: event.created,
          livemode: event.livemode
        })

        // 幂等处理（建议根据 event.id 或对象 id 去重）
        switch (event.type) {
          case 'checkout.session.completed':
            console.log('💳 Processing checkout.session.completed event')
            const session = event.data.object as Stripe.Checkout.Session
            
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
            }
            break
            
          case 'payment_intent.succeeded':
            console.log('💳 Processing payment_intent.succeeded event')
            const paymentIntent = event.data.object as Stripe.PaymentIntent
            
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
            }
            break
            
          default:
            console.log('ℹ️ Unhandled event type:', event.type)
            break
        }

        return reply.send({ received: true }) // 尽快 200
      } catch (err: any) {
        console.error('webhook verify failed:', err.message)
        return reply.code(400).send(`Webhook Error: ${err.message}`)
      }
    })
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