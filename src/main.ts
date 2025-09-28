import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rawBody from 'fastify-raw-body'
import dotenv from 'dotenv'
import { ContentService } from './services/index.js'
import { CloudflareService } from './services/cloudflare.js'
import { PaymentService } from './services/payment.js'
import { webhookRoutes } from './routes/webhooks.js'
import { userRoutes } from './routes/users.js'

// Load environment variables
dotenv.config()

// Initialize services
const contentService = new ContentService()
const cloudflareService = new CloudflareService()
const paymentService = new PaymentService()

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  },
  // 配置原始请求体处理
  bodyLimit: 1048576, // 1MB
  disableRequestLogging: false
})

// Register plugins
fastify.register(cors, {
  origin: [
    'http://localhost:3000', 
    'https://shortdramini.com', 
    'https://www.shortdramini.com',
    'https://dramini-web.vercel.app',
    'https://dramini-web-git-main.vercel.app',
    'https://dramini-web-git-develop.vercel.app'
  ],
  credentials: true
})

fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev_secret'
})

fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
})

// Register raw body plugin for webhook signature verification
fastify.register(rawBody, {
  field: 'rawBody', // change the default file.rawBody property name
  global: false, // don't register to all routes
  encoding: 'utf8', // set it to false to set rawBody as a Buffer
  runFirst: true, // get the body before any preHandler hook change/uncompress it
  routes: ['/api/v1/webhooks/stripe'] // only for webhook routes
})

// Health route
fastify.get('/api/v1/health', async (request, reply) => {
  return { ok: true }
})

// Public routes
fastify.get('/api/v1/public/titles', async (request, reply) => {
  try {
    const { category, q } = request.query as { category?: string; q?: string };
    const titles = await contentService.getTitles(category, q);
    
    // 修正字段映射
    const mappedTitles = titles.map(title => ({
      ...title,
      mainTitle: title.name, // name → mainTitle
      subTitle: title.synopsis, // synopsis → subTitle
      coverUrl: title.coverImageId, // coverImageId → coverUrl
      isOnline: title.status === 'PUBLISHED', // status → isOnline
      bannerUrl: title.bannerUrl // 使用数据库中的bannerUrl字段
    }));
    
    return { titles: mappedTitles };
  } catch (error) {
    reply.code(500).send({ error: 'Internal server error' });
  }
})

// Hero banners route
fastify.get('/api/v1/public/hero-banners', async (request, reply) => {
  try {
    const banners = await contentService.getHeroBanners();
    return banners;
  } catch (error) {
    reply.code(500).send({ error: 'Internal server error' });
  }
})

// 创建轮播图端点
fastify.post('/api/v1/public/hero-banners', async (request, reply) => {
  try {
    const data = request.body as any;
    console.log('Creating hero banner with data:', data);
    
    const banner = await contentService.createHeroBanner(data);
    return banner;
  } catch (error) {
    console.error('Failed to create hero banner:', error);
    reply.code(500).send({ error: 'Failed to create banner' });
  }
})

// 图片上传端点
fastify.post('/api/v1/upload/image', async (request, reply) => {
  try {
    const data = await request.file()
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' })
    }

    const buffer = await data.toBuffer()
    const imageUrl = await cloudflareService.uploadImage(buffer, data.filename)
    
    return { success: true, imageUrl }
  } catch (error) {
    console.error('Upload error:', error)
    return reply.code(500).send({ error: 'Upload failed' })
  }
})

// 充值套餐端点
fastify.get('/api/v1/payment-packages', async (request, reply) => {
  try {
    // 从CMS获取充值套餐数据
    const cmsBase = process.env.CMS_BASE_URL || 'https://cms.shortdramini.com'
    const response = await fetch(`${cmsBase}/api/payment-packages`)
    
    if (!response.ok) {
      throw new Error(`CMS API error: ${response.status}`)
    }
    
    const packages = await response.json()
    
    // 转换为前端期望的格式
    const formattedPackages = packages.map((pkg: any) => ({
      id: pkg.id,
      name: pkg.name,
      coins: pkg.baseCoins,
      bonus: pkg.bonusCoins,
      price: pkg.priceUsd / 100, // 转换为美元
      discount: pkg.bonusCoins > 0 ? `+${Math.round((pkg.bonusCoins / pkg.baseCoins) * 100)}%` : null,
      isNewUser: pkg.isFirstTime,
      description: pkg.description
    }))
    
    return { 
      ok: true, 
      packages: formattedPackages 
    }
  } catch (error) {
    console.error('Failed to fetch payment packages:', error)
    
    // 返回默认套餐作为后备
    return {
      ok: true,
      packages: [
        {
          id: 'default',
          name: 'Basic Package',
          coins: 500,
          bonus: 50,
          price: 4.99,
          discount: '+10%',
          isNewUser: false,
          description: 'Default coin package'
        }
      ]
    }
  }
})

// 注册 Webhook 路由
fastify.register(webhookRoutes)

// 注册用户路由
fastify.register(userRoutes)

// Stripe 支付端点
fastify.post('/api/v1/user/purchase/checkout/stripe', async (request, reply) => {
  try {
    const payload = request.body as { tierKey: string; userId: string }
    console.log('Stripe checkout request:', payload)
    
    if (!payload.tierKey || !payload.userId) {
      return reply.code(400).send({ error: 'Missing tierKey or userId' })
    }
    
    const result = await paymentService.createStripeCheckoutSession(payload)
    return result
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return reply.code(500).send({ error: 'Stripe checkout failed' })
  }
})

// PayPal 支付端点
fastify.post('/api/v1/user/purchase/checkout/paypal', async (request, reply) => {
  try {
    const payload = request.body as { tierKey: string; userId: string }
    console.log('PayPal checkout request:', payload)
    
    if (!payload.tierKey || !payload.userId) {
      return reply.code(400).send({ error: 'Missing tierKey or userId' })
    }
    
    const result = await paymentService.createPayPalOrder(payload)
    return result
  } catch (error) {
    console.error('PayPal checkout error:', error)
    return reply.code(500).send({ error: 'PayPal checkout failed' })
  }
})

// PayPal 支付捕获端点
fastify.post('/api/v1/user/purchase/capture/paypal', async (request, reply) => {
  try {
    const { orderId } = request.body as { orderId: string }
    console.log('PayPal capture request:', orderId)
    
    if (!orderId) {
      return reply.code(400).send({ error: 'Missing orderId' })
    }
    
    const result = await paymentService.capturePayPalPayment(orderId)
    return result
  } catch (error) {
    console.error('PayPal capture error:', error)
    return reply.code(500).send({ error: 'PayPal capture failed' })
  }
})

// 支付验证端点
fastify.post('/api/v1/payment/verify/stripe', async (request, reply) => {
  try {
    const { sessionId } = request.body as { sessionId: string }
    console.log('Stripe payment verification request:', sessionId)
    
    const result = await paymentService.verifyStripePayment(sessionId)
    return result
  } catch (error) {
    console.error('Stripe payment verification error:', error)
    return reply.code(500).send({ error: 'Stripe payment verification failed' })
  }
})

fastify.post('/api/v1/payment/verify/paypal', async (request, reply) => {
  try {
    const { orderId } = request.body as { orderId: string }
    console.log('PayPal payment verification request:', orderId)
    
    const result = await paymentService.verifyPayPalPayment(orderId)
    return result
  } catch (error) {
    console.error('PayPal payment verification error:', error)
    return reply.code(500).send({ error: 'PayPal payment verification failed' })
  }
})

// 获取订单状态端点
fastify.get('/api/v1/payment/orders/:orderId', async (request, reply) => {
  try {
    const { orderId } = request.params as { orderId: string }
    
    const result = await paymentService.getOrderStatus(orderId)
    return result
  } catch (error) {
    console.error('Get order status error:', error)
    return reply.code(500).send({ error: 'Failed to get order status' })
  }
})

// 获取金币套餐列表端点
fastify.get('/api/v1/payment/tiers', async (request, reply) => {
  try {
    const { getAllTiers, getFirstTimeTiers, getRegularTiers } = await import('./config/payment-tiers.js')
    
    const allTiers = getAllTiers()
    const firstTimeTiers = getFirstTimeTiers()
    const regularTiers = getRegularTiers()
    
    return {
      success: true,
      tiers: {
        all: allTiers,
        firstTime: firstTimeTiers,
        regular: regularTiers
      }
    }
  } catch (error) {
    console.error('Get payment tiers error:', error)
    return reply.code(500).send({ error: 'Failed to get payment tiers' })
  }
})

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3002')
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(`🚀 Content API server running on http://localhost:${port}`)
    console.log(`📚 API Documentation: http://localhost:${port}/api/v1/health`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()// Deployment trigger Sat Sep 27 18:06:14 CST 2025
