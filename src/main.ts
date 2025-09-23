import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

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
    // 简单的测试数据
    return {
      titles: [
        {
          id: '1',
          name: '测试剧集',
          slug: 'test-drama',
          synopsis: '这是一个测试剧集',
          status: 'PUBLISHED'
        }
      ]
    }
  } catch (error) {
    reply.code(500).send({ error: 'Internal server error' })
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