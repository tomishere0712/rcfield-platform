import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

const SENSITIVE = new Set(['password', 'token', 'refresh_token', 'id_token', 'access_token']);

function maskBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE.has(k) ? '********' : v,
    ]),
  );
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const hasBody =
    ['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0;

  if (hasBody) {
    logger.debug('HTTP', `${req.method} ${req.path} body`, maskBody(req.body));
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const ms = Date.now() - start;
    const status = res.statusCode;

    logger.http(req.method, req.path, status, ms);

    if (status >= 400 && body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      logger.warn('HTTP', `${req.method} ${req.path}`, { code: b.code, message: b.message });
    }

    return originalJson(body);
  };

  next();
}
