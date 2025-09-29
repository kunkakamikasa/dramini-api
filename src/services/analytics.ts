import { PrismaClient } from '@prisma/client'
import { FastifyRequest } from 'fastify'

const prisma = new PrismaClient()

export interface AnalyticsData {
  sessionId: string
  userId?: string
  ipAddress: string
  userAgent?: string
  referrer?: string
  page?: string
  title?: string
  eventType?: string
  eventData?: any
}

export class AnalyticsService {
  // 生成会话ID
  generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 获取客户端IP地址
  getClientIP(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'] as string
    const realIP = request.headers['x-real-ip'] as string
    const remoteAddress = request.ip
    
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    if (realIP) {
      return realIP
    }
    return remoteAddress || 'unknown'
  }

  // 解析User-Agent
  parseUserAgent(userAgent: string) {
    const ua = userAgent.toLowerCase()
    
    // 设备类型
    let device = 'desktop'
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      device = 'mobile'
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      device = 'tablet'
    }

    // 浏览器
    let browser = 'unknown'
    if (ua.includes('chrome')) browser = 'chrome'
    else if (ua.includes('firefox')) browser = 'firefox'
    else if (ua.includes('safari')) browser = 'safari'
    else if (ua.includes('edge')) browser = 'edge'

    // 操作系统
    let os = 'unknown'
    if (ua.includes('windows')) os = 'windows'
    else if (ua.includes('mac')) os = 'macos'
    else if (ua.includes('linux')) os = 'linux'
    else if (ua.includes('android')) os = 'android'
    else if (ua.includes('ios')) os = 'ios'

    return { device, browser, os }
  }

  // 记录用户会话
  async trackSession(data: AnalyticsData) {
    try {
      const { userAgent, ...otherData } = data
      const { device, browser, os } = userAgent ? this.parseUserAgent(userAgent) : { device: 'unknown', browser: 'unknown', os: 'unknown' }

      // 检查会话是否已存在
      const existingSession = await prisma.userSession.findUnique({
        where: { sessionId: data.sessionId }
      })

      if (existingSession) {
        // 更新现有会话
        await prisma.userSession.update({
          where: { sessionId: data.sessionId },
          data: {
            lastVisit: new Date(),
            visitCount: { increment: 1 },
            userId: data.userId || existingSession.userId
          }
        })
      } else {
        // 创建新会话
        await prisma.userSession.create({
          data: {
            sessionId: data.sessionId,
            userId: data.userId,
            ipAddress: data.ipAddress,
            userAgent,
            referrer: data.referrer,
            device,
            browser,
            os,
            firstVisit: new Date(),
            lastVisit: new Date(),
            visitCount: 1
          }
        })
      }
    } catch (error) {
      console.error('Track session error:', error)
    }
  }

  // 记录页面访问
  async trackPageView(data: AnalyticsData) {
    try {
      await prisma.pageView.create({
        data: {
          sessionId: data.sessionId,
          userId: data.userId,
          page: data.page || '/',
          title: data.title,
          referrer: data.referrer
        }
      })

      // 更新统计数据
      await this.updateStats('pv')
    } catch (error) {
      console.error('Track page view error:', error)
    }
  }

  // 记录用户事件
  async trackEvent(data: AnalyticsData) {
    try {
      await prisma.userEvent.create({
        data: {
          sessionId: data.sessionId,
          userId: data.userId,
          eventType: data.eventType || 'unknown',
          eventData: data.eventData ? JSON.stringify(data.eventData) : null
        }
      })

      // 根据事件类型更新统计数据
      if (data.eventType === 'register') {
        await this.updateStats('registrations')
      } else if (data.eventType === 'video_play') {
        await this.updateStats('viewers')
      }
    } catch (error) {
      console.error('Track event error:', error)
    }
  }

  // 更新统计数据
  async updateStats(type: 'pv' | 'uv' | 'registrations' | 'viewers') {
    try {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const hour = now.getHours()

      // 更新小时统计
      const existingHourStats = await prisma.websiteStats.findFirst({
        where: {
          date: today,
          hour: hour
        }
      })

      if (existingHourStats) {
        await prisma.websiteStats.update({
          where: { id: existingHourStats.id },
          data: {
            [type]: { increment: 1 }
          }
        })
      } else {
        await prisma.websiteStats.create({
          data: {
            date: today,
            hour: hour,
            pv: type === 'pv' ? 1 : 0,
            uv: type === 'uv' ? 1 : 0,
            registrations: type === 'registrations' ? 1 : 0,
            viewers: type === 'viewers' ? 1 : 0
          }
        })
      }

      // 更新日统计
      const existingDayStats = await prisma.websiteStats.findFirst({
        where: {
          date: today,
          hour: null
        }
      })

      if (existingDayStats) {
        await prisma.websiteStats.update({
          where: { id: existingDayStats.id },
          data: {
            [type]: { increment: 1 }
          }
        })
      } else {
        await prisma.websiteStats.create({
          data: {
            date: today,
            hour: null,
            pv: type === 'pv' ? 1 : 0,
            uv: type === 'uv' ? 1 : 0,
            registrations: type === 'registrations' ? 1 : 0,
            viewers: type === 'viewers' ? 1 : 0
          }
        })
      }
    } catch (error) {
      console.error('Update stats error:', error)
    }
  }

  // 计算UV（独立访客数）
  async calculateUV(date: Date, hour?: number) {
    try {
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

      let whereClause: any = {
        firstVisit: {
          gte: startOfDay,
          lt: endOfDay
        }
      }

      if (hour !== undefined) {
        const startOfHour = new Date(startOfDay.getTime() + hour * 60 * 60 * 1000)
        const endOfHour = new Date(startOfHour.getTime() + 60 * 60 * 1000)
        
        whereClause.firstVisit = {
          gte: startOfHour,
          lt: endOfHour
        }
      }

      const uniqueVisitors = await prisma.userSession.count({
        where: whereClause
      })

      return uniqueVisitors
    } catch (error) {
      console.error('Calculate UV error:', error)
      return 0
    }
  }

  // 获取统计数据
  async getStats(startDate: Date, endDate: Date, granularity: 'hour' | 'day' | 'month' | 'year' = 'day') {
    try {
      const stats = await prisma.websiteStats.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          },
          hour: granularity === 'hour' ? { not: null } : null
        },
        orderBy: [
          { date: 'asc' },
          { hour: 'asc' }
        ]
      })

      // 重新计算UV（因为UV需要实时计算）
      const statsWithUV = await Promise.all(
        stats.map(async (stat) => {
          const uv = await this.calculateUV(stat.date, stat.hour || undefined)
          return {
            ...stat,
            uv
          }
        })
      )

      return statsWithUV
    } catch (error) {
      console.error('Get stats error:', error)
      return []
    }
  }

  // 获取概览数据
  async getOverviewStats() {
    try {
      const today = new Date()
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

      // 今日数据
      const todayStats = await this.getStats(today, today, 'day')
      const todayData = todayStats[0] || { pv: 0, uv: 0, registrations: 0, viewers: 0 }

      // 昨日数据
      const yesterdayStats = await this.getStats(yesterday, yesterday, 'day')
      const yesterdayData = yesterdayStats[0] || { pv: 0, uv: 0, registrations: 0, viewers: 0 }

      // 本周数据
      const weekStats = await this.getStats(lastWeek, today, 'day')
      const weekData = weekStats.reduce((acc, stat) => ({
        pv: acc.pv + stat.pv,
        uv: acc.uv + stat.uv,
        registrations: acc.registrations + stat.registrations,
        viewers: acc.viewers + stat.viewers
      }), { pv: 0, uv: 0, registrations: 0, viewers: 0 })

      // 本月数据
      const monthStats = await this.getStats(lastMonth, today, 'day')
      const monthData = monthStats.reduce((acc, stat) => ({
        pv: acc.pv + stat.pv,
        uv: acc.uv + stat.uv,
        registrations: acc.registrations + stat.registrations,
        viewers: acc.viewers + stat.viewers
      }), { pv: 0, uv: 0, registrations: 0, viewers: 0 })

      return {
        today: todayData,
        yesterday: yesterdayData,
        week: weekData,
        month: monthData
      }
    } catch (error) {
      console.error('Get overview stats error:', error)
      return {
        today: { pv: 0, uv: 0, registrations: 0, viewers: 0 },
        yesterday: { pv: 0, uv: 0, registrations: 0, viewers: 0 },
        week: { pv: 0, uv: 0, registrations: 0, viewers: 0 },
        month: { pv: 0, uv: 0, registrations: 0, viewers: 0 }
      }
    }
  }
}
