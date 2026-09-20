import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { upsertWidgetConfig } from '../services/chat.service';
import { UserRole, WidgetConfigData } from '../types';

const router = Router();

// GET /api/system/widget-config
// Returns the system cafe ID and widget config for the landing page chat demo
router.get('/widget-config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const ds = AppDataSource;

    const [cafe] = await ds.query<{ id: string; slug: string; widget_config: WidgetConfigData }[]>(
      `SELECT id, slug, widget_config FROM cafes WHERE slug = 'rcfield-system' AND status = 'ACTIVE' LIMIT 1`,
    );

    if (!cafe) {
      res.status(503).json({ success: false, message: 'System chat not available' });
      return;
    }

    const config = cafe.widget_config;

    res.json({
      success: true,
      data: {
        cafeId: cafe.id,
        cafeSlug: cafe.slug,
        greetingMessage: config?.greetingMessage ?? 'Xin chào! Tôi có thể giúp gì cho bạn?',
        position: config?.position ?? 'BOTTOM_RIGHT',
        primaryColor: config?.primaryColor ?? '#EA580C',
        quickReplies: config?.quickReplies ?? [],
        systemPrompt: config?.systemPrompt ?? null,
        isEnabled: config?.isEnabled ?? false,
        fullPageEnabled: config?.fullPageEnabled ?? false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/system/widget-config  [admin]
router.put(
  '/widget-config',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ds = AppDataSource;

      const [cafe] = await ds.query<{ id: string }[]>(
        `SELECT id FROM cafes WHERE slug = 'rcfield-system' AND status = 'ACTIVE' LIMIT 1`,
      );

      if (!cafe) {
        res.status(503).json({ success: false, message: 'System chat not available' });
        return;
      }

      const {
        greetingMessage,
        position,
        primaryColor,
        quickReplies,
        systemPrompt,
        isEnabled,
        fullPageEnabled,
      } = req.body as {
        greetingMessage?: string;
        position?: string;
        primaryColor?: string;
        quickReplies?: string[];
        systemPrompt?: string | null;
        isEnabled?: boolean;
        fullPageEnabled?: boolean;
      };

      await upsertWidgetConfig(cafe.id, {
        ...(greetingMessage !== undefined && { greetingMessage }),
        ...(position !== undefined && { position }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(quickReplies !== undefined && { quickReplies }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(isEnabled !== undefined && { isEnabled }),
        ...(fullPageEnabled !== undefined && { fullPageEnabled }),
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as systemRouter };
