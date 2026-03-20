import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './user.model.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email || '',
      name: user.name || user.displayName || user.legacyUsername || user.username || 'Usuario',
      avatarUrl: user.avatarUrl || ''
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function sanitizeUser(user) {
  return {
    id: String(user._id),
    _id: String(user._id),
    name: user.name || user.displayName || user.legacyUsername || user.username || 'Usuario',
    email: user.email || '',
    avatarUrl: user.avatarUrl || '',
    status: user.status || 'offline'
  };
}

export async function registerUser({ name, email, password }) {
  const safeName = String(name || '').trim();
  const safeEmail = String(email || '').trim().toLowerCase();
  const safePassword = String(password || '');

  if (safeName.length < 2) throw new AppError('Nome precisa ter pelo menos 2 caracteres', 400);
  if (!safeEmail.includes('@')) throw new AppError('Email invalido', 400);
  if (safePassword.length < 6) throw new AppError('Senha precisa ter pelo menos 6 caracteres', 400);

  const exists = await User.findOne({ email: safeEmail });
  if (exists) throw new AppError('Este email ja esta em uso', 409);

  const passwordHash = await bcrypt.hash(safePassword, 10);
  const user = await User.create({
    name: safeName,
    email: safeEmail,
    passwordHash,
    legacyUsername: safeEmail.split('@')[0],
    status: 'offline'
  });

  return { token: signToken(user), user: sanitizeUser(user) };
}

export async function loginUser({ email, password }) {
  const safeIdentifier = String(email || '').trim().toLowerCase();
  const user = await User.findOne({
    $or: [
      { email: safeIdentifier },
      { legacyUsername: safeIdentifier },
      { username: safeIdentifier }
    ]
  });
  if (!user) throw new AppError('Email ou senha invalidos', 401);

  const matches = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!matches) throw new AppError('Email ou senha invalidos', 401);

  await User.updateOne({ _id: user._id }, { $set: { status: 'online' } });

  return { token: signToken(user), user: sanitizeUser({ ...user.toObject(), status: 'online' }) };
}

export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('Usuario nao encontrado', 404);
  return sanitizeUser(user);
}

export async function setUserStatus(userId, status) {
  await User.updateOne({ _id: userId }, { $set: { status } });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
