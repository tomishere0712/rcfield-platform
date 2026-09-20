import type { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { SubscriptionPlan } from '../models/subscription-plan.entity';
import { AppError } from '../types';
import { UpdateSubscriptionPlanSchema } from '../validate';
import type { AuthRequest } from '../types';

export const adminSubscriptionPlanController = {
  // GET /api/v1/admin/subscription-plans  [auth]
  async listPlans(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(SubscriptionPlan);
      const plans = await repo.find({ order: { pricePerMonth: 'ASC' } });
      res.json(plans.map(formatPlan));
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/admin/subscription-plans/:id  [auth]
  async updatePlan(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = UpdateSubscriptionPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('Dữ liệu không hợp lệ', 400, 'VALIDATION_ERROR');
      }

      const repo = AppDataSource.getRepository(SubscriptionPlan);
      const plan = await repo.findOne({ where: { id: req.params.id } });
      if (!plan) throw new AppError('Không tìm thấy gói', 404, 'NOT_FOUND');

      const { branch_limit, ai_quota_per_month, channel_limit, price_per_month } = parsed.data;
      if (branch_limit !== undefined) plan.branchLimit = branch_limit;
      if (ai_quota_per_month !== undefined) plan.aiQuotaPerMonth = ai_quota_per_month;
      if (channel_limit !== undefined) plan.channelLimit = channel_limit;
      if (price_per_month !== undefined) plan.pricePerMonth = price_per_month;

      await repo.save(plan);
      res.json(formatPlan(plan));
    } catch (err) {
      next(err);
    }
  },
};

function formatPlan(p: SubscriptionPlan) {
  return {
    id: p.id,
    name: p.name,
    branchLimit: p.branchLimit,
    aiQuotaPerMonth: p.aiQuotaPerMonth,
    channelLimit: p.channelLimit,
    pricePerMonth: Number(p.pricePerMonth),
    isTrial: p.isTrial,
    updatedAt: p.updatedAt,
  };
}
