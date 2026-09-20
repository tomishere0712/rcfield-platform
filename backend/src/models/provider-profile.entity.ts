import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { KycBusinessType, KycDocumentItem, ProviderStatus } from '../types';

@Entity('provider_profiles')
export class ProviderProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'business_name', type: 'varchar', length: 255 })
  businessName: string;

  @Column({ name: 'business_description', type: 'text', nullable: true })
  businessDescription: string | null;

  /** Bắt buộc với đăng ký mới; NULL chỉ còn ở hồ sơ tạo trước khi có cột này. */
  @Column({ name: 'tax_code', type: 'varchar', length: 20, nullable: true })
  taxCode: string | null;

  /** Email của doanh nghiệp, tách khỏi email đăng nhập của người tạo tài khoản. */
  @Column({ name: 'business_email', type: 'varchar', length: 255, nullable: true })
  businessEmail: string | null;

  /** Tên pháp lý theo Cục Thuế; khác `businessName` là tên thương hiệu tự đặt. */
  @Column({ name: 'business_legal_name', type: 'varchar', length: 255, nullable: true })
  businessLegalName: string | null;

  @Column({ name: 'business_address', type: 'text', nullable: true })
  businessAddress: string | null;

  /** Nguyên văn trạng thái thuế, ví dụ "NNT đang hoạt động". */
  @Column({ name: 'tax_status', type: 'varchar', length: 255, nullable: true })
  taxStatus: string | null;

  /** NULL = chưa đối chiếu được với Cục Thuế, admin cần soi kỹ khi duyệt KYC. */
  @Column({ name: 'tax_verified_at', type: 'timestamptz', nullable: true })
  taxVerifiedAt: Date | null;

  @Column({
    name: 'registration_status',
    type: 'enum',
    enum: ProviderStatus,
    enumName: 'provider_status_enum',
    default: ProviderStatus.PENDING,
  })
  registrationStatus: ProviderStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'suspended_at', type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  @Column({ name: 'suspended_reason', type: 'text', nullable: true })
  suspendedReason: string | null;

  @Column({ name: 'business_type', type: 'varchar', length: 20, nullable: true })
  businessType: KycBusinessType | null;

  @Column({ name: 'kyc_documents', type: 'jsonb', default: [] })
  kycDocuments: KycDocumentItem[];

  @Column({ name: 'kyc_submitted_at', type: 'timestamptz', nullable: true })
  kycSubmittedAt: Date | null;

  /**
   * Thời điểm provider tiêu suất dùng thử. Mỗi tài khoản chỉ được một lần.
   *
   * Không suy ra được từ `provider_subscriptions` vì `activateFromPayment` ghi
   * đè `plan_id` lên bản ghi cũ, xoá mất dấu vết gói dùng thử.
   */
  @Column({ name: 'trial_used_at', type: 'timestamptz', nullable: true })
  trialUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
