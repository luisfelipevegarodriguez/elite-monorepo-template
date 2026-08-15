import { neon } from '@neondatabase/serverless';
import type { FastifyInstance } from 'fastify';

const sql = neon(process.env.DATABASE_URL ?? '');

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  server.get('/ready', async (_request, reply) => {
    if (!process.env.DATABASE_URL || !process.env.AUTHORITY_TOKEN) {
      return reply.code(503).send({
        status: 'blocked',
        reason: 'CANONICAL_AUTHORITY_NOT_CONFIGURED',
      });
    }

    try {
      await sql`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({
        status: 'blocked',
        reason: 'CANONICAL_DATABASE_UNAVAILABLE',
      });
    }
  });
}
