import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContestEntryFeePaymentStatus, ContestRegistrationStatus, VehicleSource } from '../types';

@Entity('contest_registrations')
@Index(['contestId', 'userId'], { unique: true })
@Index(['checkInCode'], { unique: true })
export class ContestRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })
  contestId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'participant_role_snapshot', type: 'varchar', length: 30, default: 'CUSTOMER' })
  participantRoleSnapshot: string;

  @Column({ name: 'vehicle_source', type: 'varchar', length: 10, enum: VehicleSource })
  vehicleSource: VehicleSource;

  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId: string | null;

  /** Dòng xe VĐV chọn mượn lúc đăng ký; chiếc cụ thể gán lúc check-in. */
  @Column({ name: 'rental_catalog_id', type: 'uuid', nullable: true })
  rentalCatalogId: string | null;

  /** Chi nhánh VĐV sẽ thi đấu và nhận xe. */
  @Column({ name: 'rental_cafe_id', type: 'uuid', nullable: true })
  rentalCafeId: string | null;

  /** Phiếu mượn xe 0đ, sinh lúc check-in để chạy inspection/damage. */
  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: ContestRegistrationStatus.PENDING,
  })
  status: ContestRegistrationStatus;

  @Column({ name: 'check_in_code', type: 'varchar', length: 64, nullable: true })
  checkInCode: string | null;

  @Column({ name: 'checked_in_cafe_id', type: 'uuid', nullable: true })
  checkedInCafeId: string | null;

  @Column({ name: 'checked_in_by', type: 'uuid', nullable: true })
  checkedInBy: string | null;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 30,
    default: ContestEntryFeePaymentStatus.NOT_REQUIRED,
  })
  paymentStatus: ContestEntryFeePaymentStatus;

  @Column({ name: 'entry_fee_amount', type: 'numeric', precision: 15, scale: 2, nullable: true })
  entryFeeAmount: number | null;

  @Column({ name: 'entry_fee_due_at', type: 'timestamptz', nullable: true })
  entryFeeDueAt: Date | null;

  @Column({ name: 'entry_fee_marked_paid_by', type: 'uuid', nullable: true })
  entryFeeMarkedPaidBy: string | null;

  @Column({ name: 'entry_fee_marked_paid_at', type: 'timestamptz', nullable: true })
  entryFeeMarkedPaidAt: Date | null;

  /**
   * Đường tiền lệ phí đi vào: ONLINE | CASH | TRANSFER.
   *
   * Chỉ có nghĩa khi `paymentStatus = MARKED_PAID`; ở mọi trạng thái khác phải
   * là null. Cần để đối chiếu báo cáo tài chính với sao kê ngân hàng — tiền mặt
   * nằm trong két còn tiền online nằm trên sao kê, không lẫn được.
   *
   * Bản ghi cũ giữ null và được gom vào nhóm "chưa rõ phương thức".
   */
  @Column({ name: 'entry_fee_payment_method', type: 'varchar', length: 20, nullable: true })
  entryFeePaymentMethod: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
