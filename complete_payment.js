import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function completePayPalPayment() {
  try {
    console.log('🔧 开始完成用户的PayPal支付订单...')
    
    // 查找用户最新的待处理PayPal订单
    const pendingOrder = await prisma.paymentOrder.findFirst({
      where: {
        userId: 'cmg36tmgr000013vxkri0fzug',
        provider: 'paypal',
        status: 'pending',
        amountCents: 1 // $0.01
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    if (!pendingOrder) {
      console.log('❌ 未找到待处理的PayPal订单')
      return
    }
    
    console.log('📋 找到待处理订单:', {
      id: pendingOrder.id,
      userId: pendingOrder.userId,
      amount: `$${(pendingOrder.amountCents / 100).toFixed(2)}`,
      coins: pendingOrder.coins,
      status: pendingOrder.status,
      createdAt: pendingOrder.createdAt
    })
    
    // 使用事务完成支付
    const result = await prisma.$transaction(async (tx) => {
      // 1. 更新订单状态为已完成
      const updatedOrder = await tx.paymentOrder.update({
        where: { id: pendingOrder.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          providerEventId: `manual_completion_${Date.now()}`
        }
      })
      
      // 2. 获取或创建用户金币记录
      const userCoins = await tx.userCoins.upsert({
        where: { userId: pendingOrder.userId },
        update: {
          balance: {
            increment: pendingOrder.coins
          }
        },
        create: {
          userId: pendingOrder.userId,
          balance: pendingOrder.coins
        }
      })
      
      // 3. 创建金币交易记录
      const transaction = await tx.coinTransaction.create({
        data: {
          userId: pendingOrder.userId,
          orderId: pendingOrder.id,
          coins: pendingOrder.coins,
          transactionType: 'purchase',
          description: `Manual completion - PayPal $${(pendingOrder.amountCents / 100).toFixed(2)}`
        }
      })
      
      return {
        order: updatedOrder,
        userCoins,
        transaction
      }
    })
    
    console.log('✅ 支付完成成功!')
    console.log('📊 结果:', {
      orderId: result.order.id,
      orderStatus: result.order.status,
      userCoinsBalance: result.userCoins.balance,
      coinsAdded: result.transaction.coins,
      transactionId: result.transaction.id
    })
    
    // 验证结果
    const finalUserCoins = await prisma.userCoins.findUnique({
      where: { userId: pendingOrder.userId }
    })
    
    console.log('🎉 用户最终金币余额:', finalUserCoins?.balance || 0)
    
  } catch (error) {
    console.error('❌ 完成支付过程中出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

completePayPalPayment()



