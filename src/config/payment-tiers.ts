// 金币套餐配置 - 服务端白名单映射表
export interface PaymentTier {
  key: string
  name: string
  coins: number
  bonusCoins: number
  priceCents: number
  currency: string
  stripePriceId?: string // Stripe Price ID (如果使用 Checkout)
  isFirstTime?: boolean
  description?: string
}

// 金币套餐配置表 - 防止前端篡改
export const PAYMENT_TIERS: Record<string, PaymentTier> = {
  'coins_100': {
    key: 'coins_100',
    name: 'Starter Pack',
    coins: 100,
    bonusCoins: 0,
    priceCents: 199, // $1.99
    currency: 'USD',
    description: 'Perfect for trying out premium content'
  },
  'coins_300': {
    key: 'coins_300',
    name: 'Popular Choice',
    coins: 300,
    bonusCoins: 50,
    priceCents: 499, // $4.99
    currency: 'USD',
    description: 'Most popular choice with bonus coins'
  },
  'coins_500': {
    key: 'coins_500',
    name: 'Value Pack',
    coins: 500,
    bonusCoins: 100,
    priceCents: 799, // $7.99
    currency: 'USD',
    description: 'Great value with extra bonus coins'
  },
  'coins_1000': {
    key: 'coins_1000',
    name: 'Premium Pack',
    coins: 1000,
    bonusCoins: 300,
    priceCents: 1299, // $12.99
    currency: 'USD',
    description: 'Best value for heavy users'
  },
  'coins_2000': {
    key: 'coins_2000',
    name: 'Ultimate Pack',
    coins: 2000,
    bonusCoins: 800,
    priceCents: 1999, // $19.99
    currency: 'USD',
    description: 'Maximum value with huge bonus'
  },
  'first_time_300': {
    key: 'first_time_300',
    name: 'First Time Special',
    coins: 300,
    bonusCoins: 100,
    priceCents: 299, // $2.99 (special price for first time)
    currency: 'USD',
    isFirstTime: true,
    description: 'Special offer for new users only'
  }
}

// 验证 tier_key 是否有效
export function validateTierKey(tierKey: string): boolean {
  return tierKey in PAYMENT_TIERS
}

// 获取套餐配置
export function getTierConfig(tierKey: string): PaymentTier | null {
  return PAYMENT_TIERS[tierKey] || null
}

// 获取所有套餐列表
export function getAllTiers(): PaymentTier[] {
  return Object.values(PAYMENT_TIERS)
}

// 获取首充套餐
export function getFirstTimeTiers(): PaymentTier[] {
  return Object.values(PAYMENT_TIERS).filter(tier => tier.isFirstTime)
}

// 获取普通套餐（非首充）
export function getRegularTiers(): PaymentTier[] {
  return Object.values(PAYMENT_TIERS).filter(tier => !tier.isFirstTime)
}

