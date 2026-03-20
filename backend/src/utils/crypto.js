import crypto from 'node:crypto';
import { env } from '../config/env.js';

const secret = crypto.createHash('sha256').update(env.MESSAGE_SECRET || env.JWT_SECRET || 'nemo-secret').digest();

export function encryptMessageText(value = '') {
  if (!value) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', secret, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptMessageText(value = '') {
  if (!value) return '';
  const [ivHex, encryptedHex] = String(value).split(':');
  if (!ivHex || !encryptedHex) return '';
  const decipher = crypto.createDecipheriv('aes-256-cbc', secret, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
