import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import dotenv from 'dotenv'
import { ContentService } from './services/index.js'
import { CloudflareService } from './services/cloudflare.js'

// Load environment variables
dotenv.config()

// Initialize services
const contentService = new ContentService()
const cloudflareService = new CloudflareService()

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
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

// Stripe 支付端点
fastify.post('/api/v1/user/purchase/checkout/stripe', async (request, reply) => {
  try {
    const payload = request.body as any
    console.log('Stripe checkout request:', payload)
    
    // 这里应该集成 Stripe SDK 创建支付会话
    // 暂时返回模拟的 checkout URL
    const checkoutUrl = `https://checkout.stripe.com/pay/cs_test_${Date.now()}`
    
    return {
      success: true,
      checkoutUrl: checkoutUrl
    }
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return reply.code(500).send({ error: 'Stripe checkout failed' })
  }
})

// PayPal 支付端点
fastify.post('/api/v1/user/purchase/checkout/paypal', async (request, reply) => {
  try {
    const payload = request.body as any
    console.log('PayPal checkout request:', payload)
    
    // 这里应该集成 PayPal SDK 创建支付会话
    // 暂时返回模拟的 checkout URL
    const checkoutUrl = `https://www.paypal.com/checkoutnow?token=${Date.now()}`
    
    return {
      success: true,
      checkoutUrl: checkoutUrl
    }
  } catch (error) {
    console.error('PayPal checkout error:', error)
    return reply.code(500).send({ error: 'PayPal checkout failed' })
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

start()