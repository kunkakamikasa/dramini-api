import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Import routes
import healthRoutes from './routes/health'
import publicRoutes from './routes/public'
import userRoutes from './routes/user'
import webhookRoutes from './routes/webhooks'

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
  origin: ['http://localhost:3000'],
  credentials: true
})

fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'dev_secret'
})

// Register routes
fastify.register(healthRoutes, { prefix: '/api/v1' })
fastify.register(publicRoutes, { prefix: '/api/v1/public' })
fastify.register(userRoutes, { prefix: '/api/v1/user' })
fastify.register(webhookRoutes, { prefix: '/api/v1/webhooks' })

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
