import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkStripePayment() {
  try {
    console.log('🔍 检查Stripe支付订单...')
    
    // 查找最近的Stripe支付订单
    const stripeOrders = await prisma.paymentOrder.findMany({
      where: {
        provider: 'stripe'
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    console.log('\n📋 最近的Stripe支付订单:')
    console.log('总数:', stripeOrders.length)
    stripeOrders.forEach((order, index) => {
      console.log(`${index + 1}. ID: ${order.id}`)
      console.log(`   用户: ${order.userId}`)
      console.log(`   套餐: ${order.tierKey}`)
      console.log(`   金额: $${(order.amountCents / 100).toFixed(2)}`)
      console.log(`   金币: ${order.coins}`)
      console.log(`   状态: ${order.status}`)
      console.log(`   Stripe订单ID: ${order.providerOrderId || '无'}`)
      console.log(`   创建时间: ${order.createdAt}`)
      console.log(`   完成时间: ${order.completedAt || '未完成'}`)
      console.log('---')
    })
    
    // 查找用户的金币记录
    const userCoins = await prisma.userCoins.findMany({
      orderBy: {
        updatedAt: 'desc'
      },
      take: 5
    })
    
    console.log('\n💰 最近的金币记录:')
    console.log('总数:', userCoins.length)
    userCoins.forEach((coins, index) => {
      console.log(`${index + 1}. 用户: ${coins.userId}`)
      console.log(`   余额: ${coins.balance}`)
      console.log(`   更新时间: ${coins.updatedAt}`)
      console.log('---')
    })
    
    // 查找金币交易记录
    const coinTransactions = await prisma.coinTransaction.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    console.log('\n💳 最近的金币交易记录:')
    console.log('总数:', coinTransactions.length)
    coinTransactions.forEach((tx, index) => {
      console.log(`${index + 1}. ID: ${tx.id}`)
      console.log(`   用户: ${tx.userId}`)
      console.log(`   订单: ${tx.orderId}`)
      console.log(`   金币: ${tx.coins}`)
      console.log(`   类型: ${tx.transactionType}`)
      console.log(`   描述: ${tx.description || '无'}`)
      console.log(`   时间: ${tx.createdAt}`)
      console.log('---')
    })
    
  } catch (error) {
    console.error('❌ 检查过程中出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkStripePayment()



