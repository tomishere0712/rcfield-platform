import { Router } from 'express';
import { racingNetworkController } from '../controllers/racing-network.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

export const racingNetworkRouter = Router();

racingNetworkRouter.get('/leaderboards/global', racingNetworkController.listGlobalLeaderboard);
racingNetworkRouter.get('/achievements', racingNetworkController.listAchievements);
racingNetworkRouter.get('/drivers/:handle', racingNetworkController.getPublicDriverProfile);
racingNetworkRouter.get(
  '/me/driver-passport',
  authenticate,
  authorize(UserRole.CUSTOMER),
  racingNetworkController.getMyDriverPassport,
);
racingNetworkRouter.patch(
  '/me/driver-passport',
  authenticate,
  authorize(UserRole.CUSTOMER),
  racingNetworkController.updateMyDriverPassport,
);
