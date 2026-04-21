import { error } from '../utils/response.js';
import { NODE_ENV } from '../config/index.js';

export default function errorHandler(err, req, res, _next) {
  console.error('❌ Unhandled error:', err.message);

  if (res.headersSent) return _next(err);

  const status = err.status || 500;
  error(res, {
    code: err.code || 'INTERNAL_ERROR',
    message: NODE_ENV === 'production' ? 'Erreur interne du serveur' : err.message,
    status
  });
}
