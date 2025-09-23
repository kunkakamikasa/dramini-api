import { prisma } from '../prisma.js';

export class PaymentService {
    async getPaymentPackages() {
        // 简化实现，返回默认套餐
        return [
            {
                id: '1',
                name: 'Basic Package',
                coins: 100,
                bonus: 0,
                price: '9.99',
                discount: null,
                isNewUser: false,
                description: 'Basic coin package'
            },
            {
                id: '2',
                name: 'Premium Package',
                coins: 500,
                bonus: 100,
                price: '49.99',
                discount: '+20%',
                isNewUser: false,
                description: 'Premium coin package with bonus'
            }
        ];
    }

    async getPricingStrategy() {
        // 简化实现，返回默认策略
        return {
            episodePriceCoins: 100,
            defaultFreeEpisodes: 3,
            seriesTiers: [
                {
                    minEpisodes: 1,
                    maxEpisodes: 10,
                    priceCoins: 500
                },
                {
                    minEpisodes: 11,
                    maxEpisodes: 50,
                    priceCoins: 2000
                }
            ]
        };
    }
}