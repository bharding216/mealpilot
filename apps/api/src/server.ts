import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env, validateEnv } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { mealPlanRoutes } from './routes/mealPlan.js';
import { profileRoutes } from './routes/profile.js';
import { groceryRoutes } from './routes/grocery.js';
import { hebRoutes } from './routes/heb.js';

async function main() {
  validateEnv();

  const app = Fastify({
    logger: {
      level: env.nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        env.nodeEnv !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } }
          : undefined,
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(mealPlanRoutes);
  await app.register(profileRoutes);
  await app.register(groceryRoutes);
  await app.register(hebRoutes);

  // Global error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      error: error.name ?? 'Internal Server Error',
      message:
        env.nodeEnv === 'production'
          ? 'Something went wrong'
          : error.message,
      statusCode,
    });
  });

  try {
    await app.listen({ port: env.port, host: env.host });
    app.log.info(`Server running on http://${env.host}:${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
