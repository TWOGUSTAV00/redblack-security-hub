import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './user.model.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      plan: user.plan,
      avatarUrl: user.avatarUrl || ''
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  return {
    _id: String(user._id || user.id),
    id: user.id,
    username: user.username,
    name: user.displayName,
    plan: user.plan,
    avatarUrl: user.avatarUrl || ''
  };
}

export async function registerUser({ username, password, displayName }) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const safeDisplayName = String(displayName || username || '').trim();

  if (normalizedUsername.length < 3) {
    throw new AppError('Usuario precisa ter pelo menos 3 caracteres', 400);
  }
  if (String(password || '').length < 6) {
    throw new AppError('Senha precisa ter pelo menos 6 caracteres', 400);
  }

  const exists = await User.findOne({ username: normalizedUsername });
  if (exists) {
    throw new AppError('Este usuario ja existe', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    username: normalizedUsername,
    displayName: safeDisplayName,
    passwordHash
  });

  return {
    token: signToken(user),
    user: sanitizeUser(user)
  };
}

export async function loginUser({ username, password }) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const user = await User.findOne({ username: normalizedUsername });
  if (!user) {
    throw new AppError('Usuario ou senha invalidos', 401);
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new AppError('Usuario ou senha invalidos', 401);
  }

  return {
    token: signToken(user),
    user: sanitizeUser(user)
  };
}

export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('Usuario nao encontrado', 404);
  }
  return sanitizeUser(user);
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
