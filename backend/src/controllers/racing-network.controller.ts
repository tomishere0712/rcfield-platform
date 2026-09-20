import type { NextFunction, Request, Response } from 'express';
import { AppError, AuthRequest } from '../types';
import { GlobalLeaderboardQuerySchema, UpdateDriverPassportSchema } from '../validate';
import * as racingNetworkService from '../services/racing-network.service';

function requireViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, role: req.user.role };
}

export const racingNetworkController = {
  // GET /api/v1/me/driver-passport  [auth]
  async getMyDriverPassport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const data = await racingNetworkService.getMyDriverPassport(viewer);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // PATCH /api/v1/me/driver-passport  [auth]
  async updateMyDriverPassport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireViewer(req);
      const body = UpdateDriverPassportSchema.parse(req.body);
      const data = await racingNetworkService.updateMyDriverPassport(viewer, body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/drivers/:handle
  async getPublicDriverProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const handle = String(req.params.handle ?? '').trim();
      if (!handle) throw new AppError('Thiếu driver handle', 400, 'DRIVER_HANDLE_REQUIRED');
      const data = await racingNetworkService.getPublicDriverProfile(handle);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/leaderboards/global
  async listGlobalLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const query = GlobalLeaderboardQuerySchema.parse(req.query);
      const data = await racingNetworkService.listGlobalLeaderboard(query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/achievements
  async listAchievements(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await racingNetworkService.listAchievements();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
