import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { AuthRequest } from '../types';

export const adminFeatureFlagsController = {
  // GET /api/v1/admin/feature-flags
  async list(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Một `feature_key` có nhiều dòng: một dòng GLOBAL và một dòng cho mỗi
      // chi nhánh bật lẻ. Thiếu `id`, `display_name` và tên chi nhánh thì màn
      // quản trị hiện ra mấy dòng giống hệt nhau, không ai biết dòng nào của ai.
      const rows = await AppDataSource.query(
        `SELECT f.id,
                f.feature_key,
                f.display_name,
                f.description,
                f.entity_type,
                f.entity_id,
                c.name AS cafe_name,
                f.is_enabled,
                f.config,
                f.updated_at
           FROM feature_flags f
           LEFT JOIN cafes c ON c.id = f.entity_id
          ORDER BY f.feature_key,
                   CASE WHEN f.entity_type = 'GLOBAL' THEN 0 ELSE 1 END,
                   c.name NULLS FIRST`,
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/admin/feature-flags/:id  [auth]
  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Địa chỉ theo `id`, không theo `feature_key`. Trước đây dùng feature_key
      // nên tắt chatbot của MỘT chi nhánh là tắt luôn của mọi chi nhánh và cả
      // cờ GLOBAL — trong khi giao diện bày ra mấy công tắc riêng.
      const { id } = req.params;
      const { isEnabled, config } = req.body as {
        isEnabled?: boolean;
        config?: Record<string, unknown>;
      };

      const setParts: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      let idx = 1;

      if (isEnabled !== undefined) {
        setParts.push(`is_enabled = $${idx++}`);
        params.push(isEnabled);
      }
      if (config !== undefined) {
        setParts.push(`config = $${idx++}`);
        params.push(JSON.stringify(config));
      }
      params.push(id);

      const result = await AppDataSource.query(
        `UPDATE feature_flags
         SET ${setParts.join(', ')}
         WHERE id = $${idx}
         RETURNING id, feature_key, display_name, description, entity_type, entity_id,
                   is_enabled, config, updated_at`,
        params,
      );

      const updated = Array.isArray(result[0]) ? result[0][0] : result[0];
      if (!updated) {
        res.status(404).json({ success: false, error: 'Flag not found' });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
};
