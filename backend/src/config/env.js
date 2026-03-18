import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT || 8080),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/nemoia',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  DEFAULT_TIMEOUT_MS: Number(process.env.DEFAULT_TIMEOUT_MS || 25000),
  CACHE_TTL_SECONDS: Number(process.env.CACHE_TTL_SECONDS || 300),
  MAX_CONTEXT_CHARS: Number(process.env.MAX_CONTEXT_CHARS || 12000),
  BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || '',
  BRAVE_SEARCH_COUNT: Number(process.env.BRAVE_SEARCH_COUNT || 5),
  ENABLE_WEB_FETCH: String(process.env.ENABLE_WEB_FETCH || 'true') === 'true',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  FALLBACK_PROVIDER: process.env.FALLBACK_PROVIDER || 'pollinations',
  EMBEDDING_MODE: process.env.EMBEDDING_MODE || 'hash'
};
