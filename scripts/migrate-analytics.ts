/**
 * Analytics Schema Migration Script
 * 
 * This script migrates from the old analytics schema to the new professional analytics schema.
 * Run with: npx tsx scripts/migrate-analytics.ts
 */

import { PrismaClient } from '@prisma/client'
import { Migrate } from '@prisma/migrate'

const prisma = new PrismaClient()

async function migrateOldAnalyticsData() {
  console.log('🚀 Starting Analytics Schema Migration...')
  
  try {
    // 1. 迁移旧的统计数据
    console.log('📊 Migrating old website stats...')
    
    const oldStats = await prisma.$queryRaw`
      SELECT date, hour, pv, uv, registrations, viewers 
      FROM website_stats 
      ORDER BY date, hour ASC
    `.catch(() => [])
    
    if (oldStats.length > 0) {
      console.log(`Found ${oldStats.length} old stats records`)
      
      for (const stat of oldStats) {
        if (stat.hour !== null) {
          // 小时数据迁移到WebsiteStatsHourly
          await prisma.websiteStatsHourly.upsert({
            where: { 
              date_hour: {
                date: stat.date,
                hour: stat.hour
              }
            },
            update: {
              pv: BigInt(stat.pv || 0),
              uv: BigInt(stat.uv || 0),
              registrations: BigInt(stat.registrations || 0),
              viewers: BigInt(stat.viewers || 0)
            },
            create: {
              date: stat.date,
              hour: stat.hour,
              pv: BigInt(stat.pv || 0),
              uv: BigInt(stat.uv || 0), 
              registrations: BigInt(stat.registrations || 0),
              viewers: BigInt(stat.viewers || 0)
            }
          })
        } else {
          // 日数据迁移到WebsiteStatsDaily
          await prisma.websiteStatsDaily.upsert({
            where: { date: stat.date },
            update: {
              pv: BigInt(stat.pv || 0),
              uv: BigInt(stat.uv || 0),
              registrations: BigInt(stat.registrations || 0), 
              viewers: BigInt(stat.viewers || 0)
            },
            create: {
              date: stat.date,
              pv: BigInt(stat.pv || 0),
              uv: BigInt(stat.uv || 0),
              registrations: BigInt(stat.registrations || 0),
              viewers: BigInt(stat.viewers || 0)
            }
          })
        }
      }
      
      console.log('✅ Old website stats migrated successfully')
    } else {
      console.log('ℹ️ No old website stats found')
    }

    // 2. 迁移页面访问数据
    console.log('📄 Migrating page views...')
    
    const oldPageViews = await prisma.$queryRaw`
      SELECT id, "sessionId" as session_id, "userId" as user_id, 
             page, title, referrer, duration, "createdAt"
      FROM page_views 
      ORDER BY "createdAt" ASC
    `.catch(() => [])
    
    if (oldPageViews.length > 0) {
      console.log(`Found ${oldPageViews.length} old page view records`)
      
      for (const pv of oldPageViews) {
        // 为每个旧的页面访问生成UUID
        const pageViewId = `${pv.id}_migrated_${Date.now()}`
        
        // 迁移到新表 - 这里需要重建关联，因为旧schema没有visitor_id
        await prisma.pageView.create({
          data: {
            page_view_id: pageViewId,
            visitor_id: `migrated_session_${pv.session_id}`, // 使用session_id作为临时visitor_id
            session_id: pv.session_id || 'unknown_session',
            user_id: pv.user_id,
            page: pv.page,
            title: pv.title,
            referrer: pv.referrer,
            duration_seconds: pv.duration || 0,
            created_at: pv.createdAt
          }
        })
      }
      
      console.log('✅ Page views migrated successfully')
    } else {
      console.log('ℹ️ No old page views found')
    }

    // 3. 创建索引（如果需要）
    console.log('🔍 Creating indexes...')
    
    try {
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_user_events_visitor_id ON user_events (visitor_id);
      `
      
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events (created_at);
      `
      
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON page_views (visitor_id);
      `
      
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views (created_at);
      `
      
      console.log('✅ Indexes created successfully')
    } catch (indexError) {
      console.warn('⚠️ Index creation warning:', indexError)
    }

    console.log('🎉 Migration completed successfully!')
    
    // 输出迁移统计
    const hourlyCount = await prisma.websiteStatsHourly.count()
    const dailyCount = await prisma.websiteStatsDaily.count()
    const pageViewCount = await prisma.pageView.count()
    const eventCount = await prisma.userEvent.count()
    const sessionCount = await prisma.userSession.count()
    
    console.log('\n📈 Migration Summary:')
    console.log(`- Hourly stats: ${hourlyCount} records`)
    console.log(`- Daily stats: ${dailyCount} records`) 
    console.log(`- Page views: ${pageViewCount} records`)
    console.log(`- User events: ${eventCount} records`)
    console.log(`- User sessions: ${sessionCount} records`)
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Script entry point
if (require.main === module) {
  migrateOldAnalyticsData()
    .then(() => {
      console.log('✅ Migration script completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error)
      process.exit(1)
    })
}

export { migrateOldAnalyticsData }
