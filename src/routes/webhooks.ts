export default async function webhookRoutes(fastify: any) {
    // POST /api/v1/webhooks/stripe
    fastify.post('/webhooks/stripe', async (request: any, reply: any) => {
        try {
            // Handle Stripe webhook
            return { received: true };
        } catch (error) {
            reply.code(500).send({ error: 'Webhook processing failed' });
        }
    });
}
