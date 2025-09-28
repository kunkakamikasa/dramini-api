import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkPayment() {
  try {
    console.log('🔍 检查支付相关表和数据...')
    
    // 检查支付订单
    const paymentOrders = await prisma.paymentOrder.findMany({
      where: {
        userId: '181849966@qq.com'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    console.log('\n📋 支付订单记录:')
    console.log('总数:', paymentOrders.length)
    paymentOrders.forEach((order, index) => {
      console.log(`${index + 1}. ID: ${order.id}`)
      console.log(`   金额: $${(order.amountCents / 100).toFixed(2)}`)
      console.log(`   金币: ${order.coins}`)
      console.log(`   状态: ${order.status}`)
      console.log(`   提供商: ${order.provider}`)
      console.log(`   创建时间: ${order.createdAt}`)
      console.log(`   完成时间: ${order.completedAt || '未完成'}`)
      console.log('---')
    })
    
    // 检查用户金币
    const userCoins = await prisma.userCoins.findUnique({
      where: {
        userId: '181849966@qq.com'
      }
    })
    
    console.log('\n💰 用户金币记录:')
    if (userCoins) {
      console.log(`用户: ${userCoins.userId}`)
      console.log(`余额: ${userCoins.balance} 金币`)
      console.log(`创建时间: ${userCoins.createdAt}`)
      console.log(`更新时间: ${userCoins.updatedAt}`)
    } else {
      console.log('❌ 未找到用户金币记录')
    }
    
    // 检查金币交易记录
    const coinTransactions = await prisma.coinTransaction.findMany({
      where: {
        userId: '181849966@qq.com'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    console.log('\n💳 金币交易记录:')
    console.log('总数:', coinTransactions.length)
    coinTransactions.forEach((tx, index) => {
      console.log(`${index + 1}. ID: ${tx.id}`)
      console.log(`   金币: ${tx.coins}`)
      console.log(`   类型: ${tx.transactionType}`)
      console.log(`   描述: ${tx.description || '无'}`)
      console.log(`   时间: ${tx.createdAt}`)
      console.log('---')
    })
    
    // 检查最近的所有支付订单（不限用户）
    const allRecentOrders = await prisma.paymentOrder.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    })
    
    console.log('\n🔄 最近的所有支付订单:')
    console.log('总数:', allRecentOrders.length)
    allRecentOrders.forEach((order, index) => {
      console.log(`${index + 1}. 用户: ${order.userId}`)
      console.log(`   金额: $${(order.amountCents / 100).toFixed(2)}`)
      console.log(`   金币: ${order.coins}`)
      console.log(`   状态: ${order.status}`)
      console.log(`   提供商: ${order.provider}`)
      console.log(`   时间: ${order.createdAt}`)
      console.log('---')
    })
    
  } catch (error) {
    console.error('❌ 检查过程中出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkPayment()
