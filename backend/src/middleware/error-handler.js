import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Rota nao encontrada: ${req.originalUrl}` });
}

export function errorHandler(error, req, res, _next) {
  logger.error({ error, route: req.originalUrl }, 'Erro nao tratado');
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Erro interno do servidor'
  });
}
