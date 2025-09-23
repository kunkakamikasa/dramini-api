import { prisma } from '../prisma';

export class ContentService {
    // 获取首页内容
    async getHomeContent() {
        const titles = await prisma.title.findMany({
            where: {
                status: { in: ['DRAFT', 'PUBLISHED'] }
            },
            include: {
                category: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 10
        });

        return {
            titles: titles.map(title => ({
                id: title.id,
                slug: title.slug,
                name: title.name,
                synopsis: title.synopsis,
                rating: title.rating,
                category: title.category
            }))
        };
    }

    // 获取标题列表
    async getTitles(category?: string, search?: string) {
        const where: any = {};
        if (category) {
            where.categoryId = category;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { synopsis: { contains: search, mode: 'insensitive' } }
            ];
        }

        return await prisma.title.findMany({
            where,
            include: {
                episodes: {
                    orderBy: { epNumber: 'asc' }
                },
                category: true
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    // 根据slug获取标题详情
    async getTitleBySlug(slug: string) {
        return await prisma.title.findUnique({
            where: { slug },
            include: {
                episodes: {
                    orderBy: { epNumber: 'asc' }
                },
                category: true
            }
        });
    }

    // 获取新发布内容
    async getNewReleaseSection() {
        const titles = await prisma.title.findMany({
            where: {
                status: { in: ['DRAFT', 'PUBLISHED'] }
            },
            select: {
                id: true,
                slug: true,
                name: true,
                synopsis: true,
                createdAt: true,
                rating: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 20
        });

        return {
            section: 'new-release',
            title: 'New Release',
            titles: titles.map(item => ({
                id: item.id,
                slug: item.slug,
                name: item.name,
                synopsis: item.synopsis,
                rating: item.rating,
                createdAt: item.createdAt
            }))
        };
    }

    // 获取热门内容
    async getTrendingNowSection() {
        const titles = await prisma.title.findMany({
            where: {
                status: { in: ['DRAFT', 'PUBLISHED'] }
            },
            select: {
                id: true,
                slug: true,
                name: true,
                synopsis: true,
                rating: true,
                featuredWeight: true
            },
            orderBy: {
                featuredWeight: 'desc'
            },
            take: 20
        });

        return {
            section: 'trending-now',
            title: 'Trending Now',
            titles: titles.map(item => ({
                id: item.id,
                slug: item.slug,
                name: item.name,
                synopsis: item.synopsis,
                rating: item.rating
            }))
        };
    }

    // 获取热门分类
    async getPopularCategoriesSection() {
        const categories = await prisma.category.findMany({
            include: {
                titles: {
                    where: {
                        status: { in: ['DRAFT', 'PUBLISHED'] }
                    },
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        synopsis: true,
                        rating: true
                    },
                    orderBy: {
                        featuredWeight: 'desc'
                    },
                    take: 6
                }
            },
            orderBy: {
                order: 'asc'
            }
        });

        return {
            section: 'popular-categories',
            title: 'Popular Categories',
            categories: categories.map(category => ({
                id: category.id,
                name: category.name,
                titles: category.titles.map(title => ({
                    id: title.id,
                    slug: title.slug,
                    name: title.name,
                    synopsis: title.synopsis,
                    rating: title.rating
                }))
            }))
        };
    }

    // 获取横幅广告
    async getHeroBanners() {
        // 简化实现，返回空数组
        return {
            banners: []
        };
    }
}