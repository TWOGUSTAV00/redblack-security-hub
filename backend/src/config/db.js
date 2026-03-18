import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectMongo() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB conectado');
}
