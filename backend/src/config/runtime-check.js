import { env } from './env.js';
import { logger } from '../utils/logger.js';

function maskSecret(value = '') {
  if (!value) {
    return 'missing';
  }
  if (value.length <= 8) {
    return 'configured';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function validateRuntimeConfig() {
  logger.info({
    mongoConfigured: Boolean(env.MONGODB_URI),
    redisConfigured: Boolean(env.REDIS_URL),
    frontendUrl: env.FRONTEND_URL,
    frontendUrls: env.FRONTEND_URLS || '',
    geminiConfigured: maskSecret(env.GEMINI_API_KEY),
    deepseekConfigured: maskSecret(env.DEEPSEEK_API_KEY),
    braveConfigured: maskSecret(env.BRAVE_SEARCH_API_KEY),
    geminiModel: env.GEMINI_MODEL,
    deepseekModel: env.DEEPSEEK_MODEL
  }, 'Runtime config carregada');
}
