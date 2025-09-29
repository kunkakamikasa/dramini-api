import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkUserIds() {
  try {
    console.log('🔍 检查用户ID匹配问题...')
    
    // 查找邮箱为 181849966@qq.com 的用户
    const userByEmail = await prisma.user.findUnique({
      where: { email: '181849966@qq.com' }
    })
    
    console.log('\n📧 通过邮箱查找用户:')
    if (userByEmail) {
      console.log('用户ID:', userByEmail.id)
      console.log('邮箱:', userByEmail.email)
      console.log('姓名:', userByEmail.name)
    } else {
      console.log('❌ 未找到该邮箱的用户')
    }
    
    // 查找该用户的金币记录
    if (userByEmail) {
      const userCoins = await prisma.userCoins.findUnique({
        where: { userId: userByEmail.id }
      })
      
      console.log('\n💰 用户金币记录:')
      if (userCoins) {
        console.log('用户ID:', userCoins.userId)
        console.log('金币余额:', userCoins.balance)
        console.log('创建时间:', userCoins.createdAt)
        console.log('更新时间:', userCoins.updatedAt)
      } else {
        console.log('❌ 未找到该用户的金币记录')
      }
    }
    
    // 查找所有用户（用于对比）
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    console.log('\n👥 最近注册的用户:')
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user.id}`)
      console.log(`   邮箱: ${user.email}`)
      console.log(`   姓名: ${user.name || '未设置'}`)
      console.log(`   注册时间: ${user.createdAt}`)
      console.log('---')
    })
    
  } catch (error) {
    console.error('❌ 检查过程中出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkUserIds()

