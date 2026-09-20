import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import {
  getAuthUrl,
  oauthCallback,
  getChannelStatus,
  testChannelConnection,
  disconnectChannel,
} from '../controllers/fb-channel.controller';

export const fbChannelRouter = Router();

// public — Facebook redirects here without JWT
fbChannelRouter.get('/callback', oauthCallback);

fbChannelRouter.use(authenticate, authorize(UserRole.PROVIDER, UserRole.ADMIN));
fbChannelRouter.get('/auth-url', getAuthUrl);
fbChannelRouter.get('/status', getChannelStatus);
fbChannelRouter.post('/test', testChannelConnection);
fbChannelRouter.delete('/', disconnectChannel);
