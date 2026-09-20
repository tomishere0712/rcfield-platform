import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppDataSource } from '../config/database';
import { AppError, AuthPayload, AuthRequest, ProviderStatus, UserRole } from '../types';

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwt.secret) as AuthPayload;
    if (!Object.values(UserRole).includes(payload.role)) {
      return next(new AppError('Token role invalid', 401, 'TOKEN_INVALID'));
    }
    req.user = payload;
    // Complete this update before handing the request back to Express so tests
    // and graceful shutdown do not leave an orphaned database query behind.
    if (payload.role === UserRole.STAFF) {
      try {
        await AppDataSource.query(`UPDATE users SET last_active_at = NOW() WHERE id = $1`, [
          payload.userId,
        ]);
      } catch {
        // Presence tracking must never prevent an authenticated request.
      }
    }
    next();
  } catch {
    next(new AppError('Token invalid or expired', 401, 'TOKEN_INVALID'));
  }
}

export function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header) return next();
  if (!header.startsWith('Bearer ')) return next(); // ignore non-Bearer headers, treat as guest

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwt.secret) as AuthPayload;
    if (!Object.values(UserRole).includes(payload.role)) {
      return next(); // ignore invalid role, treat as guest
    }
    req.user = payload;
    next();
  } catch {
    next(); // ignore invalid/expired token, treat as guest
  }
}

export function authorize(
  roles: UserRole[],
  message?: string,
): (req: AuthRequest, res: Response, next: NextFunction) => void;
export function authorize(
  ...roles: UserRole[]
): (req: AuthRequest, res: Response, next: NextFunction) => void;
export function authorize(...args: unknown[]) {
  let roles: UserRole[] = [];
  let customMessage = 'Forbidden';

  if (args.length > 0 && Array.isArray(args[0])) {
    roles = args[0] as UserRole[];
    if (typeof args[1] === 'string') {
      customMessage = args[1];
    }
  } else {
    roles = args as UserRole[];
  }

  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(customMessage, 403, 'FORBIDDEN'));
    }
    next();
  };
}

export function requireActiveProvider(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== UserRole.PROVIDER) return next();

  AppDataSource.query<{ registration_status: string }[]>(
    `SELECT registration_status FROM provider_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [req.user.userId],
  )
    .then((rows) => {
      if (rows.length === 0) {
        return next(
          new AppError(
            'Tài khoản chưa hoàn thành đăng ký hồ sơ đối tác hoặc chưa được phê duyệt',
            403,
            'ACCOUNT_NOT_ACTIVE',
          ),
        );
      }
      const status = rows[0].registration_status;
      if (status !== ProviderStatus.ACTIVE) {
        if (status === ProviderStatus.SUSPENDED) {
          return next(new AppError('Tài khoản đã bị tạm khóa', 403, 'ACCOUNT_SUSPENDED'));
        }
        if (status === ProviderStatus.REJECTED) {
          return next(new AppError('Hồ sơ đăng ký của bạn đã bị từ chối', 403, 'ACCOUNT_REJECTED'));
        }
        return next(new AppError('Tài khoản chưa được phê duyệt', 403, 'ACCOUNT_NOT_ACTIVE'));
      }
      next();
    })
    .catch(next);
}
