import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let redis;

export async function connectRedis() {
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL nao configurada. Cache Redis desativado.');
    redis = null;
    return null;
  }

  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 4000
  });

  redis.on('error', (error) => logger.error({ error }, 'Falha Redis'));
  redis.on('connect', () => logger.info('Redis conectado'));

  try {
    await redis.ping();
    return redis;
  } catch (error) {
    logger.warn({ error: error.message }, 'Redis indisponivel. Backend segue sem cache.');
    try {
      redis.disconnect();
    } catch {}
    redis = null;
    return null;
  }
}

export function getRedis() {
  return redis;
}
