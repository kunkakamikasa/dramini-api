import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// 内存存储（生产环境应该用数据库）
interface AnalyticsEvent {
  event_id: string
  event_name: string
  visitor_id: string
  session_id: string
  user_id?: string
  props: any
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

function getOverviewStats() {
  const today = normalizeDate(new Date()).toISOString().split('T')[0]
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekStart = normalizeDate(weekAgo).toISOString().split('T')[0]
  
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 30)
  const monthStart = normalizeDate(monthAgo).toISOString().split('T')[0]
  
  let todayPv = 0, todayUv = 0, weekPv = 0, weekUv = 0, monthPv = 0, monthUv = 0
  let todayRegistrations = 0, weekRegistrations = 0, monthRegistrations = 0
  const allVisitors = new Set<string>()
  const weekVisitors = new Set<string>()
  const monthVisitors = new Set<string>()
  
  for (const [key, stats] of statsStore.entries()) {
    const statDate = stats.date
    
    if (statDate === today) {
      todayPv += stats.pv
      todayRegistrations += stats.registrations
      stats.uv.forEach(v => allVisitors.add(v))
    }
    
    if (statDate >= weekStart) {
      weekPv += stats.pv
      weekRegistrations += stats.registrations
      stats.uv.forEach(v => weekVisitors.add(v))
    }
    
    if (statDate >= monthStart) {
      monthPv += stats.pv
      monthRegistrations += stats.registrations
      stats.uv.forEach(v => monthVisitors.add(v))
    }
  }
  
  return {
    today: {
      pv: todayPv,
      uv: allVisitors.size,
      registrations: todayRegistrations,
      viewers: allVisitors.size
    },
    week: {
      pv: weekPv,
      uv: weekVisitors.size,
      registrations: weekRegistrations,
      viewers: weekVisitors.size
    },
    month: {
      pv: monthPv,
      uv: monthVisitors.size,
      registrations: monthRegistrations,
      viewers: monthVisitors.size
    }
  }
}

export async function analyticsRealRoutes(fastify: FastifyInstance) {
  
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
      
      console.log(`Processed ${processed}/${events.length} analytics events, total stored: ${eventsStore.length}`)
      
      return reply.send({
        success: true,
        processed: processed,
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

  // Analytics overview
  fastify.get('/api/v1/analytics/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = getOverviewStats()
      
      return reply.send({
        success: true,
        data: stats,
        metadata: {
          totalEvents: eventsStore.length,
          totalDays: statsStore.size,
          lastUpdate: new Date().toISOString()
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

  // Analytics stats
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
        // 使用新的 startDate/endDate 参数
        startDate = new Date(startDateParam)
        endDate = new Date(endDateParam)
      } else {
        // 使用旧的 days 参数（向后兼容）
        const daysCount = parseInt(days || '7')
        endDate = new Date()
        startDate = new Date()
        startDate.setDate(endDate.getDate() - daysCount)
      }
      
      const stats = []
      
      // 支持startDate到endDate的精确时间范围
      const currentDate = new Date(startDate)
      while (currentDate <= endDate) {
        
        if (granularity === 'hour') {
          // 收集当天所有小时数据并去重
          const hourDataMap = new Map()
          for (let h = 0; h < 24; h++) {
            const hourKey = generateStatsKey(currentDate, h)
            const hourStats = statsStore.get(hourKey)
            if (hourStats) {
              const uniqueHourKey = `${hourStats.date}-${hourStats.hour}`
              if (!hourDataMap.has(uniqueHourKey)) {
                hourDataMap.set(uniqueHourKey, {
                  date: hourStats.date,
                  hour: hourStats.hour,
                  pv: hourStats.pv,
                  uv: hourStats.uv.size,
                  registrations: hourStats.registrations,
                  viewers: hourStats.viewers.size
                })
              } else {
                // 合并重复的小时数据
                const existing = hourDataMap.get(uniqueHourKey)
                existing.pv += hourStats.pv
                existing.uv = Math.max(existing.uv, hourStats.uv.size)
                existing.registrations += hourStats.registrations
                existing.viewers = Math.max(existing.viewers, hourStats.viewers.size)
              }
            }
          }
          
          // 将去重后的数据添加到stats数组
          for (const hourData of hourDataMap.values()) {
            stats.push(hourData)
          }
        } else {
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
        }
        
        // 移动到下一个时间单位
        if (granularity === 'hour') {
          currentDate.setHours(currentDate.getHours() + 1)
        } else {
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
