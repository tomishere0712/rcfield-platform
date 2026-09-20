import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { paymentRequestController } from '../controllers/payment-request.controller';

export const adminPaymentRequestRouter = Router();

adminPaymentRequestRouter.use(authenticate, authorize(UserRole.ADMIN));

adminPaymentRequestRouter.get('/', paymentRequestController.listAllPaymentRequests);
adminPaymentRequestRouter.post('/:id/confirm', paymentRequestController.confirmPaymentRequest);
adminPaymentRequestRouter.post('/:id/reject', paymentRequestController.rejectPaymentRequest);
