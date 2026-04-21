/**
 * API response helpers — standard format for all endpoints.
 * Success: { "data": ... }
 * Error:   { "error": { code, message, status } }
 */

export function success(res, data, status = 200) {
  res.status(status).json({ data });
}

export function error(res, { code, message, status = 500 }) {
  res.status(status).json({ error: { code, message, status } });
}

export function notFound(res, message = 'Ressource introuvable') {
  error(res, { code: 'NOT_FOUND', message, status: 404 });
}

export function validationError(res, message) {
  error(res, { code: 'VALIDATION_ERROR', message, status: 400 });
}

export function forbidden(res, message = 'Accès interdit') {
  error(res, { code: 'FORBIDDEN', message, status: 403 });
}

export function authRequired(res, message = 'Authentification requise') {
  error(res, { code: 'AUTH_REQUIRED', message, status: 401 });
}
