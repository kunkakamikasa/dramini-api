import { ContentService } from '../services';

const contentService = new ContentService();

export default async function publicRoutes(fastify: any) {
    // GET /api/v1/public/collections/home
    fastify.get('/collections/home', async (request: any, reply: any) => {
        try {
            const data = await contentService.getHomeContent();
            return data;
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // GET /api/v1/public/titles
    fastify.get('/titles', async (request: any, reply: any) => {
        try {
            const { category, q } = request.query;
            const titles = await contentService.getTitles(category, q);
            return { titles };
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // GET /api/v1/public/titles/:slug
    fastify.get('/titles/:slug', async (request: any, reply: any) => {
        try {
            const { slug } = request.params;
            const title = await contentService.getTitleBySlug(slug);
            if (!title) {
                reply.code(404).send({ error: 'Title not found' });
                return;
            }
            return { title };
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // GET /api/v1/public/sections/new-release
    fastify.get('/sections/new-release', async (request: any, reply: any) => {
        try {
            const data = await contentService.getNewReleaseSection();
            return data;
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // GET /api/v1/public/sections/trending-now
    fastify.get('/sections/trending-now', async (request: any, reply: any) => {
        try {
            const data = await contentService.getTrendingNowSection();
            return data;
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // GET /api/v1/public/sections/popular-categories
    fastify.get('/sections/popular-categories', async (request: any, reply: any) => {
        try {
            const data = await contentService.getPopularCategoriesSection();
            return data;
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // GET /api/v1/public/hero-banners
    fastify.get('/hero-banners', async (request: any, reply: any) => {
        try {
            const data = await contentService.getHeroBanners();
            return data;
        } catch (error) {
            reply.code(500).send({ error: 'Internal server error' });
        }
    });
}

