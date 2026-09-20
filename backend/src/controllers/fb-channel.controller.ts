import { Response, NextFunction } from 'express';
import { AppError, AuthRequest } from '../types';
import { env } from '../config/env';
import { FbChannelQuerySchema } from '../validate';
import {
  buildAuthUrl,
  handleOAuthCallback,
  getStatus,
  testConnection,
  disconnect,
} from '../services/fb-channel.service';

// GET /api/v1/channels/facebook/auth-url  [auth]
export async function getAuthUrl(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = FbChannelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }
    const { cafeId, returnPath } = parsed.data;
    const url = await buildAuthUrl(cafeId, req.user!.userId, returnPath, req.user!.role);
    res.json({ url });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/channels/facebook/callback  [public — Facebook OAuth redirect]
export async function oauthCallback(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  const fe = env.frontendUrl;

  // Try to extract returnPath from state for all redirects
  let fallbackPath = '/provider/channels';
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
        returnPath?: string;
      };
      if (parsed.returnPath?.startsWith('/')) fallbackPath = parsed.returnPath;
    } catch {
      // ignore — use default
    }
  }

  if (error) {
    res.redirect(`${fe}${fallbackPath}?status=cancelled`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${fe}${fallbackPath}?status=error&reason=missing_params`);
    return;
  }

  try {
    const { returnPath } = await handleOAuthCallback(code, state);
    const successUrl = new URL(returnPath, fe);
    successUrl.searchParams.set('status', 'connected');
    res.redirect(successUrl.toString());
  } catch (err) {
    if (err instanceof AppError) {
      const errorUrl = new URL(fallbackPath, fe);
      errorUrl.searchParams.set('status', 'error');
      errorUrl.searchParams.set('reason', err.code ?? 'unknown');
      res.redirect(errorUrl.toString());
    } else {
      next(err);
    }
  }
}

// GET /api/v1/channels/facebook/status  [auth]
export async function getChannelStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = FbChannelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }
    const status = await getStatus(parsed.data.cafeId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/channels/facebook/test  [auth]
export async function testChannelConnection(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = FbChannelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }
    const result = await testConnection(parsed.data.cafeId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/channels/facebook  [auth]
export async function disconnectChannel(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = FbChannelQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
    }
    await disconnect(parsed.data.cafeId, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
