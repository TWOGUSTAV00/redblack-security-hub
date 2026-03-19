import dotenv from 'dotenv';

dotenv.config();

function pickEnv(...keys) {
  for (const key of keys) {
    if (process.env[key] !== undefined && process.env[key] !== '') {
      return process.env[key];
    }
  }
  return '';
}

export const env = {
  PORT: Number(process.env.PORT || 8080),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  FRONTEND_URLS: pickEnv('FRONTEND_URLS'),
  MONGODB_URI: pickEnv('MONGODB_URI', 'MONGO_URI', 'MONGODB_URL') || 'mongodb://localhost:27017/nemoia',
  REDIS_URL: pickEnv('REDIS_URL', 'REDISCLOUD_URL'),
  JWT_SECRET: pickEnv('JWT_SECRET') || 'change-me',
  DEFAULT_TIMEOUT_MS: Number(process.env.DEFAULT_TIMEOUT_MS || 25000),
  CACHE_TTL_SECONDS: Number(process.env.CACHE_TTL_SECONDS || 300),
  MAX_CONTEXT_CHARS: Number(process.env.MAX_CONTEXT_CHARS || 12000),
  BRAVE_SEARCH_API_KEY: pickEnv('BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY'),
  BRAVE_SEARCH_COUNT: Number(process.env.BRAVE_SEARCH_COUNT || 5),
  ENABLE_WEB_FETCH: String(process.env.ENABLE_WEB_FETCH || 'true') === 'true',
  GEMINI_API_KEY: pickEnv('GEMINI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'GOOGLE_API_KEY'),
  GEMINI_MODEL: pickEnv('GEMINI_MODEL', 'GEMINI_DEFAULT_MODEL') || 'gemini-1.5-flash',
  DEEPSEEK_API_KEY: pickEnv('DEEPSEEK_API_KEY', 'DEEPSEEK_KEY'),
  DEEPSEEK_MODEL: pickEnv('DEEPSEEK_MODEL', 'DEEPSEEK_DEFAULT_MODEL') || 'deepseek-chat',
  FALLBACK_PROVIDER: process.env.FALLBACK_PROVIDER || 'pollinations',
  EMBEDDING_MODE: process.env.EMBEDDING_MODE || 'hash'
};
