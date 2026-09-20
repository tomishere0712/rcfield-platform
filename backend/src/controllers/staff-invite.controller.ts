import type { Request, Response, NextFunction } from 'express';
import { ActivateStaffSchema } from '../validate';
import * as staffService from '../services/staff.service';

export const staffInviteController = {
  // GET /api/v1/auth/staff-invite/validate?token=<raw>
  async validateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const data = await staffService.validateInviteToken(token);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/staff-invite/activate
  async activateAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = ActivateStaffSchema.parse(req.body);
      const data = await staffService.activateStaffAccount(body.token, body.password);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
