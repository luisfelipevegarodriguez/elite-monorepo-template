import type { FastifyInstance } from 'fastify';

export async function apiRoutes(server: FastifyInstance): Promise<void> {
  server.get('/status', async () => ({
    message: 'Elite Monorepo API v1',
    env: process.env.NODE_ENV ?? 'production',
  }));
}
