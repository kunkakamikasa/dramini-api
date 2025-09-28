import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function userRoutes(fastify: FastifyInstance) {
  // 用户注册
  fastify.post('/api/v1/user/register', async (request, reply) => {
    try {
      const { email, password, name } = request.body as { 
        email: string; 
        password: string; 
        name: string 
      }
      
      console.log('User registration request:', { email, name })
      
      // 检查用户是否已存在
      const existingUser = await prisma.user.findUnique({
        where: { email }
      })
      
      if (existingUser) {
        return reply.code(400).send({ 
          error: 'User already exists',
          message: 'A user with this email already exists'
        })
      }
      
      // 创建新用户
      const user = await prisma.user.create({
        data: {
          email,
          password, // 注意：生产环境应该加密密码
          name,
          provider: 'email',
          status: 'ACTIVE'
        }
      })
      
      // 创建用户金币记录
      await prisma.userCoins.create({
        data: {
          userId: user.id,
          balance: 0
        }
      })
      
      console.log('User created successfully:', user.id)
      
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coins: 0
        }
      }
    } catch (error) {
      console.error('User registration error:', error)
      return reply.code(500).send({ 
        error: 'Registration failed',
        message: 'Failed to create user account'
      })
    }
  })
  
  // 根据邮箱查找用户
  fastify.get('/api/v1/user/find-by-email', async (request, reply) => {
    try {
      const { email } = request.query as { email: string }
      
      if (!email) {
        return reply.code(400).send({ error: 'Email is required' })
      }
      
      console.log('Finding user by email:', email)
      
      const user = await prisma.user.findUnique({
        where: { email }
      })
      
      if (!user) {
        return reply.code(404).send({ 
          error: 'User not found',
          message: 'No user found with this email'
        })
      }
      
      // 查询用户金币余额
      const userCoins = await prisma.userCoins.findUnique({
        where: { userId: user.id }
      })
      
      console.log('User found:', user.id)
      
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coins: userCoins?.balance || 0
        }
      }
    } catch (error) {
      console.error('Find user error:', error)
      return reply.code(500).send({ 
        error: 'Failed to find user',
        message: 'Database error occurred'
      })
    }
  })
  
  // 更新用户金币
  fastify.put('/api/v1/user/:userId/coins', async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string }
      const { coins } = request.body as { coins: number }
      
      if (!userId || coins === undefined) {
        return reply.code(400).send({ error: 'UserId and coins are required' })
      }
      
      console.log('Updating user coins:', userId, coins)
      
      await prisma.userCoins.upsert({
        where: { userId },
        update: { balance: coins },
        create: { userId, balance: coins }
      })
      
      console.log('User coins updated successfully')
      
      return {
        success: true,
        message: 'Coins updated successfully'
      }
    } catch (error) {
      console.error('Update coins error:', error)
      return reply.code(500).send({ 
        error: 'Failed to update coins',
        message: 'Database error occurred'
      })
    }
  })
  
  // 用户登录验证
  fastify.post('/api/v1/user/login', async (request, reply) => {
    try {
      const { email, password } = request.body as { 
        email: string; 
        password: string 
      }
      
      console.log('User login request:', email)
      
      const user = await prisma.user.findUnique({
        where: { email }
      })
      
      if (!user) {
        return reply.code(401).send({ 
          error: 'Invalid credentials',
          message: 'User not found'
        })
      }
      
      // 简单的密码验证（生产环境应该使用加密）
      if (user.password !== password) {
        return reply.code(401).send({ 
          error: 'Invalid credentials',
          message: 'Incorrect password'
        })
      }
      
      // 查询用户金币余额
      const userCoins = await prisma.userCoins.findUnique({
        where: { userId: user.id }
      })
      
      console.log('User login successful:', user.id)
      
      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          coins: userCoins?.balance || 0
        }
      }
    } catch (error) {
      console.error('User login error:', error)
      return reply.code(500).send({ 
        error: 'Login failed',
        message: 'Database error occurred'
      })
    }
  })
}
