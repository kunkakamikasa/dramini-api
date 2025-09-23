import { prisma } from '../prisma.js';

export class UserService {
    async signup(email: string, password: string, name?: string) {
        // 检查用户是否已存在
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            throw new Error('Email already registered');
        }

        // 创建新用户（简化实现，不存储密码）
        const user = await prisma.user.create({
            data: {
                email,
                name,
                provider: 'email'
            }
        });

        // 生成简单的token
        const token = `token_${user.id}_${Date.now()}`;

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
        };
    }

    async signin(email: string, password: string) {
        // 查找用户
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        // 生成简单的token
        const token = `token_${user.id}_${Date.now()}`;

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
        };
    }

    async getUserInfo(token: string) {
        // 简单的token验证
        const userId = token.split('_')[1];
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new Error('Invalid token');
        }

        return {
            ok: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                coins: 0,
                isVip: false
            }
        };
    }
}