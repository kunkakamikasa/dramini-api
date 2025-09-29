import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

interface AnalyticsEvent {
  event_id: string
  visitor_id: string
  session_id: string
  event_name: string
  props: Record<string, any>
  created_at: string
}

interface AnalyticsStats {
  date: string
  hour?: number
  pv: number
  uv: Set<string>
  registrations: number
  viewers: Set<string>
}

// 全局数据存储
const eventsStore: AnalyticsEvent[] = []
const statsStore: Map<string, AnalyticsStats> = new Map()

function generateStatsKey(date: Date, hour?: number): string {
  const key = date.toISOString().split('T')[0]
  return hour !== undefined ? `${key}-${hour}` : key
}

function normalizeDate(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function processEvent(event: AnalyticsEvent) {
  const timestamp = new Date(event.created_at)
  const isPM = event.event_name === 'page_view'
  const isUV = event.event_name === 'page_view'
  const isRegistration = event.event_name === 'registration'
  const isViewer = event.event_name === 'video_play'
  
  // 按日期和小聚合
  const dateKey = generateStatsKey(timestamp)
  const hourKey = generateStatsKey(timestamp, timestamp.getHours())
  
  if (!statsStore.has(dateKey)) {
    statsStore.set(dateKey, {
      date: normalizeDate(timestamp).toISOString().split('T')[0],
      pv: 0,
      uv: new Set(),
      registrations: 0,
      viewers: new Set()
    })
  }
  
  if (!statsStore.has(hourKey)) {
    statsStore.set(hourKey, {
      date: normalizeDate(timestamp).toISOString().split('T')[0],
      hour: timestamp.getHours(),
      pv: 0,
      uv: new Set(),
      registrations: 0,
      viewers: new Set()
    })
  }
  
  const dailyStats = statsStore.get(dateKey)!
  const hourlyStats = statsStore.get(hourKey)!
  
  // 更新统计数据
  if (isPM) {
    dailyStats.pv++
    hourlyStats.pv++
  }
  
  if (isUV) {
    dailyStats.uv.add(event.visitor_id)
    hourlyStats.uv.add(event.visitor_id)
  }
  
  if (isRegistration) {
    dailyStats.registrations++
    hourlyStats.registrations++
  }
  
  if (isViewer) {
    dailyStats.viewers.add(event.visitor_id)
    hourlyStats.viewers.add(event.visitor_id)
  }
}

export default async function analyticsRealRoutes(fastify: FastifyInstance) {
  // Analytics health check
  fastify.get('/api/v1/analytics/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      message: 'Analytics service is running (real data)',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      storedEvents: eventsStore.length,
      storedStats: statsStore.size
    })
  })

  // Analytics track endpoint
  fastify.post('/api/v1/analytics/track', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { events } = request.body as { events: AnalyticsEvent[] }
      
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

      // Process each event
      let processed = 0
      for (const event of events) {
        if (event.event_id && event.event_name && event.visitor_id && event.session_id) {
          // 检查重复事件（幂等性）
          if (!eventsStore.find(e => e.event_id === event.event_id)) {
            eventsStore.push(event)
            processEvent(event)
            processed++
          }
        }
      }

      return reply.send({
        success: true,
        processed,
        totalStored: eventsStore.length,
        message: 'Events processed successfully'
      })
    } catch (error) {
      console.error('Analytics track error:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to process analytics events'
      })
    }
  })

  // Analytics overview endpoint
  fastify.get('/api/v1/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const today = new Date()
      const yesterday = new Date()
      yesterday.setDate(today.getDate() - 1)
      const weekAgo = new Date()
      weekAgo.setDate(today.getDate() - 7)
      const monthAgo = new Date()
      monthAgo.setDate(today.getDate() - 30)

      const todayKey = generateStatsKey(today)
      const yesterdayKey = generateStatsKey(yesterday)
      const weekKey = generateStatsKey(weekAgo)
      const monthKey = generateStatsKey(monthAgo)

      const todayStats = statsStore.get(todayKey) || { pv: 0, uv: new Set(), registrations: 0, viewers: new Set() }
      const weekStats = statsStore.get(weekKey) || { pv: 0, uv: new Set(), registrations: 0, viewers: new Set() }
      const monthStats = statsStore.get(monthKey) || { pv: 0, uv: new Set(), registrations: 0, viewers: new Set() }

      return reply.send({
        success: true,
        data: {
          today: {
            pv: todayStats.pv,
            uv: todayStats.uv.size,
            registrations: todayStats.registrations,
            viewers: todayStats.viewers.size
          },
          week: {
            pv: weekStats.pv,
            uv: weekStats.uv.size,
            registrations: weekStats.registrations,
            viewers: weekStats.viewers.size
          },
          month: {
            pv: monthStats.pv,
            uv: monthStats.uv.size,
            registrations: monthStats.registrations,
            viewers: monthStats.viewers.size
          }
        }
      })
    } catch (error) {
      console.error('Analytics overview error:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch analytics overview'
      })
    }
  })

  // Analytics stats endpoint - SIMPLIFIED VERSION
  fastify.get('/api/v1/analytics/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { granularity = 'day', days, startDate: startDateParam, endDate: endDateParam } = request.query as {
        granularity?: string;
        days?: string;
        startDate?: string;
        endDate?: string
      }

      let startDate: Date, endDate: Date

      if (startDateParam && endDateParam) {
        startDate = new Date(startDateParam)
        endDate = new Date(endDateParam)
      } else {
        const daysCount = parseInt(days || '7')
        endDate = new Date()
        startDate = new Date()
        startDate.setDate(endDate.getDate() - daysCount)
      }

      const stats = []

      if (granularity === 'hour') {
        // 小时级数据：直接遍历statsStore，按小时去重
        const hourMap = new Map<string, any>()
        
        for (const [key, hourStats] of statsStore.entries()) {
          // 只处理小时级别的数据
          if (hourStats.hour !== undefined) {
            const hourKey = `${hourStats.date}-${hourStats.hour}`
            if (!hourMap.has(hourKey)) {
              hourMap.set(hourKey, {
                date: hourStats.date,
                hour: hourStats.hour,
                pv: hourStats.pv,
                uv: hourStats.uv.size,
                registrations: hourStats.registrations,
                viewers: hourStats.viewers.size
              })
            }
          }
        }
        
        // 转换为数组
        stats.push(...hourMap.values())
      } else {
        // 天级数据：按日期范围循环
        const currentDate = new Date(startDate)
        while (currentDate <= endDate) {
          const dateKey = generateStatsKey(currentDate)
          const dayStats = statsStore.get(dateKey)
          if (dayStats) {
            stats.push({
              date: dayStats.date,
              pv: dayStats.pv,
              uv: dayStats.uv.size,
              registrations: dayStats.registrations,
              viewers: dayStats.viewers.size
            })
          }
          currentDate.setDate(currentDate.getDate() + 1)
        }
      }

      return reply.send({
        success: true,
        data: {
          granularity,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          stats: stats
        },
        metadata: {
          totalEvents: eventsStore.length,
          statsCount: statsStore.size
        }
      })
    } catch (error) {
      console.error('Analytics stats error:', error)
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch analytics stats'
      })
    }
  })
}
