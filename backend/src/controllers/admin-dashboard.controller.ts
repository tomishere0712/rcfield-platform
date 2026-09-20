import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import * as adminDashboardService from '../services/admin-dashboard.service';

export const adminDashboardController = {
  // GET /api/v1/admin/dashboard/summary
  async getSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const period = typeof req.query.period === 'string' ? req.query.period : 'monthly';
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;

      const summary = await adminDashboardService.getAdminDashboardSummary(period, from, to);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  },
};
