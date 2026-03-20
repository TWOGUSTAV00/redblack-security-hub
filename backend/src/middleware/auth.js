import { verifyToken } from '../auth/auth.service.js';
import { AppError } from '../utils/errors.js';

export function requireAuth(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    if (!token) {
      throw new AppError('Sessao expirada ou nao autenticada', 401);
    }

    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      _id: payload.sub,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.avatarUrl || ''
    };
    next();
  } catch (error) {
    next(error.statusCode ? error : new AppError('Token invalido', 401));
  }
}
