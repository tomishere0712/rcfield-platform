import { Router } from 'express';
import { verifyWebhook, handleWebhookEvent } from '../controllers/fb-webhook.controller';

export const fbWebhookRouter = Router();

fbWebhookRouter.get('/', verifyWebhook);
fbWebhookRouter.post('/', handleWebhookEvent);
