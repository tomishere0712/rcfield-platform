import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IsNull } from 'typeorm';
import {
  AppError,
  AuthPayload,
  AuthRequest,
  KycBusinessType,
  ProviderStatus,
  UserRole,
} from '../types';
import {
  RegisterProviderSchema,
  AdminRejectSchema,
  AdminProviderQuerySchema,
  UpdateProviderProfileSchema,
} from '../validate';
import * as providerOnboardingService from '../services/provider-onboarding.service';
import { lookupBusinessByTaxCode } from '../services/tax-lookup.service';
import { AppDataSource } from '../config/database';
import { Cafe } from '../models/cafe.entity';
import { env } from '../config/env';

export const providerOnboardingController = {
  // POST /api/v1/auth/register-provider
  async registerProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // multer populates req.body as strings (multipart), parse after multer runs
      const body = RegisterProviderSchema.parse(req.body);
      const files = (req.files as Record<string, Express.Multer.File[]>) ?? {};
      const user = await providerOnboardingService.register(
        { ...body, business_type: body.business_type as KycBusinessType },
        files,
      );
      res.status(201).json({ success: true, data: { id: user.id, email: user.email } });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/provider/kyc/resubmit  [auth]
  async resubmitKyc(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const providerId = req.user!.userId;
      const businessType = req.body.business_type as KycBusinessType;
      if (!businessType || !['INDIVIDUAL', 'BUSINESS'].includes(businessType)) {
        return next(new AppError('business_type không hợp lệ', 400, 'VALIDATION_ERROR'));
      }
      const files = (req.files as Record<string, Express.Multer.File[]>) ?? {};
      const result = await providerOnboardingService.resubmit(providerId, businessType, files);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/kyc/status  [auth]
  async getKycStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await providerOnboardingService.getKycStatus(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/providers  [auth]
  async getProviders(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = AdminProviderQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return next(new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR'));
      }
      const { status, page, limit } = parsed.data;
      const result = await providerOnboardingService.listProviders({
        status: status as ProviderStatus | undefined,
        page,
        limit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/providers/:id  [auth]
  async getProviderDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await providerOnboardingService.getProviderDetail(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/providers/:id/approve  [auth]
  async approveProvider(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await providerOnboardingService.approve(req.params.id, req.user!.userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/providers/:id/reject  [auth]
  async rejectProvider(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = AdminRejectSchema.parse(req.body);
      await providerOnboardingService.reject(req.params.id, req.user!.userId, reason);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/providers/:id/suspend  [auth]
  async suspendProvider(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = AdminRejectSchema.parse(req.body);
      await providerOnboardingService.suspend(req.params.id, req.user!.userId, reason);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/providers/:id/unsuspend  [auth]
  async unsuspendProvider(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await providerOnboardingService.unsuspend(req.params.id, req.user!.userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/admin/providers/:id/cafes  [auth]
  async getProviderCafes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cafes = await AppDataSource.getRepository(Cafe).find({
        where: { providerId: req.params.id, deletedAt: IsNull() },
        select: ['id', 'name', 'address', 'status'],
        order: { name: 'ASC' },
      });
      res.json({ data: cafes });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/providers/:id/impersonate  [auth]
  async impersonateProvider(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const detail = (await providerOnboardingService.getProviderDetail(id)) as {
        registration_status: string;
        email: string;
        business_name: string;
      };
      if (detail.registration_status !== ProviderStatus.ACTIVE) {
        return next(
          new AppError(
            'Impersonation is only allowed for ACTIVE providers',
            400,
            'PROVIDER_NOT_ACTIVE',
          ),
        );
      }

      const payload: AuthPayload = {
        userId: id,
        role: UserRole.PROVIDER,
        email: detail.email,
        impersonated_by: req.user!.userId,
      };

      const token = jwt.sign(payload, env.jwt.secret, { expiresIn: '2h' });

      res.json({
        token,
        expires_in: 7200,
        provider: { id, business_name: detail.business_name },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/provider/me  [auth]
  async getProviderMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || req.user.role !== UserRole.PROVIDER) {
        return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
      }
      const data = await providerOnboardingService.getProviderDetail(req.user.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/business-lookup/:taxCode
  async lookupBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const outcome = await lookupBusinessByTaxCode(req.params.taxCode);
      // Luôn 200: "không tìm thấy" là một câu trả lời hợp lệ của việc tra cứu,
      // không phải lỗi của người gọi. Form đọc `status` để quyết định.
      res.json({ success: true, data: outcome });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/provider/me  [auth]
  async updateProviderMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user || req.user.role !== UserRole.PROVIDER) {
        return next(new AppError('Forbidden', 403, 'FORBIDDEN'));
      }
      const body = UpdateProviderProfileSchema.parse(req.body);
      const data = await providerOnboardingService.updateProviderProfile(req.user.userId, body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
