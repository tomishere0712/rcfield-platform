import { Router } from 'express';
import { staffInviteController } from '../controllers/staff-invite.controller';

export const staffInviteRouter = Router();

staffInviteRouter.get('/validate', staffInviteController.validateToken);
staffInviteRouter.post('/activate', staffInviteController.activateAccount);
