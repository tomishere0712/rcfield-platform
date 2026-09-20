import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { AppDataSource } from '../config/database';
import * as aiAnalyticsService from '../services/ai-revenue-analytics.service';

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  cafeId: z.string().uuid().optional(),
});

export const aiRevenueAnalyticsController = {
  // POST /api/v1/provider/dashboard/ai-insights [auth]
  async generateInsights(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = QuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.errors });
        return;
      }

      const { from, to, cafeId } = parsed.data;
      const providerId = req.user!.userId;

      const result = await aiAnalyticsService.generateAiInsights(providerId, from, to, cafeId);

      if (result.type === 'INSUFFICIENT_DATA') {
        res.json({ success: true, type: 'INSUFFICIENT_DATA', data: null });
        return;
      }

      res.json({ success: true, type: 'SUCCESS', data: result.data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/dashboard/feature-flags [auth]
  async getProviderFeatureFlags(
    _req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const rows = await AppDataSource.query<{ feature_key: string; is_enabled: boolean }[]>(
        `SELECT feature_key, is_enabled FROM feature_flags
         WHERE entity_type = 'GLOBAL' AND feature_key IN ('AI_REVENUE_ANALYTICS')`,
      );
      const flags: Record<string, boolean> = {};
      for (const row of rows) {
        flags[row.feature_key] = row.is_enabled;
      }
      res.json({ success: true, data: flags });
    } catch (err) {
      next(err);
    }
  },
};
