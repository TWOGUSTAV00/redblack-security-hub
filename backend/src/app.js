import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { connectMongo } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import healthRoutes from './routes/health.routes.js';
import chatRoutes from './routes/chat.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import { validateRuntimeConfig } from './config/runtime-check.js';
import authRoutes from './routes/auth.routes.js';

export async function startServer() {
  await connectMongo();
  await connectRedis();
  validateRuntimeConfig();

  const app = express();
  app.use(helmet());
  const allowedOrigins = [
    env.FRONTEND_URL,
    ...(env.FRONTEND_URLS ? env.FRONTEND_URLS.split(',').map((item) => item.trim()).filter(Boolean) : [])
  ];
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, env.NODE_ENV !== 'production');
    },
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));
  app.use(requestLogger);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/conversations', conversationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Nemo IA backend online');
  });
}
