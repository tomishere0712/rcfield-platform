import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { AuthRequest, UserRole } from '../types';
import { logger } from '../config/logger';
import {
  LoginSchema,
  RegisterSchema,
  GoogleSchema,
  RefreshSchema,
  LogoutSchema,
  ForgotPasswordSchema,
  VerifyPasswordResetCodeSchema,
  ResetPasswordWithCodeSchema,
  UpdateMeSchema,
  ChangePasswordSchema,
} from '../validate';

export const authController = {
  // POST /api/v1/auth/register
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = RegisterSchema.parse(req.body);
      const result = await authService.registerWithPassword({
        ...input,
        role: input.role === 'PROVIDER' ? UserRole.PROVIDER : UserRole.CUSTOMER,
      });
      logger.auth('register', { email: result.user.email, role: result.user.role });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/check-exists
  async checkExists(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, phone } = req.body;
      const result = await authService.checkExists(email, phone);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/login
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = LoginSchema.parse(req.body);
      const result = await authService.loginWithPassword(email, password);
      logger.auth('login', { email, role: result.user.role });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/google
  async googleLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { id_token, credential } = GoogleSchema.parse(req.body);
      const token = id_token ?? credential!;
      const result = await authService.loginWithGoogle(token);
      logger.auth('google login', { email: result.user.email, role: result.user.role });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/refresh
  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refresh_token } = RefreshSchema.parse(req.body);
      const result = await authService.refreshTokens(refresh_token);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/logout  [auth]
  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { refresh_token } = LogoutSchema.parse(req.body);
      await authService.logout(req.user!.userId, refresh_token);
      res.json({ success: true, message: 'Đăng xuất thành công' });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/auth/me  [auth]
  async me(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await authService.getMe(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/auth/me  [auth]
  async updateMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input = UpdateMeSchema.parse(req.body);
      const data = await authService.updateMe(req.user!.userId, input);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/change-password  [auth]
  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const input = ChangePasswordSchema.parse(req.body);
      await authService.changePassword(req.user!.userId, input);
      logger.auth('password changed', { userId: req.user!.userId });
      res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/forgot-password
  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = ForgotPasswordSchema.parse(req.body);
      const data = await authService.requestPasswordReset(email);
      logger.auth('forgot password requested', { email });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/forgot-password/verify
  async verifyPasswordResetCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, code } = VerifyPasswordResetCodeSchema.parse(req.body);
      await authService.verifyPasswordResetCode(email, code);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/reset-password
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, code, password } = ResetPasswordWithCodeSchema.parse(req.body);
      await authService.resetPasswordWithCode(email, code, password);
      logger.auth('password reset completed', { email });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
