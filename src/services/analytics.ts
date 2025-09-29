import { PrismaClient } from '@prisma/client'
import { UAParser } from 'ua-parser-js'

const prisma = new PrismaClient()

interface AnalyticsEvent {
  event_id: string
  event_name: string
  visitor_id: string
  session_id: string
  user_id?: string
  schema_version: number
  props: Record<string, any>
  timestamp: string
}

interface PageViewEvent extends AnalyticsEvent {
  page_view_id?: string
  page: string
  title?: string
  referrer?: string
  duration_seconds?: number
}

interface QueueItem {
  type: 'event' | 'pageview' | 'heartbeat'
  data: AnalyticsEvent | PageViewEvent | { page_view_id: string; seconds: number }
}

// 机器人/爬虫过滤
class BotDetector {
  private static readonly botPatterns = [
    /bot/i, /crawler/i, /spider/i, /crawling/i, /scraper/i,
    /headless/i, /phantom/i, /selenium/i, /phantomjs/i, /chrome-lighthouse/i,
    /webpage test/i, /site24x7/i, /uptime/i, /pingdom/i, /monitor/i,
    /check/i, /test/i, /scan/i, /probe/i, /validator/i,
    /facebookexternalhit/i, /twitterbot/i, "/linkedinbot/i",
    /whatsapp/i, /telegrambot/i, /applebot/i, /bingbot/i,
    /yandexbot/i, /baiduspider/i, /duckduckbot/i, /archive/i,
    /ia_archiver/i, /wayback/i, /webster/, /curl/i, /wget/i,
    /python/i, /go-http-client/i, /java/i, /okhttp/i, /http/i,
    /\bcheck\b/i, /\btest\b/i, /\bscanner\b/i
  ]

  static isBot(userAgent: string): boolean {
    if (!userAgent) return true
    
    return this.botPatterns.some(pattern => pattern.test(userAgent))
  }

  static isCrawler(userAgent: string): boolean {
    const crawlerPatterns = [
     /bot/i, /crawler/i, /spider/i, /headless/i,
      /facebookexternalhit/i, /twitterbot/i, /googlebot/i,
      /baiduspider/i, /yandexbot/i, /bingbot/i
    ]
    
    return userAgent && crawlerPatterns.some(pattern => pattern.test(userAgent))
  }
}

export class AnalyticsService {
  
  // 解析客户端IP
  extractClientIP(request: any): string {
    const forwarded = request.headers['x-forwarded-for']
    const realIP = request.headers['x-real-ip']
    const cfConnectingIP = request.headers['cf-connecting-ip']
    
    if (cfConnectingIP) return cfConnectingIP
    if (realIP) return realIP
    if (forwarded) return forwarded.split(',')[0].trim()
    
    return request.ip || '127.0.0.1'
  }

  // 解析User-Agent
  private parseUserAgent(userAgent: string) {
    const parser = new UAParser(userAgent)
    const browser = parser.getBrowser()
    const os = parser.getOS()
    const device = parser.getDevice()
    
    return {
      browser: browser.name || 'Unknown',
      os: os.name || 'Unknown',
      device: device.type || 'desktop'
    }
  }

  // 批量处理事件
  async processEventBatch(events: QueueItem[], ipAddress: string, userAgent?: string, requestHeaders?: any): Promise<{ processed: number; filtered: number }> {
    let processed = 0
    let filtered = 0
    
    // 1. 机器人过滤
    if (BotDetector.isBot(userAgent || '')) {
      console.log('Bot detected:', userAgent)
      return { processed: 0, filtered: events.length }
    }

    // 2. Origin校验（可选）
    if (requestHeaders?.origin && requestHeaders?.host) {
      const allowedOrigins = [
        process.env.NEXT_PUBLIC_DOMAIN || 'https://shortdramini.com',
        'http://localhost:3000',
        'https://dramini-web.vercel.app'
      ]
      
      const origin = requestHeaders.origin.toLowerCase()
      const isAllowed = allowedOrigins.some(allowed => 
        origin.includes(allowed.replace('https://', '').replace(/^https?\:\/\//, ''))
      )
      
      if (!isAllowed) {
        console.warn('Origin not allowed:', origin)
        filtered++
        // 不阻断，仅记录警告
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const parsedUA = this.parseUserAgent(userAgent || '')
        
        for (const item of events) {
          try {
            await this.processSingleEvent(item, ipAddress, parsedUA, tx)
            processed++
          } catch (error: any) {
            if (error.code === 'P2002' || error.message?.includes('UNIQUE constraint')) {
              // 幂等冲突，忽略
              console.log('Event already processed:', item.data.event_id || item.data.page_view_id)
              filtered++
            } else {
              console.error('Event processing error:', error)
              throw error
            }
          }
        }
      })
      
      console.log(`Analytics batch processed: ${processed} events, ${filtered} filtered`)
    
    } catch (error) {
      console.error('Batch processing failed:', error)
      throw error
    }

    return { processed, filtered }
  }

  // 处理单个事件
  private async processSingleEvent(
    event: QueueItem, 
    ipAddress: string, 
    userAgentInfo: any, 
    tx: any
  ): Promise<void> {
    
    if (event.type === 'pageview') {
      const pvData = event.data as PageViewEvent
      
      // 1. 记录会话
      await this.trackSession(pvData.visitor_id, pvData.session_id, pvData.user_id, ipAddress, userAgentInfo, tx)
      
      // 2. 记录页面访问
      await tx.pageView.create({
        data: {
          page_view_id: pvData.page_view_id!,
          visitor_id: pvData.visitor_id,
          session_id: pvData.session_id,
          user_id: pvData.user_id,
          page: pvData.page,
          title: pvData.title,
          referrer: pvData.referrer
        }
      })
      
      // 3. 更新统计数据
      await this.updateStatsCounters('pv', tx)
      
    } else if (event.type === 'event') {
      const eventData = event.data as AnalyticsEvent
      
      // 1. 记录会话
      await this.trackSession(eventData.visitor_id, eventData.session_id, eventData.user_id, ipAddress, userAgentInfo, tx)
      
      // 2. 记录事件
      await tx.userEvent.create({
        data: {
          event_id: eventData.event_id,
          visitor_id: eventData.visitor_id,
          session_id: eventData.session_id,
          user_id: eventData.user_id,
          event_name: eventData.event_name,
          schema_version: eventData.schema_version,
          props: eventData.props
        }
      })
      
      // 3. 更新统计数据（根据事件类型）
      if (eventData.event_name === 'user_register') {
        await this.updateStatsCounters('registrations', tx)
      } else if (eventData.event_name === 'video_play') {
        await this.updateStatsCounters('viewers', tx)
      }
      
    } else if (event.type === 'heartbeat') {
      const heartbeatData = event.data as { page_view_id: string; seconds: number }
      
      // 记录心跳增量
      await tx.pageViewHeartbeat.create({
        data: {
          page_view_id: heartbeatData.page_view_id,
          duration_delta: heartbeatData.seconds
        }
      })
      
      // 更新PageView的总时长
      await tx.pageView.updateMany({
        where: { page_view_id: heartbeatData.page_view_id },
        data: {
          duration_seconds: { increment: heartbeatData.seconds }
        }
      })
    }
  }

  // 会话管理
  private async trackSession(
    visitorId: string, 
    sessionId: string, 
    userId: string | undefined, 
    ipAddress: string, 
    userAgentInfo: any, 
    tx: any
  ): Promise<void> {
    
    const now = new Date()
    
    // 查找现有会话
    const existingSession = await tx.userSession.findFirst({
      where: { visitorId, sessionId }
    })
    
    if (existingSession) {
      // 更新现有会话
      await tx.userSession.update({
        where: { id: existingSession.id },
        data: {
          userId,
          ipAddress,
          userAgent: userAgentInfo.browser,
          device: userAgentInfo.device,
          browser: userAgentInfo.browser,
          os: userAgentInfo.os,
          lastVisit: now,
          visitCount: { increment: 1 }
        }
      })
    } else {
      // 创建新会话
      await tx.userSession.create({
        data: {
          visitor_id: visitorId,
          session_id: sessionId,
          userId,
          ipAddress,
          userAgent: userAgentInfo.browser,
          device: userAgentInfo.device,
          browser: userAgentInfo.browser,
          os: userAgentInfo.os,
          firstVisit: now,
          lastVisit: now,
          visitCount: 1
        }
      })
      
      // 更新UV计数
      await this.updateStatsCounters('uv', tx)
    }
  }

  // 统计数据计数更新
  private async updateStatsCounters(type: 'pv' | 'uv' | 'registrations' | 'viewers', tx: any): Promise<void> {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const hour = now.getHours()

    // 更新小时统计
    await this.upsertHourlyStats(today, hour, type, tx)
    
    // 更新日统计
    await this.upsertDailyStats(today, type, tx)
  }

  private async upsertHourlyStats(date: Date, hour: number, type: string, tx: any): Promise<void> {
    const existing = await tx.websiteStatsHourly.findFirst({
      where: { date, hour }
    })

    if (existing) {
      await tx.websiteStatsHourly.update({
        where: { id: existing.id },
        data: { [type]: { increment: 1 } }
      })
    } else {
      await tx.websiteStatsHourly.create({
        data: {
          date,
          hour,
          pv: type === 'pv' ? 1 : 0,
          uv: type === 'uv' ? 1 : 0,
          registrations: type === 'registrations' ? 1 : 0,
          viewers: type === 'viewers' ? 1 : 0
        }
      })
    }
  }

  private async upsertDailyStats(date: Date, type: string, tx: any): Promise<void> {
    const existing = await tx.websiteStatsDaily.findFirst({
      where: { date }
    })

    if (existing) {
      await tx.websiteStatsDaily.update({
        where: { id: existing.id },
        data: { [type]: { increment: 1 } }
      })
    } else {
      await tx.websiteStatsDaily.create({
        data: {
          date,
          pv: type === 'pv' ? 1 : 0,
          uv: type === 'uv' ? 1 : 0,
          registrations: type === 'registrations' ? 1 : 0,
          viewers: type === 'viewers' ? 1 : 0
        }
      })
    }
  }

  // 获取统计数据
  async getOverviewStats() {
    const today = new Date()
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    today.setHours(0, 0, 0, 0)
    yesterday.setHours(0, 0, 0, 0)

    const currentWeekStart = new Date(today)
    currentWeekStart.setDate(today.getDate() - today.getDay())

    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const [todayStats, yesterdayStats, weekStats, monthStats] = await Promise.all([
      this.getStatsByDateRange(today, today),
      this.getStatsByDateRange(yesterday, yesterday),
      this.getStatsByDateRange(currentWeekStart, today),
      this.getStatsByDateRange(currentMonthStart, today)
    ])

    return {
      today: todayStats,
      yesterday: yesterdayStats,
      currentWeek: weekStats,
      currentMonth: monthStats
    }
  }

  private async getStatsByDateRange(startDate: Date, endDate: Date) {
    const stats = await prisma.websiteStatsDaily.aggregate({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      _sum: {
        pv: true,
        uv: true,
        registrations: true,
        viewers: true
      }
    })

    return {
      pv: Number(stats._sum.pv || 0),
      uv: Number(stats._sum.uv || 0),
      registrations: Number(stats._sum.registrations || 0),
      viewers: Number(stats._sum.viewers || 0)
    }
  }

  async getTimeSeriesStats(startDate: Date, endDate: Date, granularity: 'hour' | 'day' | 'month' | 'year') {
    if (granularity === 'hour') {
      // 按小时查询
      const stats = await prisma.websiteStatsHourly.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: [{ date: 'asc' }, { hour: 'asc' }]
      })

      return stats.map(stat => ({
        date: stat.date,
        hour: stat.hour,
        pv: Number(stat.pv),
        uv: Number(stat.uv),
        registrations: Number(stat.registrations),
        viewers: Number(stat.viewers)
      }))
    } else {
      // 按天/月/年查询
      const stats = await prisma.websiteStatsDaily.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { date: 'asc' }
      })

      // 按粒度聚合
      return this.aggregateByGranularity(stats, granularity)
    }
  }

  private aggregateByGranularity(stats: any[], granularity: string) {
    const grouped: { [key: string]: any } = {}

    stats.forEach(stat => {
      let key: string
      let displayDate: Date = stat.date

      if (granularity === 'day') {
        key = stat.date.toISOString().split('T')[0]
      } else if (granularity === 'month') {
        key = `${stat.date.getFullYear()}-${stat.date.getMonth() + 1}`
        displayDate = new Date(stat.date.getFullYear(), stat.date.getMonth(), 1)
      } else { // year
        key = `${stat.date.getFullYear()}`
        displayDate = new Date(stat.date.getFullYear(), 0, 1)
      }

      if (!grouped[key]) {
        grouped[key] = {
          date: displayDate,
          hour: undefined,
          pv: 0,
          uv: 0,
          registrations: 0,
          viewers: 0
        }
      }

      grouped[key].pv += Number(stat.pv)
      grouped[key].uv += Number(stat.uv)
      grouped[key].registrations += Number(stat.registrations)
      grouped[key].viewers += Number(stat.viewers)
    })

    return Object.values(grouped).sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  // 事件ID幂等检查（可选，用于验证）
  async checkEventIdExists(eventId: string): Promise<boolean> {
    const exists = await prisma.userEvent.findUnique({
      where: { event_id: eventId },
      select: { id: true }
    })
    return !!exists
  }

  // 页面访问ID幂等检查
  async checkPageViewIdExists(pageViewId: string): Promise<boolean> {
    const exists = await prisma.pageView.findUnique({
      where: { page_view_id: pageViewId },
      select: { id: true }
    })
    return !!exists
  }
}