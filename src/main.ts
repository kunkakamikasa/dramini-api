import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'
import { ContentService } from './services/index'

// Load environment variables
dotenv.config()

// Initialize services
const contentService = new ContentService()

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
  origin: ['http://localhost:3000', 'https://shortdramini.com'],
  credentials: true
})

fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev_secret'
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