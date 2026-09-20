import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';
import { User } from '../models/user.entity';
import { ProviderProfile } from '../models/provider-profile.entity';
import {
  AppError,
  AuthProvider,
  KycBusinessType,
  KycDocumentItem,
  KycDocumentType,
  NotificationType,
  ProviderStatus,
  UserRole,
} from '../types';
import { createNotification } from './notification.service';
import { createTrial } from './subscription.service';
import { uploadFile, deleteFile } from './cloudinary.service';
import { TaxBusinessInfo, lookupBusinessByTaxCode, normalizeTaxCode } from './tax-lookup.service';

interface RegisterBody {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  business_name: string;
  business_description?: string;
  tax_code: string;
  business_email: string;
  business_type: KycBusinessType;
}

type KycFiles = Record<string, Express.Multer.File[] | undefined>;

const REQUIRED_DOCS: Record<KycBusinessType, KycDocumentType[]> = {
  INDIVIDUAL: [KycDocumentType.CCCD_FRONT, KycDocumentType.CCCD_BACK, KycDocumentType.VENUE_PHOTO],
  BUSINESS: [KycDocumentType.GPKD, KycDocumentType.REPRESENTATIVE_ID, KycDocumentType.VENUE_PHOTO],
};

const FILE_FIELD_TO_DOC_TYPE: Record<string, KycDocumentType> = {
  cccd_front: KycDocumentType.CCCD_FRONT,
  cccd_back: KycDocumentType.CCCD_BACK,
  gpkd: KycDocumentType.GPKD,
  representative_id: KycDocumentType.REPRESENTATIVE_ID,
  venue_photo: KycDocumentType.VENUE_PHOTO,
};

function validateRequiredDocs(businessType: KycBusinessType, files: KycFiles): void {
  const required = REQUIRED_DOCS[businessType];
  const missing = required.filter((docType) => {
    const fieldName = Object.entries(FILE_FIELD_TO_DOC_TYPE).find(([, v]) => v === docType)?.[0];
    return !fieldName || !files[fieldName]?.[0];
  });
  if (missing.length > 0) {
    throw new AppError(`Thiếu tài liệu bắt buộc: ${missing.join(', ')}`, 400, 'MISSING_DOCUMENTS');
  }
}

const PROVIDER_STATUS_TRANSITIONS: Record<ProviderStatus, ProviderStatus[]> = {
  [ProviderStatus.PENDING]: [ProviderStatus.ACTIVE, ProviderStatus.REJECTED],
  [ProviderStatus.ACTIVE]: [ProviderStatus.SUSPENDED],
  [ProviderStatus.SUSPENDED]: [ProviderStatus.ACTIVE],
  [ProviderStatus.REJECTED]: [ProviderStatus.PENDING],
};

async function getProfileOrThrow(providerId: string): Promise<ProviderProfile> {
  const profile = await AppDataSource.getRepository(ProviderProfile).findOne({
    where: { userId: providerId },
  });
  if (!profile) throw new AppError('Provider không tồn tại', 404, 'NOT_FOUND');
  return profile;
}

function assertTransition(profile: ProviderProfile, to: ProviderStatus): void {
  const allowed = PROVIDER_STATUS_TRANSITIONS[profile.registrationStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(
      `Không thể chuyển trạng thái từ ${profile.registrationStatus} sang ${to}`,
      400,
      'INVALID_STATUS_TRANSITION',
    );
  }
}

/**
 * Đối chiếu mã số thuế với Cục Thuế trước khi nhận hồ sơ.
 *
 * Ba kết quả xấu đều chặn: mã bịa, mã không tồn tại, và mã của cơ sở đã ngừng
 * hoạt động hoặc bỏ địa chỉ đăng ký — đúng nhóm hồ sơ không nên vào hệ thống.
 *
 * Riêng khi KHÔNG hỏi được (API sập, quá hạn chờ) thì vẫn cho đăng ký nhưng bỏ
 * trống `tax_verified_at`. Chặn đứng lúc đó là để một sự cố bên thứ ba khoá
 * luôn cửa đăng ký của mình, trong khi hồ sơ vẫn còn phải qua admin duyệt KYC —
 * người duyệt nhìn cờ chưa xác minh để soi kỹ hơn.
 */
async function verifyTaxCodeForRegistration(taxCode: string): Promise<{
  business: TaxBusinessInfo | null;
  verifiedAt: Date | null;
}> {
  const outcome = await lookupBusinessByTaxCode(taxCode);

  switch (outcome.status) {
    case 'ACTIVE':
      return { business: outcome.business, verifiedAt: new Date() };
    case 'INACTIVE':
      throw new AppError(
        `Mã số thuế này đang ở trạng thái "${outcome.business.taxStatus}" theo dữ liệu Cục Thuế, không đủ điều kiện đăng ký`,
        400,
        'TAX_CODE_INACTIVE',
        { tax_status: outcome.business.taxStatus },
      );
    case 'NOT_FOUND':
      throw new AppError(
        'Không tìm thấy mã số thuế này trên dữ liệu Cục Thuế. Kiểm tra lại, hoặc liên hệ RCField nếu doanh nghiệp vừa thành lập.',
        400,
        'TAX_CODE_NOT_FOUND',
      );
    case 'INVALID':
      throw new AppError('Mã số thuế không hợp lệ', 400, 'TAX_CODE_INVALID');
    default:
      logger.warn(
        'ProviderOnboarding',
        `không đối chiếu được mã số thuế ${taxCode}, cho đăng ký và chờ admin soi khi duyệt KYC`,
      );
      return { business: null, verifiedAt: null };
  }
}

async function assertTaxCodeAvailable(taxCode: string, exceptUserId?: string): Promise<void> {
  const rows = await AppDataSource.query<{ user_id: string }[]>(
    `SELECT user_id FROM provider_profiles
      WHERE tax_code = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [taxCode],
  );
  const owner = rows[0];
  if (!owner || owner.user_id === exceptUserId) return;
  throw new AppError('Mã số thuế đã được một hồ sơ khác sử dụng', 409, 'TAX_CODE_EXISTS');
}

/**
 * Provider tự sửa hồ sơ doanh nghiệp của mình.
 *
 * Không đụng tới `registration_status` và giấy tờ KYC: hai thứ đó do admin
 * duyệt, provider tự đổi được thì việc duyệt mất hết ý nghĩa.
 */
export async function updateProviderProfile(
  providerId: string,
  body: {
    business_name?: string;
    business_description?: string | null;
    tax_code?: string;
    business_email?: string;
  },
): Promise<unknown> {
  const repo = AppDataSource.getRepository(ProviderProfile);
  const profile = await repo.findOne({ where: { userId: providerId } });
  if (!profile) throw new AppError('Hồ sơ provider không tồn tại', 404, 'NOT_FOUND');

  if (body.tax_code !== undefined && body.tax_code !== profile.taxCode) {
    await assertTaxCodeAvailable(body.tax_code, providerId);
  }

  if (body.business_name !== undefined) profile.businessName = body.business_name;
  if (body.business_description !== undefined) {
    profile.businessDescription = body.business_description;
  }
  if (body.tax_code !== undefined) profile.taxCode = body.tax_code;
  if (body.business_email !== undefined) profile.businessEmail = body.business_email;

  await repo.save(profile);
  logger.info('ProviderOnboarding', 'business profile updated', { providerId });

  return getProviderDetail(providerId);
}

export async function register(body: RegisterBody, files: KycFiles): Promise<User> {
  const userRepo = AppDataSource.getRepository(User);

  const existing = await userRepo.findOne({ where: { email: body.email } });
  if (existing) throw new AppError('Email đã được sử dụng', 409, 'EMAIL_EXISTS');

  // Bắt trước ở đây để trả lỗi đọc được, thay vì để unique index nổ ra một lỗi
  // Postgres thô sau khi đã tải giấy tờ KYC lên Cloudinary.
  await assertTaxCodeAvailable(body.tax_code);

  // Đối chiếu Cục Thuế trước khi tải file, để hồ sơ hỏng không tốn lượt upload.
  const taxCheck = await verifyTaxCodeForRegistration(body.tax_code);

  validateRequiredDocs(body.business_type, files);

  const uploadedDocs: KycDocumentItem[] = [];
  const uploadedPublicIds: string[] = [];

  try {
    for (const [fieldName, docType] of Object.entries(FILE_FIELD_TO_DOC_TYPE)) {
      const file = files[fieldName]?.[0];
      if (!file) continue;

      const { publicId, url } = await uploadFile({
        buffer: file.buffer,
        folder: `rcfield/kyc/registration`,
        publicIdPrefix: `${fieldName}-${Date.now()}`,
      });
      uploadedPublicIds.push(publicId);
      uploadedDocs.push({
        documentType: docType,
        cloudinaryUrl: url,
        cloudinaryPublicId: publicId,
        originalFilename: file.originalname ?? null,
      });
    }

    return await AppDataSource.transaction(async (manager) => {
      const passwordHash = await bcrypt.hash(body.password, 10);
      const user = await manager.save(
        manager.create(User, {
          email: body.email,
          full_name: body.full_name,
          phone: body.phone ?? null,
          password_hash: passwordHash,
          auth_provider: AuthProvider.LOCAL,
          role: UserRole.PROVIDER,
        }),
      );
      await manager.save(
        manager.create(ProviderProfile, {
          userId: user.id,
          businessName: body.business_name,
          businessDescription: body.business_description ?? null,
          taxCode: normalizeTaxCode(body.tax_code),
          businessEmail: body.business_email,
          businessLegalName: taxCheck.business?.legalName ?? null,
          businessAddress: taxCheck.business?.address ?? null,
          taxStatus: taxCheck.business?.taxStatus ?? null,
          taxVerifiedAt: taxCheck.verifiedAt,
          registrationStatus: ProviderStatus.PENDING,
          businessType: body.business_type,
          kycDocuments: uploadedDocs,
          kycSubmittedAt: new Date(),
        }),
      );
      return user;
    });
  } catch (err) {
    // If DB transaction failed after uploads, clean up Cloudinary files
    if (uploadedPublicIds.length > 0 && !(err instanceof AppError && err.code === 'EMAIL_EXISTS')) {
      await Promise.allSettled(uploadedPublicIds.map((id) => deleteFile(id)));
    }
    throw err;
  }
}

export async function approve(providerId: string, _adminId: string): Promise<void> {
  const profile = await getProfileOrThrow(providerId);
  assertTransition(profile, ProviderStatus.ACTIVE);

  // Hồ sơ bị từ chối rồi duyệt lại vẫn đi qua đây. Chỉ cấp gói dùng thử cho
  // người chưa từng nhận, nếu không mỗi vòng từ chối/duyệt lại là thêm 30 ngày
  // miễn phí.
  const grantsTrial = profile.trialUsedAt === null;

  await AppDataSource.transaction(async (manager) => {
    profile.registrationStatus = ProviderStatus.ACTIVE;
    if (grantsTrial) profile.trialUsedAt = new Date();
    await manager.save(profile);
    if (grantsTrial) await createTrial(providerId);
  });

  await createNotification(
    providerId,
    NotificationType.ACCOUNT_APPROVED,
    'Tài khoản đã được duyệt',
    grantsTrial
      ? 'Chào mừng bạn đến với RCField! Gói dùng thử 30 ngày đã được kích hoạt.'
      : 'Tài khoản của bạn đã hoạt động trở lại. Chọn một gói đăng ký để tiếp tục vận hành.',
  );
}

export async function reject(providerId: string, _adminId: string, reason: string): Promise<void> {
  const profile = await getProfileOrThrow(providerId);
  assertTransition(profile, ProviderStatus.REJECTED);

  profile.registrationStatus = ProviderStatus.REJECTED;
  profile.rejectionReason = reason;
  await AppDataSource.getRepository(ProviderProfile).save(profile);

  await createNotification(
    providerId,
    NotificationType.ACCOUNT_REJECTED,
    'Đăng ký tài khoản bị từ chối',
    `Lý do: ${reason}`,
  );
}

export async function suspend(providerId: string, _adminId: string, reason: string): Promise<void> {
  const profile = await getProfileOrThrow(providerId);
  assertTransition(profile, ProviderStatus.SUSPENDED);

  profile.registrationStatus = ProviderStatus.SUSPENDED;
  profile.suspendedAt = new Date();
  profile.suspendedReason = reason;
  await AppDataSource.getRepository(ProviderProfile).save(profile);

  await createNotification(
    providerId,
    NotificationType.ACCOUNT_SUSPENDED,
    'Tài khoản bị tạm khóa',
    `Lý do: ${reason}. Vui lòng liên hệ admin để được hỗ trợ.`,
  );
}

export async function unsuspend(providerId: string, _adminId: string): Promise<void> {
  const profile = await getProfileOrThrow(providerId);
  assertTransition(profile, ProviderStatus.ACTIVE);

  profile.registrationStatus = ProviderStatus.ACTIVE;
  profile.suspendedAt = null;
  profile.suspendedReason = null;
  await AppDataSource.getRepository(ProviderProfile).save(profile);

  await createNotification(
    providerId,
    NotificationType.ACCOUNT_UNSUSPENDED,
    'Tài khoản đã được mở khóa',
    'Tài khoản của bạn đã được khôi phục. Chào mừng trở lại!',
  );
}

export async function listProviders(options: {
  status?: ProviderStatus;
  page: number;
  limit: number;
}): Promise<{ data: unknown[]; total: number }> {
  const { status, page, limit } = options;

  let query = `
    SELECT
      u.id, u.email, u.full_name, u.created_at,
      pp.business_name, pp.registration_status,
      sp_name.name as plan_name,
      ps.status as subscription_status,
      ps.expires_at
    FROM users u
    JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN provider_subscriptions ps ON ps.provider_id = u.id
      AND ps.deleted_at IS NULL
      AND ps.status != 'EXPIRED'
    LEFT JOIN subscription_plans sp_name ON sp_name.id = ps.plan_id
    WHERE u.role = 'PROVIDER'
      AND u.deleted_at IS NULL
      AND pp.deleted_at IS NULL
  `;
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    query += ` AND pp.registration_status = $${params.length}`;
  }

  const countResult = await AppDataSource.query<[{ count: string }]>(
    `SELECT COUNT(*) as count FROM (${query}) t`,
    params,
  );
  const total = parseInt(countResult[0]?.count ?? '0', 10);

  params.push(limit, (page - 1) * limit);
  query += ` ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const data = await AppDataSource.query(query, params);
  return { data, total };
}

export async function getProviderDetail(providerId: string): Promise<unknown> {
  const rows = await AppDataSource.query(
    `SELECT
      u.id, u.email, u.full_name, u.phone, u.created_at,
      pp.business_name, pp.business_description, pp.tax_code, pp.business_email,
      pp.business_legal_name, pp.business_address, pp.tax_status, pp.tax_verified_at,
      pp.registration_status,
      pp.rejection_reason, pp.suspended_at, pp.suspended_reason,
      pp.business_type, pp.kyc_documents, pp.kyc_submitted_at,
      sp_name.name as plan_name,
      ps.status as subscription_status,
      ps.started_at, ps.expires_at, ps.grace_ends_at, ps.ai_messages_used,
      sp_name.ai_quota_per_month, sp_name.branch_limit, sp_name.channel_limit
    FROM users u
    JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN provider_subscriptions ps ON ps.provider_id = u.id
      AND ps.deleted_at IS NULL AND ps.status != 'EXPIRED'
    LEFT JOIN subscription_plans sp_name ON sp_name.id = ps.plan_id
    WHERE u.id = $1`,
    [providerId],
  );
  if (!rows.length) throw new AppError('Provider không tồn tại', 404, 'NOT_FOUND');

  const row = rows[0] as Record<string, unknown>;

  // Build nested kyc object for ADMIN response
  const kycDocs = (row.kyc_documents as KycDocumentItem[]) ?? [];
  const kyc =
    row.kyc_submitted_at || kycDocs.length > 0
      ? {
          businessType: row.business_type ?? null,
          submittedAt: row.kyc_submitted_at ?? null,
          documents: kycDocs.map((d) => ({
            documentType: d.documentType,
            cloudinaryUrl: d.cloudinaryUrl,
            originalFilename: d.originalFilename,
          })),
        }
      : null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kyc_documents: _kd, kyc_submitted_at: _ks, business_type: _bt, ...rest } = row;
  return { ...rest, kyc };
}

export async function resubmit(
  providerId: string,
  businessType: KycBusinessType,
  files: KycFiles,
): Promise<{ status: string; kycSubmittedAt: Date }> {
  const profile = await getProfileOrThrow(providerId);

  if (profile.registrationStatus !== ProviderStatus.REJECTED) {
    throw new AppError('Chỉ có thể nộp lại khi hồ sơ bị từ chối', 400, 'RESUBMIT_NOT_ALLOWED');
  }

  validateRequiredDocs(businessType, files);

  const uploadedDocs: KycDocumentItem[] = [];
  const uploadedPublicIds: string[] = [];

  try {
    for (const [fieldName, docType] of Object.entries(FILE_FIELD_TO_DOC_TYPE)) {
      const file = files[fieldName]?.[0];
      if (!file) continue;

      const { publicId, url } = await uploadFile({
        buffer: file.buffer,
        folder: `rcfield/kyc/${profile.id}`,
        publicIdPrefix: fieldName,
      });
      uploadedPublicIds.push(publicId);
      uploadedDocs.push({
        documentType: docType,
        cloudinaryUrl: url,
        cloudinaryPublicId: publicId,
        originalFilename: file.originalname ?? null,
      });
    }

    assertTransition(profile, ProviderStatus.PENDING);

    profile.registrationStatus = ProviderStatus.PENDING;
    profile.businessType = businessType;
    profile.kycDocuments = uploadedDocs;
    profile.kycSubmittedAt = new Date();
    profile.rejectionReason = null;

    await AppDataSource.getRepository(ProviderProfile).save(profile);

    return { status: profile.registrationStatus, kycSubmittedAt: profile.kycSubmittedAt! };
  } catch (err) {
    if (uploadedPublicIds.length > 0) {
      await Promise.allSettled(uploadedPublicIds.map((id) => deleteFile(id)));
    }
    throw err;
  }
}

export async function getKycStatus(providerId: string): Promise<unknown> {
  const profile = await getProfileOrThrow(providerId);

  return {
    providerStatus: profile.registrationStatus,
    businessType: profile.businessType ?? null,
    rejectionReason: profile.rejectionReason ?? null,
    kycSubmittedAt: profile.kycSubmittedAt ?? null,
    documents: (profile.kycDocuments ?? []).map((d) => ({
      documentType: d.documentType,
      originalFilename: d.originalFilename,
    })),
  };
}
