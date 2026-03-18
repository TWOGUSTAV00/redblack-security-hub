import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';

export async function readCache(key) {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function writeCache(key, value) {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  await redis.set(key, JSON.stringify(value), 'EX', env.CACHE_TTL_SECONDS);
  return value;
}
