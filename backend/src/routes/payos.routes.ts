import { Router } from 'express';
import { payosController } from '../controllers/payos.controller';

export const payosRouter = Router();

// Endpoint công khai cho PayOS gửi webhook tự động
payosRouter.post('/webhook', payosController.handleWebhook);

// Endpoint cho Frontend gọi để chủ động verify trạng thái
payosRouter.post('/verify-payment', payosController.verifyPayment);
