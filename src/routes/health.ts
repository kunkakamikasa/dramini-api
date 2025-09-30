export default async function healthRoutes(fastify: any) {
    fastify.get('/health', async (request: any, reply: any) => {
        return { ok: true };
    });
}

