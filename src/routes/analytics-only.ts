import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

export async function analyticsOnlyRoutes(fastify: FastifyInstance) {
  
  // Analytics health check
  fastify.get('/analytics/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      message: 'Analytics service is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    })
  })

  // Analytics track endpoint
  fastify.post('/analytics/track', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { events } = request.body as { events: any[] }
      
      if (!events || !Array.isArray(events)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid events array'
        })
      }

      // Check for analytics key header (bot filtering)
      const analyticsKey = request.headers['x-analytics-key'] as string
      if (!analyticsKey || analyticsKey !== 'dramini2025') {
        return reply.status(401).send({
          success: false,
          error: 'Missing or invalid analytics key'
        })
      }

      // Process events (simplified for now)
      console.log(`Received ${events.length} analytics events`)
      
      return reply.send({
        success: true,
        processed: events.length,
        message: 'Events received successfully'
      })
    } catch {
      return reply.status(500).send({
        success: false,
        error: 'Failed to process analytics events'
      })
    }
  })

  // Analytics overview
  fastify.get('/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      return reply.send({
        success: true,
        data: {
          today: {
            pv: 0,
            uv: 0,
            registrations: 0,
            viewers: 0
          },
          week: {
            pv: 0,
            uv: 0,
            registrations: 0,
            viewers: 0
          },
          month: {
            pv: 0,
            uv: 0,
            registrations: 0,
            viewers: 0
          }
        }
      })
    } catch {
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch analytics overview'
      })
    }
  })

  // Analytics stats
  fastify.get('/analytics/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { granularity = 'day', days = '7' } = request.query as { granularity?: string; days?: string }
      
      const daysCount = parseInt(days) || 7
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - daysCount)
      
      return reply.send({
        success: true,
        data: {
          granularity,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
          stats: []
        }
      })
    } catch {
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch analytics stats'
      })
    }
  })
}