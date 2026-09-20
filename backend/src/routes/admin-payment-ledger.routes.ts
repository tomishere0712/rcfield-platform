import { Router } from 'express';
import { adminPaymentLedgerController } from '../controllers/admin-payment-ledger.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

export const adminPaymentLedgerRouter = Router();

adminPaymentLedgerRouter.use(authenticate, authorize(UserRole.ADMIN));

// GET /api/v1/admin/payments
adminPaymentLedgerRouter.get('/', adminPaymentLedgerController.listLedger);
