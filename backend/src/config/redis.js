import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redis;

export async function connectRedis() {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false
  });

  redis.on('error', (error) => logger.error({ error }, 'Falha Redis'));
  redis.on('connect', () => logger.info('Redis conectado'));

  return redis;
}

export function getRedis() {
  return redis;
}
