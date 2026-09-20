import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createVnpayPayment,
  handleVnpayIpn,
  handleVnpayReturn,
} from '../controllers/vnpay.controller';

export const vnpayRouter = Router();

vnpayRouter.get('/return', handleVnpayReturn);
vnpayRouter.get('/ipn', handleVnpayIpn);
vnpayRouter.post('/create-url', authenticate, createVnpayPayment);
