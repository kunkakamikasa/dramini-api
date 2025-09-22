import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PrismaClient } from '@prisma/client'
import Stripe from 'stripe'

// 收费策略计算函数
function calculateEpisodePricing(title: any, episode: any) {
  // 检查是否有自定义收费策略
  if (title.pricingOverride && title.pricingOverride.customStrategy) {
    const freeUntil = title.pricingOverride.customFreeEpisodes || 0
    const episodePrice = title.pricingOverride.customEpisodePrice || 100
    
    return {
      isFree: episode.epNumber <= freeUntil,
      priceCoins: episode.epNumber <= freeUntil ? 0 : episodePrice
    }
  }
  
  // 使用全局策略（默认前3集免费，单集100金币）
  const freeUntil = title.freeUntilEpisode || 3
  const episodePrice = 100 // 默认单集价格
  
  return {
    isFree: episode.epNumber <= freeUntil,
    priceCoins: episode.epNumber <= freeUntil ? 0 : episodePrice
  }
}

function calculateSeriesPricing(episodeCount: number, title: any) {
  // 检查是否有自定义整部剧价格
  if (title.bundlePriceCoins) {
    return title.bundlePriceCoins
  }
  
  // 使用分层定价
  if (episodeCount <= 20) return 1200
  if (episodeCount <= 40) return 2000
  if (episodeCount <= 60) return 2800
  return 3500
}

const app = Fastify({ logger: true })
const prisma = new PrismaClient()

// 初始化Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
})

// Register CORS
app.register(cors, {
  origin: ['http://localhost:3000'],
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  credentials: false
})

app.get('/api/v1/health', async () => ({ ok: true }))
app.get('/health', async () => ({ ok: true }))

// 1) 列表：?category= 可选
app.get('/api/v1/public/titles', async (req, reply) => {
  try {
    const q = (req.query as any) || {}
    let where: any = {}
    let orderBy: any = { createdAt: 'desc' }
    
    if (q.category === 'new') {
      // 特殊处理：返回最新发布的内容
      where = { isOnline: true, status: { in: ['DRAFT', 'PUBLISHED'] } }
      orderBy = { createdAt: 'desc' } // 使用 createdAt 替代 releaseAt
    } else if (q.category) {
      // 普通分类查询
      where = { category: { slug: String(q.category) } }
    }
    
    const items = await prisma.title.findMany({
      where,
      select: { 
        id: true, 
        slug: true, 
        name: true, 
        coverUrl: true, 
        createdAt: true,
        rating: true
      },
      orderBy, 
      take: 20
    })
    
    // 转换数据格式以匹配前台需求
    const formattedItems = items.map(item => ({
      id: item.id,
      slug: item.slug,
      title: item.name,
      cover: item.coverUrl?.startsWith('http') 
        ? item.coverUrl 
        : `http://localhost:3001${item.coverUrl}` || 'https://via.placeholder.com/300x450',
      rating: item.rating,
      tags: [],
      description: '',
      episodes: 0
    }))
    
    return { ok: true, items: formattedItems }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// 2) 详情：/titles/:slug
app.get('/api/v1/public/titles/:slug', async (req, reply) => {
  try {
    const { slug } = req.params as any
    const t = await prisma.title.findUnique({
      where: { slug }, 
      select: {
        id: true, 
        slug: true, 
        name: true, 
        synopsis: true, 
        coverUrl: true,
        category: { 
          select: { 
            name: true, 
            slug: true 
          } 
        }
      }
    })
    if (!t) return reply.code(404).send({ ok: false, error: 'TITLE_NOT_FOUND' })
    return { ok: true, title: t }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})


// 4) 首页集合：/collections/home
app.get('/api/v1/public/collections/home', async (req, reply) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' }
    })

    const trending = await prisma.title.findMany({
      where: { isOnline: true, status: { in: ['DRAFT', 'PUBLISHED'] } },
      orderBy: { featuredWeight: 'desc' },
      take: 10,
      select: {
        id: true, 
        slug: true, 
        name: true, 
        coverUrl: true, 
        rating: true,
        tags: {
          select: { tag: { select: { name: true, slug: true } } }
        },
        episodes: {
          select: { id: true, epNumber: true, name: true, durationSec: true, isFreePreview: true }
        }
      }
    })

    const howItWorks = [
      { id: '1', title: '注册账户', description: '创建您的专属账户', icon: 'user-plus' },
      { id: '2', title: '选择内容', description: '浏览海量精彩内容', icon: 'search' },
      { id: '3', title: '开始观看', description: '随时随地享受观看', icon: 'play' }
    ]

    const why = [
      { id: '1', title: '高清画质', description: '提供最佳观看体验', icon: 'hd' },
      { id: '2', title: '更新及时', description: '第一时间更新最新内容', icon: 'clock' },
      { id: '3', title: '多端同步', description: '手机电脑无缝切换', icon: 'sync' }
    ]

    return {
      ok: true,
      categories: categories.map(cat => ({ id: cat.id, name: cat.name, slug: cat.slug })),
      trending: trending.map(title => ({
        id: title.id,
        slug: title.slug,
        title: title.name,
        cover: title.previewImage || '',
        rating: title.rating,
        tags: [],
        description: '',
        episodes: 0
      })),
      howItWorks,
      why
    }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// 板块内容管理API
// New Release 板块
app.get('/api/v1/public/sections/new-release', async (req, reply) => {
  try {
    const items = await prisma.sectionContent.findMany({
      where: { 
        section: 'new_release',
        isActive: true,
        title: { isOnline: true }
      },
      include: {
        title: {
          select: {
            id: true, slug: true, name: true, mainTitle: true, subTitle: true,
            coverUrl: true, rating: true,
            category: { select: { name: true } }
          }
        }
      },
      orderBy: { order: 'asc' },
      take: 12
    })
    
    const formattedItems = items.map(item => ({
      id: item.title.id,
      slug: item.title.slug,
      title: item.title.name,
      cover: item.title.coverUrl?.startsWith('http') 
        ? item.title.coverUrl 
        : `http://localhost:3001${item.title.coverUrl}`,
      rating: item.title.rating,
      tags: [],
      description: '',
      episodes: 0
    }))
    
    return { ok: true, items: formattedItems }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// Trending Now 板块
app.get('/api/v1/public/sections/trending-now', async (req, reply) => {
  try {
    const items = await prisma.sectionContent.findMany({
      where: { 
        section: 'trending',
        isActive: true,
        title: { isOnline: true }
      },
      include: {
        title: {
          select: {
            id: true, slug: true, name: true, mainTitle: true, subTitle: true,
            coverUrl: true, rating: true,
            category: { select: { name: true } }
          }
        }
      },
      orderBy: { order: 'asc' },
      take: 12
    })
    
    const formattedItems = items.map(item => ({
      id: item.title.id,
      slug: item.title.slug,
      title: item.title.name,
      cover: item.title.coverUrl?.startsWith('http') 
        ? item.title.coverUrl 
        : `http://localhost:3001${item.title.coverUrl}`,
      rating: item.title.rating,
      tags: [],
      description: '',
      episodes: 0
    }))
    
    return { ok: true, items: formattedItems }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// Popular Categories 板块 (按分类自动分组)
app.get('/api/v1/public/sections/popular-categories', async (req, reply) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        titles: {
          where: { 
            isOnline: true,
            status: { in: ['DRAFT', 'PUBLISHED'] }
          },
          select: {
            id: true, slug: true, name: true, mainTitle: true,
            coverUrl: true, rating: true
          },
          orderBy: { featuredWeight: 'desc' },
          take: 6
        }
      },
      orderBy: { order: 'asc' }
    })
    
    const formattedCategories = categories
      .filter(cat => cat.titles.length > 0)
      .map(category => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        movies: category.titles.map(title => ({
          id: title.id,
          slug: title.slug,
          title: title.name,
          cover: title.coverUrl?.startsWith('http') 
            ? title.coverUrl 
            : `http://localhost:3001${title.coverUrl}`,
          rating: title.rating,
          tags: [],
          description: '',
          episodes: 0
        }))
      }))
    
    return { ok: true, categories: formattedCategories }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// 更新轮播图API，改为从SectionContent读取
app.get('/api/v1/public/hero-banners', async (req, reply) => {
  try {
    const items = await prisma.sectionContent.findMany({
      where: { 
        section: 'hero',
        isActive: true,
        title: { 
          isOnline: true,
          bannerUrl: { not: null }
        }
      },
      include: {
        title: {
          select: {
            id: true, slug: true, name: true, mainTitle: true, subTitle: true,
            bannerUrl: true
          }
        }
      },
      orderBy: { order: 'asc' }
    })
    
    const banners = items.map(item => ({
      id: item.title.id,
      slug: item.title.slug,
      title: item.title.mainTitle || item.title.name,
      tagline: item.title.subTitle || '',
      backdrop: item.title.bannerUrl?.startsWith('http') 
        ? item.title.bannerUrl 
        : `http://localhost:3001${item.title.bannerUrl}`
    }))
    
    return { ok: true, data: banners }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// 获取剧目详情（包含剧集列表）
app.get('/api/v1/public/titles/:titleId/detail', async (req, reply) => {
  try {
    const { titleId } = req.params as { titleId: string }
    
    // 简化查询，避免复杂的字段映射
    const title = await prisma.title.findUnique({
      where: { id: titleId },
      include: {
        category: true,
        episodes: {
          orderBy: { epNumber: 'asc' }
        }
      }
    })
    
    if (!title) {
      return reply.status(404).send({ ok: false, error: 'Title not found' })
    }
    
    // 简化数据格式
    const result = {
      id: title.id,
      slug: title.slug,
      name: title.name,
      synopsis: title.synopsis,
      coverUrl: title.coverUrl || title.previewImage,
      bannerUrl: title.bannerUrl || title.previewImage,
      rating: title.rating,
      category: title.category,
      episodes: title.episodes.map((episode, index) => ({
        id: episode.id,
        episodeNum: episode.epNumber || (index + 1),
        name: episode.name || `第${episode.epNumber || (index + 1)}集`,
        duration: episode.durationSec || 0,
        videoUrl: episode.videoId || '',
        status: episode.status || 'DRAFT',
        isOnline: episode.isFreePreview || false,
        isFree: (episode.epNumber || (index + 1)) <= 3,
        priceCoins: (episode.epNumber || (index + 1)) <= 3 ? 0 : 100
      })),
      totalEpisodes: title.episodes.length,
      seriesPriceCoins: title.bundlePriceCoins || calculateSeriesPricing(title.episodes.length, title),
      freeUntilEpisode: 3
    }
    
    reply.send({ ok: true, data: result })
  } catch (error) {
    console.error('Detail API Error:', error)
    reply.send({ ok: false, error: 'Failed to fetch title detail' })
  }
})

// 获取单个剧集详情
app.get('/api/v1/public/episodes/:episodeId/detail', async (req, reply) => {
  try {
    const { episodeId } = req.params as { episodeId: string }
    
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        title: {
          select: {
            id: true,
            name: true,
            slug: true,
            coverUrl: true,
            synopsis: true,
            mainTitle: true,
            subTitle: true,
            freeUntilEpisode: true,
            bundlePriceCoins: true,
            category: {
              select: { name: true }
            },
            pricingOverride: true
          }
        }
      }
    })
    
    if (!episode) {
      return reply.status(404).send({ ok: false, error: 'Episode not found' })
    }
    
    const pricing = calculateEpisodePricing(episode.title, episode)
    
    const formattedEpisode = {
      id: episode.id,
      episodeNum: episode.epNumber,
      name: episode.name,
      duration: episode.durationSec,
      videoUrl: episode.videoId,
      status: episode.status,
      isOnline: episode.isFreePreview,
      title: {
        id: episode.title.id,
        name: episode.title.name,
        slug: episode.title.slug,
        coverUrl: episode.title.coverUrl,
        synopsis: episode.title.synopsis,
        mainTitle: episode.title.mainTitle,
        subTitle: episode.title.subTitle,
        category: episode.title.category
      },
      ...pricing
    }
    
    reply.send({ ok: true, data: formattedEpisode })
  } catch (error) {
    reply.status(500).send({ ok: false, error: 'Failed to fetch episode detail' })
  }
})

// 获取充值套餐列表
app.get('/api/v1/payment-packages', async (req, reply) => {
  try {
    const packages = await prisma.paymentPackage.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    })
    
    const formattedPackages = packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      coins: pkg.baseCoins,
      bonus: pkg.bonusCoins,
      price: (pkg.priceUsd / 100).toFixed(2), // 转换为美元并保留两位小数
      discount: pkg.bonusCoins > 0 ? `+${Math.round((pkg.bonusCoins / pkg.baseCoins) * 100)}%` : null,
      isNewUser: pkg.isFirstTime,
      description: pkg.description
    }))
    
    return { ok: true, packages: formattedPackages }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// 获取收费策略
app.get('/api/v1/pricing-strategy', async (req, reply) => {
  try {
    const strategy = await prisma.pricingStrategy.findFirst({
      where: { isActive: true },
      include: {
        seriesPricingTiers: {
          orderBy: { minEpisodes: 'asc' }
        }
      }
    })
    
    if (!strategy) {
      return { 
        ok: true, 
        strategy: {
          episodePriceCoins: 100,
          defaultFreeEpisodes: 3,
          seriesTiers: []
        }
      }
    }
    
    return { 
      ok: true, 
      strategy: {
        id: strategy.id,
        name: strategy.name,
        episodePriceCoins: strategy.episodePriceCoins,
        defaultFreeEpisodes: strategy.defaultFreeEpisodes,
        seriesTiers: strategy.seriesPricingTiers.map(tier => ({
          minEpisodes: tier.minEpisodes,
          maxEpisodes: tier.maxEpisodes,
          priceCoins: tier.priceCoins
        }))
      }
    }
  } catch (error) {
    app.log.error(error)
    return reply.code(500).send({ ok: false, error: 'Database error' })
  }
})

// 用户注册
app.post('/api/v1/auth/signup', async (req, reply) => {
  try {
    const { email, password, name } = req.body as any

    // 检查用户是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return reply.status(400).send({ ok: false, error: 'Email already registered' })
    }

    // 创建新用户（实际项目中应该对密码进行哈希）
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: password, // 注意：实际项目中需要使用bcrypt等进行密码哈希
        role: 'USER'
      }
    })

    // 创建用户金币账户
    await prisma.userCoin.create({
      data: {
        userId: user.id,
        balance: 0 // 新用户初始金币为0
      }
    })

    // 生成简单的token（实际项目中应该使用JWT）
    const token = `token_${user.id}_${Date.now()}`

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        coins: 0,
        isVip: false
      },
      token
    }
  } catch (error) {
    app.log.error(error)
    return reply.status(500).send({ ok: false, error: 'Registration failed' })
  }
})

// 用户登录
app.post('/api/v1/auth/signin', async (req, reply) => {
  try {
    const { email, password } = req.body as any

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        userCoins: true
      }
    })

    if (!user || user.password !== password) {
      return reply.status(401).send({ ok: false, error: 'Invalid email or password' })
    }

    // 生成简单的token（实际项目中应该使用JWT）
    const token = `token_${user.id}_${Date.now()}`

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        coins: user.userCoins?.balance || 0,
        isVip: user.role === 'VIP'
      },
      token
    }
  } catch (error) {
    app.log.error(error)
    return reply.status(500).send({ ok: false, error: 'Login failed' })
  }
})

// 获取用户信息
app.get('/api/v1/auth/me', async (req, reply) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    
    if (!token) {
      return reply.status(401).send({ ok: false, error: 'No token provided' })
    }

    // 简单的token验证（实际项目中应该验证JWT）
    const userId = token.split('_')[1]
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userCoins: true
      }
    })

    if (!user) {
      return reply.status(401).send({ ok: false, error: 'Invalid token' })
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        coins: user.userCoins?.balance || 0,
        isVip: user.role === 'VIP'
      }
    }
  } catch (error) {
    app.log.error(error)
    return reply.status(500).send({ ok: false, error: 'Failed to get user info' })
  }
})

// 404 兜底 - 必须放在最后
app.setNotFoundHandler((req, reply) => reply.code(404).send({ ok: false, error: 'Not Found', path: req.url }))

const port = Number(process.env.PORT ?? 3002)
app.listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`content-api listening on ${port}`))
  .catch(err => { console.error(err); process.exit(1) })

