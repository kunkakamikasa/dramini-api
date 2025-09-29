import { FastifyInstance } from 'fastify'
import { AnalyticsService } from '../services/analytics.js'

const analyticsService = new AnalyticsService()

export async function analyticsRoutes(fastify: FastifyInstance) {
  // 埋点接口 - 记录页面访问
  fastify.post('/api/v1/analytics/track', async (request, reply) => {
    try {
      const body = request.body as any
      const clientIP = analyticsService.getClientIP(request)
      
      const data = {
        sessionId: body.sessionId || analyticsService.generateSessionId(),
        userId: body.userId,
        ipAddress: clientIP,
        userAgent: request.headers['user-agent'],
        referrer: body.referrer,
        page: body.page,
        title: body.title,
        eventType: body.eventType,
        eventData: body.eventData
      }

      // 记录会话
      await analyticsService.trackSession(data)

      // 记录页面访问
      if (body.page) {
        await analyticsService.trackPageView(data)
      }

      // 记录事件
      if (body.eventType) {
        await analyticsService.trackEvent(data)
      }

      return reply.send({ success: true })
    } catch (error) {
      console.error('Analytics track error:', error)
      return reply.code(500).send({ error: 'Failed to track analytics' })
    }
  })

  // 获取统计数据
  fastify.get('/api/v1/analytics/stats', async (request, reply) => {
    try {
      const query = request.query as any
      const { startDate, endDate, granularity = 'day' } = query

      if (!startDate || !endDate) {
        return reply.code(400).send({ error: 'startDate and endDate are required' })
      }

      const start = new Date(startDate)
      const end = new Date(endDate)

      const stats = await analyticsService.getStats(start, end, granularity)

      return reply.send({
        success: true,
        data: stats
      })
    } catch (error) {
      console.error('Get analytics stats error:', error)
      return reply.code(500).send({ error: 'Failed to get analytics stats' })
    }
  })

  // 获取概览数据
  fastify.get('/api/v1/analytics/overview', async (request, reply) => {
    try {
      const overview = await analyticsService.getOverviewStats()

      return reply.send({
        success: true,
        data: overview
      })
    } catch (error) {
      console.error('Get analytics overview error:', error)
      return reply.code(500).send({ error: 'Failed to get analytics overview' })
    }
  })

  // 获取实时数据（最近24小时）
  fastify.get('/api/v1/analytics/realtime', async (request, reply) => {
    try {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const stats = await analyticsService.getStats(yesterday, now, 'hour')

      return reply.send({
        success: true,
        data: stats
      })
    } catch (error) {
      console.error('Get realtime analytics error:', error)
      return reply.code(500).send({ error: 'Failed to get realtime analytics' })
    }
  })
}
