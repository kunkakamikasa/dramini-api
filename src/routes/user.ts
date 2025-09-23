import { UserService } from '../services';

const userService = new UserService();

export default async function userRoutes(fastify: any) {
    // POST /api/v1/auth/signup
    fastify.post('/auth/signup', async (request: any, reply: any) => {
        try {
            const { email, password, name } = request.body;
            const result = await userService.signup(email, password, name);
            return result;
        } catch (error) {
            reply.code(500).send({ error: 'Registration failed' });
        }
    });

    // POST /api/v1/auth/signin
    fastify.post('/auth/signin', async (request: any, reply: any) => {
        try {
            const { email, password } = request.body;
            const result = await userService.signin(email, password);
            return result;
        } catch (error) {
            reply.code(500).send({ error: 'Login failed' });
        }
    });

    // GET /api/v1/auth/me
    fastify.get('/auth/me', async (request: any, reply: any) => {
        try {
            const token = request.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                reply.code(401).send({ error: 'No token provided' });
                return;
            }
            const result = await userService.getUserInfo(token);
            return result;
        } catch (error) {
            reply.code(500).send({ error: 'Failed to get user info' });
        }
    });
}
