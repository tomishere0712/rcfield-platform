import { NextFunction, Response } from 'express';
import { AdminUserQuerySchema, ModerateUserSchema } from '../validate';
import * as adminUserService from '../services/admin-user.service';
import { AppError, AuthRequest } from '../types';

export const adminUserController = {
  // GET /api/v1/admin/users  [auth]
  async listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = AdminUserQuerySchema.parse(req.query);
      const result = await adminUserService.listUsers(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/users/:userId  [auth]
  async getUserDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminUserService.getUserDetail(req.params.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/users/:userId/lock  [auth]
  async lockUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = ModerateUserSchema.parse(req.body);
      // Tự khoá chính mình là mất đường vào trang quản trị, và không có cách
      // nào tự mở lại từ trong ứng dụng. Chặn trước khi vào service.
      if (req.params.userId === req.user!.userId) {
        throw new AppError('Không thể tự khoá tài khoản của chính mình', 400, 'CANNOT_LOCK_SELF');
      }
      const data = await adminUserService.lockUser(req.params.userId, req.user!.userId, reason);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/users/:userId/unlock  [auth]
  async unlockUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = ModerateUserSchema.parse(req.body);
      const data = await adminUserService.unlockUser(req.params.userId, req.user!.userId, reason);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
