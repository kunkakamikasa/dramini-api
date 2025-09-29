import { prisma } from '../prisma.js';
import crypto from 'crypto';

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
            titles: titles.map((title: any) => ({
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

        const titles = await prisma.title.findMany({
            where,
            include: {
                episodes: {
                    orderBy: { epNumber: 'asc' }
                },
                category: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // 处理免费集数逻辑
        return titles.map((title: any) => ({
            ...title,
            episodes: title.episodes.map((episode: any) => ({
                ...episode,
                isFree: episode.epNumber <= (title.freeUntilEpisode || 0),
                episodeNum: episode.epNumber,
                priceCoins: episode.priceCents || 100
            }))
        }));
    }

    // 根据slug获取标题详情
    async getTitleBySlug(slug: string) {
        const title = await prisma.title.findUnique({
            where: { slug },
            include: {
                episodes: {
                    orderBy: { epNumber: 'asc' }
                },
                category: true
            }
        });

        if (!title) return null;

        // 处理免费集数逻辑
        return {
            ...title,
            episodes: title.episodes.map((episode: any) => ({
                ...episode,
                isFree: episode.epNumber <= (title.freeUntilEpisode || 0),
                episodeNum: episode.epNumber,
                priceCoins: episode.priceCents || 100
            }))
        };
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
            titles: titles.map((item: any) => ({
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
            titles: titles.map((item: any) => ({
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
            categories: categories.map((category: any) => ({
                id: category.id,
                name: category.name,
                titles: category.titles.map((title: any) => ({
                    id: title.id,
                    slug: title.slug,
                    name: title.name,
                    synopsis: title.synopsis,
                    rating: title.rating
                }))
            }))
        };
    }

    // 获取横幅广告 - 修复版本
    async getHeroBanners() {
        try {
            // 获取轮播图配置
            const banners = await prisma.sectionContent.findMany({
                where: {
                    sectionType: 'hero_banner',
                    isActive: true
                },
                orderBy: {
                    orderIndex: 'asc'
                }
            });

            // 获取所有contentId对应的影片信息
            const contentIds = banners.map((banner: any) => banner.contentId);
            const movies = await prisma.title.findMany({
                where: { id: { in: contentIds } },
                select: {
                    id: true,
                    name: true,
                    synopsis: true,
                    coverImageId: true,
                    bannerUrl: true, // 添加bannerUrl字段
                    status: true
                }
            });

            // 创建影片ID到影片信息的映射
            const movieMap = new Map(movies.map((movie: any) => [movie.id, movie]));

            // 映射数据到前端期望的格式
            const mappedBanners = banners.map((banner: any) => {
                const movie = movieMap.get(banner.contentId);
                return {
                    id: banner.id,
                    movieId: banner.contentId, // 添加movieId字段
                    title: (movie as any)?.name || banner.title || 'Untitled',
                    subtitle: (movie as any)?.synopsis || banner.subtitle || '',
                    imageUrl: (movie as any)?.bannerUrl || (movie as any)?.coverImageId || banner.imageUrl || '',
                    actionUrl: banner.jumpUrl || '',
                    order: banner.orderIndex
                };
            });

            return {
                banners: mappedBanners
            };
        } catch (error) {
            console.error('Error fetching hero banners:', error);
            return {
                banners: []
            };
        }
    }

    // 创建轮播图
    async createHeroBanner(data: any) {
        try {
            console.log('Creating hero banner with data:', data);
            
            // 获取影片信息
            const movie = await prisma.title.findUnique({
                where: { id: data.movieId },
                select: { 
                    id: true,
                    name: true,
                    coverImageId: true,
                    bannerUrl: true
                }
            });
            
            const banner = await prisma.sectionContent.create({
                data: {
                    id: crypto.randomUUID(),
                    sectionType: 'hero_banner',
                    contentId: data.movieId,
                    contentType: 'movie',
                    title: data.title || null,
                    subtitle: data.subtitle || null,
                    imageUrl: data.imageUrl || movie?.bannerUrl || movie?.coverImageId || null, // 优先使用bannerUrl
                    jumpUrl: data.jumpUrl || null,
                    orderIndex: data.order || 0,
                    isActive: true
                }
            });
            
            console.log('Hero banner created successfully:', banner);
            return banner;
        } catch (error) {
            console.error('Error creating hero banner:', error);
            throw error;
        }
    }
}