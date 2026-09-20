import type { NextFunction, Response } from 'express';
import { AppError, AuthRequest, ContestFeeOrderStatus, UserRole } from '../types';
import {
  ContestFeeOrderCreateSchema,
  ContestFeeOrderRejectSchema,
  ContestFeeOrderReviewSchema,
  ContestFeePayOSVerifySchema,
  ContestFeeTransferSchema,
} from '../validate';
import * as contestFeeService from '../services/contest-fee.service';

function requireViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, role: req.user.role };
}

function requireAdmin(req: AuthRequest) {
  const viewer = requireViewer(req);
  if (viewer.role !== UserRole.ADMIN) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  return viewer;
}

export const contestFeeController = {
  // GET /api/v1/contest-fee-plans  [auth]
  async listPlans(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await contestFeeService.listContestFeePlans();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/contests/:contestId/fee  [auth]
  async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestFeeService.getContestFeeStatus(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/fee/order  [auth]
  async createOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestFeeOrderCreateSchema.parse(req.body);
      const data = await contestFeeService.createContestFeeOrder(
        req.params.contestId,
        viewer,
        body.plan_id,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/fee/payos-link  [auth]
  async createPayOSLink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestFeeService.createContestFeePayOSLink(req.params.contestId, viewer);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/fee/payos-verify  [auth]
  async verifyPayOS(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestFeePayOSVerifySchema.parse(req.body);
      // Kiểm quyền trước khi tra theo mã đơn: thiếu bước này thì ai đoán được
      // mã PayOS cũng đọc được đơn phí của giải người khác.
      await contestFeeService.getContestFeeStatus(req.params.contestId, viewer);
      const data = await contestFeeService.verifyContestFeePayOS(body.order_code);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/contests/:contestId/fee/transfer  [auth]
  async submitTransfer(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = ContestFeeTransferSchema.parse(req.body);
      const data = await contestFeeService.submitContestFeeTransfer(
        req.params.contestId,
        viewer,
        body,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/v1/contests/:contestId/fee/order  [auth]
  async cancelOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await contestFeeService.cancelContestFeeOrder(req.params.contestId, viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/admin/contest-fee-orders  [auth]
  async listForAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      requireAdmin(req);
      const status = req.query.status as ContestFeeOrderStatus | undefined;
      const result = await contestFeeService.listContestFeeOrdersForAdmin({
        status,
        page: Math.max(1, Number(req.query.page ?? 1)),
        limit: Math.min(100, Math.max(1, Number(req.query.limit ?? 20))),
      });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/admin/contest-fee-orders/:orderId/confirm  [auth]
  async confirm(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireAdmin(req);
      const body = ContestFeeOrderReviewSchema.parse(req.body ?? {});
      const data = await contestFeeService.confirmContestFeeOrder(
        req.params.orderId,
        viewer.userId,
        body.notes,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/admin/contest-fee-orders/:orderId/reject  [auth]
  async reject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireAdmin(req);
      const body = ContestFeeOrderRejectSchema.parse(req.body);
      const data = await contestFeeService.rejectContestFeeOrder(
        req.params.orderId,
        viewer.userId,
        body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
