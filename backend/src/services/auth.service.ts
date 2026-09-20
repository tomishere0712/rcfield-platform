import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import {
  AppError,
  UserRole,
  AuthProvider,
  ProviderStatus,
  CafeStatus,
  isSyntheticGuestEmail,
} from '../types';
import { normalizePhone } from './fb-soft-user';
import { User } from '../models/user.entity';
import { RefreshToken } from '../models/refresh-token.entity';
import { ProviderProfile } from '../models/provider-profile.entity';
import { PasswordResetToken } from '../models/password-reset-token.entity';
import { emailService } from './email.service';

const BRUTE_FORCE_MAX = 5;
const BRUTE_FORCE_TTL = 900; // 15 minutes
const REFRESH_EXPIRY_DAYS = 7;

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface LoginResult extends TokenPair {
  user: UserProfile & { registrationStatus?: string };
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  assignedCafeId?: string | null;
  trustScore?: number;
}

export interface RegisterInput {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole.CUSTOMER | UserRole.PROVIDER;
}

class AuthService {
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }

  private get tokenRepo() {
    return AppDataSource.getRepository(RefreshToken);
  }

  private get passwordResetRepo() {
    return AppDataSource.getRepository(PasswordResetToken);
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private hashPasswordResetCode(userId: string, email: string, code: string): string {
    return this.hashToken(`${userId}:${email}:${code}:${env.jwt.secret}`);
  }

  private toUserProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      role: user.role,
      trustScore: Number(user.trust_score),
    };
  }

  private async getAssignedCafeId(userId: string): Promise<string | null> {
    const [assignment] = await AppDataSource.query<{ cafe_id: string }[]>(
      `SELECT sca.cafe_id
         FROM staff_cafe_assignments sca
         JOIN cafes c ON c.id = sca.cafe_id
        WHERE sca.staff_id = $1
          AND c.deleted_at IS NULL
          AND c.status = $2
        LIMIT 1`,
      [userId, CafeStatus.ACTIVE],
    );
    return assignment ? assignment.cafe_id : null;
  }

  private async toUserProfileAsync(user: User): Promise<UserProfile> {
    const profile = this.toUserProfile(user);
    if (user.role === UserRole.STAFF) {
      profile.assignedCafeId = await this.getAssignedCafeId(user.id);
    }
    return profile;
  }

  async issueTokenPair(user: User): Promise<TokenPair> {
    const cafeId = user.role === UserRole.STAFF ? await this.getAssignedCafeId(user.id) : undefined;

    const access_token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, ...(cafeId && { cafeId }) },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn as jwt.SignOptions['expiresIn'] },
    );

    const raw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS);

    await this.tokenRepo.save(
      this.tokenRepo.create({
        user_id: user.id,
        token: this.hashToken(raw),
        expires_at: expiresAt,
      }),
    );

    return { access_token, refresh_token: raw };
  }

  async loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const failKey = `auth:failed:${email}`;

    const fails = Number((await redis.get(failKey)) ?? 0);
    if (fails >= BRUTE_FORCE_MAX) {
      throw new AppError('Tài khoản bị khoá', 403, 'ACCOUNT_LOCKED');
    }

    const user = await this.userRepo.findOne({ where: { email } });

    if (!user || !user.password_hash) {
      await redis.incr(failKey);
      await redis.expire(failKey, BRUTE_FORCE_TTL);
      throw new AppError('Email hoặc mật khẩu không đúng', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await redis.incr(failKey);
      await redis.expire(failKey, BRUTE_FORCE_TTL);
      throw new AppError('Email hoặc mật khẩu không đúng', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      throw new AppError('Tài khoản bị khoá', 403, 'ACCOUNT_LOCKED');
    }

    await redis.del(failKey);
    const tokens = await this.issueTokenPair(user);
    let registrationStatus: string | undefined;
    if (user.role === UserRole.PROVIDER) {
      const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
        where: { userId: user.id },
      });
      registrationStatus = profile?.registrationStatus ?? ProviderStatus.PENDING;
    }
    return {
      ...tokens,
      user: { ...(await this.toUserProfileAsync(user)), registrationStatus },
    };
  }

  async registerWithPassword(input: RegisterInput): Promise<LoginResult> {
    const email = input.email.toLowerCase().trim();
    const emailExisting = await this.userRepo.findOne({ where: { email } });

    let phoneExisting: User | null = null;
    let guestUser: User | null = null;
    if (input.phone) {
      /*
        Chuẩn hoá số điện thoại TRƯỚC khi tra, đúng cách luồng đặt lịch qua
        Facebook đang làm.

        Tài khoản mềm luôn được lưu ở dạng `0xxxxxxxxx`. Khách đăng ký bằng
        `+84xxxxxxxxx` mà tra thô thì không thấy dòng nào, và hệ thống tạo một
        tài khoản THỨ HAI — lịch sử đặt lịch của họ nằm lại ở tài khoản mềm cũ,
        không ai gộp lại được nữa vì hai dòng khác `id`.
      */
      const trimmedPhone = normalizePhone(input.phone) ?? input.phone.trim();
      const foundPhoneUser = await this.userRepo.findOne({
        where: {
          phone: trimmedPhone,
        },
      });

      if (foundPhoneUser) {
        // Dùng hằng số dùng chung, KHÔNG chép lại chuỗi hậu tố. Đây là nơi thứ
        // tư đọc tới nó — chép tay một nơi là chỗ đó lệch khỏi ba nơi kia mà
        // không ai biết, và khách mất đường nâng cấp tài khoản.
        const isGuest =
          isSyntheticGuestEmail(foundPhoneUser.email) && !foundPhoneUser.password_hash;
        if (!isGuest) {
          phoneExisting = foundPhoneUser;
        } else {
          guestUser = foundPhoneUser;
        }
      }
    }

    if (emailExisting || phoneExisting) {
      const details: Record<string, string> = {};
      if (emailExisting) {
        details.email = 'Email đã được sử dụng';
      }
      if (phoneExisting) {
        details.phone = 'Số điện thoại đã được sử dụng';
      }
      throw new AppError('Thông tin đăng ký đã tồn tại', 409, 'REGISTRATION_CONFLICT', details);
    }

    const password_hash = await bcrypt.hash(input.password, 10);
    const user = await AppDataSource.transaction(async (manager) => {
      let saved: User;
      if (guestUser) {
        // Upgrade the existing guest user
        guestUser.email = email;
        guestUser.full_name = input.full_name.trim();
        guestUser.password_hash = password_hash;
        guestUser.role = input.role;
        guestUser.auth_provider = AuthProvider.LOCAL;
        guestUser.is_active = true;
        saved = await manager.save(User, guestUser);
      } else {
        saved = await manager.save(
          manager.create(User, {
            email,
            full_name: input.full_name.trim(),
            phone: input.phone ? (normalizePhone(input.phone) ?? input.phone.trim()) : null,
            password_hash,
            role: input.role,
            auth_provider: AuthProvider.LOCAL,
            is_active: true,
          }),
        );
      }

      if (input.role === UserRole.PROVIDER) {
        await manager.save(
          manager.create(ProviderProfile, {
            userId: saved.id,
            businessName: input.full_name.trim(),
            registrationStatus: ProviderStatus.PENDING,
          }),
        );
      }
      return saved;
    });

    const tokens = await this.issueTokenPair(user);
    let regStatus: string | undefined;
    if (user.role === UserRole.PROVIDER) {
      regStatus = ProviderStatus.PENDING;
    }
    return {
      ...tokens,
      user: { ...(await this.toUserProfileAsync(user)), registrationStatus: regStatus },
    };
  }

  async loginWithGoogle(idToken: string): Promise<LoginResult> {
    if (!env.google.clientId) {
      throw new AppError('Google Client ID chưa được cấu hình', 500, 'GOOGLE_CONFIG_MISSING');
    }

    let email: string;
    let googleId: string;
    let fullName: string;
    let avatarUrl: string | null;

    try {
      const client = new OAuth2Client(env.google.clientId);
      const ticket = await client.verifyIdToken({ idToken, audience: env.google.clientId });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error('No email in payload');
      if (!payload.sub) throw new Error('No subject in payload');
      email = payload.email.toLowerCase().trim();
      googleId = payload.sub;
      fullName = payload.name?.trim() || email.split('@')[0];
      avatarUrl = payload.picture ?? null;
    } catch {
      throw new AppError('Xác thực Google thất bại', 401, 'GOOGLE_AUTH_FAILED');
    }

    let user = await this.userRepo.findOne({ where: [{ google_id: googleId }, { email }] });

    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({
          email,
          full_name: fullName,
          role: UserRole.CUSTOMER,
          auth_provider: AuthProvider.GOOGLE,
          google_id: googleId,
          avatar_url: avatarUrl,
          is_active: true,
        }),
      );
    } else if (user.auth_provider === AuthProvider.LOCAL) {
      user.auth_provider = AuthProvider.GOOGLE;
      user.google_id = googleId;
      if (!user.full_name) user.full_name = fullName;
      if (!user.avatar_url && avatarUrl) user.avatar_url = avatarUrl;
      user = await this.userRepo.save(user);
    } else if (!user.google_id) {
      user.google_id = googleId;
      if (!user.avatar_url && avatarUrl) user.avatar_url = avatarUrl;
      user = await this.userRepo.save(user);
    } else if (!user.avatar_url && avatarUrl) {
      user.avatar_url = avatarUrl;
      user = await this.userRepo.save(user);
    }

    if (!user.is_active) {
      throw new AppError('Tài khoản bị khoá', 403, 'ACCOUNT_LOCKED');
    }

    const tokens = await this.issueTokenPair(user);
    let registrationStatus: string | undefined;
    if (user.role === UserRole.PROVIDER) {
      const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
        where: { userId: user.id },
      });
      registrationStatus = profile?.registrationStatus ?? ProviderStatus.PENDING;
    }
    return {
      ...tokens,
      user: { ...(await this.toUserProfileAsync(user)), registrationStatus },
    };
  }

  async getMe(userId: string): Promise<UserProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new AppError('Người dùng không tồn tại', 404, 'USER_NOT_FOUND');
    return await this.toUserProfileAsync(user);
  }

  async updateMe(
    userId: string,
    input: { full_name?: string; phone?: string | null; avatar_url?: string | null },
  ): Promise<UserProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new AppError('Người dùng không tồn tại', 404, 'USER_NOT_FOUND');

    if (input.full_name !== undefined) user.full_name = input.full_name.trim();
    if (input.phone !== undefined) {
      const newPhone = input.phone ? input.phone.trim() : null;
      if (newPhone) {
        const existingPhoneUser = await this.userRepo.findOne({
          where: { phone: newPhone },
        });
        if (existingPhoneUser && existingPhoneUser.id !== userId) {
          throw new AppError(
            'Số điện thoại này đã được sử dụng bởi tài khoản khác',
            409,
            'PHONE_ALREADY_EXISTS',
          );
        }
      }
      user.phone = newPhone;
    }
    if (input.avatar_url !== undefined) user.avatar_url = input.avatar_url;

    const saved = await this.userRepo.save(user);
    return await this.toUserProfileAsync(saved);
  }

  async refreshTokens(rawToken: string): Promise<TokenPair> {
    const hash = this.hashToken(rawToken);
    const row = await this.tokenRepo.findOne({ where: { token: hash } });

    if (!row || row.expires_at <= new Date()) {
      if (row) await this.tokenRepo.delete(row.id);
      throw new AppError(
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
        401,
        'INVALID_REFRESH_TOKEN',
      );
    }

    await this.tokenRepo.delete(row.id);

    const user = await this.userRepo.findOneOrFail({ where: { id: row.user_id } });
    return this.issueTokenPair(user);
  }

  async logout(userId: string, rawToken: string): Promise<void> {
    const hash = this.hashToken(rawToken);
    await this.tokenRepo.delete({ user_id: userId, token: hash });
  }

  async requestPasswordReset(emailInput: string): Promise<{ expires_in_minutes: number }> {
    const email = emailInput.toLowerCase().trim();
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new AppError('Email chưa được đăng ký trong hệ thống', 404, 'EMAIL_NOT_FOUND');
    }

    if (!user.is_active) {
      throw new AppError('Tài khoản đang bị khóa', 403, 'ACCOUNT_LOCKED');
    }

    if (!user.password_hash) {
      throw new AppError(
        'Tài khoản này chưa có mật khẩu cục bộ. Vui lòng đăng nhập bằng Google.',
        400,
        'LOCAL_PASSWORD_NOT_AVAILABLE',
      );
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + env.email.passwordResetTtlMinutes * 60 * 1000);

    await this.passwordResetRepo.delete({ user_id: user.id });

    await this.passwordResetRepo.save(
      this.passwordResetRepo.create({
        user_id: user.id,
        token: this.hashPasswordResetCode(user.id, email, code),
        expires_at: expiresAt,
      }),
    );

    await emailService.sendPasswordResetCode({
      to: email,
      code,
      ttlMinutes: env.email.passwordResetTtlMinutes,
    });

    return { expires_in_minutes: env.email.passwordResetTtlMinutes };
  }

  async verifyPasswordResetCode(emailInput: string, code: string): Promise<void> {
    const email = emailInput.toLowerCase().trim();
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new AppError('Email chưa được đăng ký trong hệ thống', 404, 'EMAIL_NOT_FOUND');
    }

    const row = await this.passwordResetRepo.findOne({
      where: {
        user_id: user.id,
        token: this.hashPasswordResetCode(user.id, email, code),
        used_at: IsNull(),
      },
      order: { created_at: 'DESC' },
    });

    if (!row) {
      throw new AppError('Mã xác nhận không hợp lệ', 400, 'INVALID_RESET_CODE');
    }

    if (row.expires_at <= new Date()) {
      throw new AppError('Mã xác nhận đã hết hạn', 410, 'RESET_CODE_EXPIRED');
    }
  }

  async resetPasswordWithCode(emailInput: string, code: string, password: string): Promise<void> {
    const email = emailInput.toLowerCase().trim();
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new AppError('Email chưa được đăng ký trong hệ thống', 404, 'EMAIL_NOT_FOUND');
    }

    const row = await this.passwordResetRepo.findOne({
      where: {
        user_id: user.id,
        token: this.hashPasswordResetCode(user.id, email, code),
        used_at: IsNull(),
      },
      order: { created_at: 'DESC' },
    });

    if (!row) {
      throw new AppError('Mã xác nhận không hợp lệ', 400, 'INVALID_RESET_CODE');
    }

    if (row.expires_at <= new Date()) {
      throw new AppError('Mã xác nhận đã hết hạn', 410, 'RESET_CODE_EXPIRED');
    }

    user.password_hash = await bcrypt.hash(password, 10);
    user.auth_provider = AuthProvider.LOCAL;
    await this.userRepo.save(user);
    await this.passwordResetRepo.update(row.id, { used_at: new Date() });
    await this.tokenRepo.delete({ user_id: user.id });
  }

  async changePassword(
    userId: string,
    input: { current_password: string; new_password: string },
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new AppError('Người dùng không tồn tại', 404, 'USER_NOT_FOUND');

    if (!user.password_hash) {
      throw new AppError(
        'Tài khoản đăng nhập bằng Google không thể đổi mật khẩu.',
        400,
        'LOCAL_PASSWORD_NOT_AVAILABLE',
      );
    }

    const isValid = await bcrypt.compare(input.current_password, user.password_hash);
    if (!isValid) {
      throw new AppError('Mật khẩu hiện tại không chính xác', 400, 'INCORRECT_CURRENT_PASSWORD');
    }

    user.password_hash = await bcrypt.hash(input.new_password, 10);
    await this.userRepo.save(user);
    await this.tokenRepo.delete({ user_id: userId });
  }

  async checkExists(
    email?: string,
    phone?: string,
  ): Promise<{ emailExists: boolean; phoneExists: boolean }> {
    let emailExists = false;
    let phoneExists = false;

    if (email) {
      const cleanEmail = email.toLowerCase().trim();
      const user = await this.userRepo.findOne({ where: { email: cleanEmail } });
      if (user) emailExists = true;
    }

    if (phone) {
      const trimmedPhone = phone.trim();
      const user = await this.userRepo.findOne({ where: { phone: trimmedPhone } });
      if (user) {
        const isGuest = user.email === `${trimmedPhone}@guest.rcfield.local` && !user.password_hash;
        if (!isGuest) {
          phoneExists = true;
        }
      }
    }

    return { emailExists, phoneExists };
  }
}

export const authService = new AuthService();
