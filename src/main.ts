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
  origin: ['http://localhost:3000', 'https://shortdramini.com', 'https://www.shortdramini.com'],
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
      bannerUrl: null // 暂时设为null
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