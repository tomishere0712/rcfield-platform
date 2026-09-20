import { Response, NextFunction } from 'express';
import { AppError, AuthRequest, PaymentRequestStatus } from '../types';
import {
  SubmitPaymentRequestSchema,
  AdminRejectSchema,
  AdminPaymentRequestQuerySchema,
  AdminConfirmPaymentSchema,
  GetPayOSLinkSchema,
} from '../validate';
import * as paymentRequestService from '../services/payment-request.service';
import * as subscriptionService from '../services/subscription.service';
import * as payosService from '../services/payos.service';
import { AppDataSource } from '../config/database';
import { ProviderProfile } from '../models/provider-profile.entity';
import { SubscriptionPlan } from '../models/subscription-plan.entity';
import { PaymentRequest } from '../models/payment-request.entity';

export const paymentRequestController = {
  // GET /api/v1/provider/subscription  [auth]
  async getSubscriptionStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const sub = await subscriptionService.getActive(providerId);

      // Trả kèm ở cấp ngoài chứ không nhét vào `data`: `getActive` trả null khi
      // gói đã hết hạn, mà đó lại đúng lúc giao diện cần biết suất dùng thử đã
      // tiêu hay chưa để khoá nút.
      const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
        where: { userId: providerId },
      });

      // Số kênh đang kết nối không nằm trong thực thể gói — nó đếm từ
      // `cafe_channels`. Trả kèm ở đây để giao diện khỏi phải tự đếm bằng một
      // câu truy vấn khác rồi lệch với chốt chặn hạn mức.
      const channelsUsed = await subscriptionService.countConnectedChannels(providerId);

      res.json({
        success: true,
        data: sub,
        trial_used_at: profile?.trialUsedAt ?? null,
        channels_used: channelsUsed,
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/payment-requests  [auth]
  async submitPaymentRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = SubmitPaymentRequestSchema.parse(req.body);
      const request = await paymentRequestService.submit(req.user!.userId, body);
      res.status(201).json({ success: true, data: request });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/payment-requests/payos-link  [auth]
  async getPayOSLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { plan_id, payment_request_id } = GetPayOSLinkSchema.parse(req.body);
      const providerId = req.user!.userId;
      const prRepo = AppDataSource.getRepository(PaymentRequest);
      const planRepo = AppDataSource.getRepository(SubscriptionPlan);

      let request: PaymentRequest;
      let plan: SubscriptionPlan;

      if (payment_request_id) {
        // Luồng thanh toán lại cho yêu cầu thanh toán cũ
        const existing = await prRepo.findOne({
          where: { id: payment_request_id, providerId },
        });
        if (!existing) {
          throw new AppError('Yêu cầu thanh toán không tồn tại', 404, 'NOT_FOUND');
        }
        if (existing.status === PaymentRequestStatus.CONFIRMED) {
          throw new AppError(
            'Yêu cầu này đã được thanh toán thành công trước đó',
            400,
            'ALREADY_PAID',
          );
        }

        const planData = await planRepo.findOne({ where: { id: existing.planId } });
        if (!planData) {
          throw new AppError('Gói đăng ký không tồn tại', 404, 'NOT_FOUND');
        }

        request = existing;
        plan = planData;
      } else {
        // Luồng tạo mới yêu cầu thanh toán
        const planData = await planRepo.findOne({ where: { id: plan_id } });
        if (!planData) {
          throw new AppError('Gói đăng ký không tồn tại', 404, 'NOT_FOUND');
        }

        if (planData.isTrial) {
          const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
            where: { userId: providerId },
          });
          if (profile?.trialUsedAt) {
            throw new AppError(
              'Bạn đã sử dụng gói dùng thử. Mỗi tài khoản chỉ được dùng thử một lần.',
              409,
              'TRIAL_ALREADY_USED',
            );
          }
        }

        // Tự động huỷ (chuyển sang REJECTED) các yêu cầu thanh toán PENDING cũ của provider này
        // để tránh việc bị block khi tạo yêu cầu mới
        const pendingRequests = await prRepo.find({
          where: { providerId, status: PaymentRequestStatus.PENDING },
        });
        for (const pr of pendingRequests) {
          pr.status = PaymentRequestStatus.REJECTED;
          pr.adminNotes = 'Hủy để tạo yêu cầu thanh toán mới.';
          pr.reviewedAt = new Date();
          await prRepo.save(pr);
        }

        const today = new Date();
        const transferDate = today.toISOString().slice(0, 10);

        const newRequest = prRepo.create({
          providerId,
          planId: planData.id,
          transferReference: 'PENDING_PAYOS', // Sẽ được ghi đè bằng orderCode của PayOS
          transferDate,
          transferAmount: Number(planData.pricePerMonth),
          status: PaymentRequestStatus.PENDING,
        });

        request = await prRepo.save(newRequest);
        plan = planData;
      }

      const result = await payosService.createPaymentLink(request, plan.name);
      res.json({
        success: true,
        data: {
          checkoutUrl: result.checkoutUrl,
          orderCode: result.orderCode,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/payment-requests  [auth]
  async listMyPaymentRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
      const result = await paymentRequestService.listForProvider(req.user!.userId, { page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/payment-requests  [auth]
  async listAllPaymentRequests(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = AdminPaymentRequestQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
      }
      const { status, page, limit } = parsed.data;
      const result = await paymentRequestService.listAll({
        status: status as PaymentRequestStatus | undefined,
        page,
        limit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/payment-requests/:id/confirm  [auth]
  async confirmPaymentRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { notes } = AdminConfirmPaymentSchema.parse(req.body);
      await paymentRequestService.confirm(req.params.id, req.user!.userId, notes);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/payment-requests/:id/reject  [auth]
  async rejectPaymentRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = AdminRejectSchema.parse(req.body);
      await paymentRequestService.reject(req.params.id, req.user!.userId, reason);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
