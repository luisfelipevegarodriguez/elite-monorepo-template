import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health.js';
import { apiRoutes } from './routes/api.js';
import { authorityRoutes } from './routes/authority.js';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
  },
});

await server.register(helmet);
await server.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? false,
});
await server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

await server.register(healthRoutes);
await server.register(apiRoutes, { prefix: '/api/v1' });
await server.register(authorityRoutes, { prefix: '/api/v1/authority' });

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

try {
  await server.listen({ port: PORT, host: HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
