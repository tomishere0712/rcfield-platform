import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContestLedgerDirection } from '../types';

/**
 * Một khoản tiền thực tế đã vào hoặc ra khỏi túi chủ doanh nghiệp vì một giải.
 *
 * KHÔNG phải `PaymentComponent`: đây là tiền chảy ngoài đường thanh toán của
 * nền tảng (chủ quán tự trả tiền thưởng tiền mặt, tự nhận tài trợ qua chuyển
 * khoản riêng). Vì thế nó không dính phí nền tảng và không có vòng đời
 * HELD → DISBURSED.
 */
@Entity('contest_ledger_entries')
@Index(['contestId', 'direction'])
@Index(['contestId', 'createdBy'])
export class ContestLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })
  contestId: string;

  @Column({ type: 'varchar', length: 3 })
  direction: ContestLedgerDirection;

  /** Tập giá trị hợp lệ phụ thuộc `direction`, kiểm ở tầng zod. */
  @Column({ type: 'varchar', length: 30 })
  category: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  /**
   * ⚠️ TypeORM trả cột `numeric` về dưới dạng **chuỗi**. Mọi phép cộng phải bọc
   * `Number(...)`, nếu không sẽ ra chuỗi nối chứ không phải tổng.
   */
  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount: number;

  /** Ngày khoản tiền thực sự phát sinh, khác `created_at` là ngày nhập liệu. */
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'receipt_url', type: 'text', nullable: true })
  receiptUrl: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  /**
   * Vai trò chụp lại lúc tạo. Nhân viên có thể đổi vai trò hoặc bị gỡ phân công
   * về sau; báo cáo vẫn phải nói đúng "ai ghi, với tư cách gì".
   */
  @Column({ name: 'created_by_role', type: 'varchar', length: 30 })
  createdByRole: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
