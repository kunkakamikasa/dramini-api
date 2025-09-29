import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { AnalyticsService } from '../services/analytics.js'

const analyticsService = new AnalyticsService()

export async function analyticsRoutes(fastify: FastifyInstance) {
  
  // 批量埋点接口 (核心接口)
  fastify.post('/api/v1/analytics/track', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { events, reason } = request.body as { events: any[]; reason?: string }
      
      if (!Array.isArray(events) || events.length === 0) {
        return reply.code(400).send({
          error: 'Missing or invalid events array',
          message: 'Events must be a non-empty array'
        })
      }

      // 获取客户端信息
      const ipAddress = analyticsService.extractClientIP(request)
      const userAgent = request.headers['user-agent']
      const origin = request.headers.origin
      
      console.log(`Analytics batch received: ${events.length} events, reason: ${reason}`)
      console.log(`Client IP: ${ipAddress}, UA: ${userAgent?.substring(0, 100)}...`)
      
      // 处理事件批量
      const result = await analyticsService.processEventBatch(
        events, 
        ipAddress, 
        userAgent,
        {
          origin,
          host: request.headers.host,
          'x-analytics-key': request.headers['x-analytics-key']
        }
      )
      
      console.log(`Analytics processed: ${result.processed} succeeded, ${result.filtered} filtered`)
      
      return reply.send({
        success: true,
        processed: result.processed,
        filtered: result.filtered,
        timestamp: new Date().toISOString()
      })
      
    } catch (error: any) {
      console.error('Analytics tracking error:', error)
      
      // 幂等冲突返回200，其他错误返回5xx
      if (error.code === 'P2002' || error.message?.includes('UNIQUE constraint')) {
        return reply.send({
          success: true,
          processed: 0,
          filtered: 1,
          message: 'Events already processed (idempotent)',
          timestamp: new Date().toISOString()
        })
      }
      
      return reply.code(500).send({
        error: 'Internal server error',
        message: 'Failed to process analytics events'
      })
    }
  })

  // 概览统计数据
  fastify.get('/api/v1/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const overview = await analyticsService.getOverviewStats()
      
      return reply.send({
        success: true,
        data: overview,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Get overview stats error:', error)
      return reply.code(500).send({
        error: 'Failed to get overview stats',
        message: 'Database error occurred'
      })
    }
  })

  // 时间序列统计数据
  fastify.get('/api/v1/analytics/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { startDate, endDate, granularity } = request.query as { 
        startDate: string; 
        endDate: string; 
        granularity: 'hour' | 'day' | 'month' | 'year' 
      }

      if (!startDate || !endDate || !granularity) {
        return reply.code(400).send({
          error: 'Missing required parameters',
          message: 'startDate, endDate and granularity are required'
        })
      }

      // 验证粒度参数
      const validGranularities = ['hour', 'day', 'month', 'year']
      if (!validGranularities.includes(granularity)) {
        return reply.code(400).send({
          error: 'Invalid granularity',
          message: `granularity must be one of: ${validGranularities.join(', ')}`
        })
      }

      const start = new Date(startDate)
      const end = new Date(endDate)
      
      // 验证日期格式
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return reply.code(400).send({
          error: 'Invalid date format',
          message: 'Dates must be in ISO 8601 format'
        })
      }

      const stats = await analyticsService.getTimeSeriesStats(start, end, granularity)
      
      return reply.send({
        success: true,
        data: stats,
        params: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          granularity
        },
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Get time series stats error:', error)
      return reply.code(500).send({
        error: 'Failed to get time series stats',
        message: 'Database error occurred'
      })
    }
  })

  // 实时数据（最近24小时）
  fastify.get('/api/v1/analytics/realtime', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      
      const hourly = await analyticsService.getTimeSeriesStats(yesterday, now, 'hour')
      
      return reply.send({
        success: true,
        data: {
          hourly,
          timeRange: {
            start: yesterday.toISOString(),
            end: now.toISOString()
          }
        },
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Get realtime stats error:', error)
      return reply.code(500).send({
        error: 'Failed to get realtime stats',
        message: 'Database error occurred'
      })
    }
  })

  // 健康检查接口
  fastify.get('/api/v1/analytics/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 检查数据库连接
      const dbCheck = await analyticsService.getOverviewStats().catch(() => null)
      
      return reply.send({
        status: 'healthy',
        database: dbCheck ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      })
      
    } catch (error) {
      console.error('Analytics health check error:', error)
      return reply.code(503).send({
        status: 'unhealthy',
        error: 'Service unavailable',
        timestamp: new Date().toISOString()
      })
    }
  })

  // 事件幂等检查接口（供测试用）
  fastify.get('/api/v1/analytics/check/:eventId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { eventId } = request.params as { eventId: string }
      
      if (!eventId) {
        return reply.code(400).send({
          error: 'Missing eventId parameter'
        })
      }

      const exists = await analyticsService.checkEventIdExists(eventId)
      
      return reply.send({
        exists,
        eventId,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Event check error:', error)
      return reply.code(500).send({
        error: 'Failed to check event',
        message: 'Database error occurred'
      })
    }
  })

  // 页面访问ID幂等检查接口（供测试用）
  fastify.get('/api/v1/analytics/check/page/:pageViewId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { pageViewId } = request.params as { pageViewId: string }
      
      if (!pageViewId) {
        return reply.code(400).send({
          error: 'Missing pageViewId parameter'
        })
      }

      const exists = await analyticsService.checkPageViewIdExists(pageViewId)
      
      return reply.send({
        exists,
        pageViewId,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('PageView check error:', error)
      return reply.code(500).send({
        error: 'Failed to check pageview',
        message: 'Database error occurred'
      })
    }
  })

  // 第三方对比接口（PV/UV对比）
  fastify.get('/api/v1/analytics/compare/:provider', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { provider } = request.params as { provider: 'ga4' | 'plausible' }
      const { startDate, endDate } = request.query as { startDate: string; endDate: string }
      
      if (!['ga4', 'plausible'].includes(provider)) {
        return reply.code(400).send({
          error: 'Invalid provider',
          message: 'Provider must be either "ga4" or "plausible"'
        })
      }

      const start = new Date(startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      const end = new Date(endDate || new Date().toISOString())
      
      // 获取我们自己的统计数据
      const ourStats = await analyticsService.getTimeSeriesStats(start, end, 'day')
      const ourTotals = ourStats.reduce((acc, day) => ({
        pv: acc.pv + day.pv,
        uv: acc.uv + day.uv
      }), { pv: 0, uv: 0 })

      return reply.send({
        success: true,
        comparison: {
          provider,
          timeRange: {
            start: start.toISOString(),
            end: end.toISOString(),
            days: Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
          },
          ourData: ourTotals,
          thirdPartyData: null, // 需要集成真实的第三方API
          differences: {
            pv: null,
            uv: null,
            pv_percentage: null,
            uv_percentage: null
          }
        },
        note: 'Third party data integration required',
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('Comparison stats error:', error)
      return reply.code(500).send({
        error: 'Failed to get comparison stats',
        message: 'Database error occurred'
      })
    }
  })
}