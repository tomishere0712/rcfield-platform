import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types';
import * as ledgerService from '../services/admin-payment-ledger.service';
import { AdminLedgerQuerySchema } from '../validate';

export const adminPaymentLedgerController = {
  // GET /api/v1/admin/payments  [auth]
  async listLedger(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = AdminLedgerQuerySchema.parse(req.query);
      const result = await ledgerService.listPlatformLedger(query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },
};
