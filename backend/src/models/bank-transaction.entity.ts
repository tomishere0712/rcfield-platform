import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BankTransactionGateway,
  BankTransactionMatchReason,
  BankTransactionMatchStatus,
} from '../types';

/**
 * Một khoản tiền hệ thống được báo là đã về tài khoản của chi nhánh.
 *
 * Đây là sổ đối soát với sao kê ngân hàng, nên nó ghi MỌI thông báo nhận được —
 * kể cả khoản không khớp booking nào, thiếu tiền, hoặc vào tài khoản lạ. Không
 * có bảng này thì mọi giao dịch lệch biến mất không dấu vết và con số trong hệ
 * thống không bao giờ khớp được với ngân hàng.
 *
 * KHÔNG phải `PaymentComponent`. Nó đứng TRƯỚC và độc lập với việc ghi nhận
 * doanh thu: một hàng `NEEDS_REVIEW` có tiền thật trong tài khoản nhưng không
 * sinh component nào, vì chưa có dịch vụ nào được bán.
 *
 * Tính bất biến: `externalId`, `amount`, `content`, `transactionDate`,
 * `rawPayload` mô tả một sự kiện bên ngoài và KHÔNG BAO GIỜ được sửa sau khi
 * ghi. Chỉ phán quyết của hệ thống về sự kiện đó (`matchStatus`, `matchReason`,
 * `paymentTransactionId`, nhóm `resolved*`) mới thay đổi được, và luôn kèm dấu
 * vết ai làm lúc nào.
 */
@Entity('bank_transactions')
@Index(['cafeId', 'transactionDate'])
@Index(['gateway', 'externalId'])
export class BankTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  gateway: BankTransactionGateway;

  /** Mã giao dịch do NGÂN HÀNG cấp — khoá chống trùng, không phải mã của mình. */
  @Column({ name: 'external_id', type: 'varchar', length: 100 })
  externalId: string;

  /** NULL khi tài khoản nhận không thuộc chi nhánh nào trong hệ thống. */
  @Column({ name: 'cafe_id', type: 'uuid', nullable: true })
  cafeId: string | null;

  @Column({ name: 'payment_transaction_id', type: 'uuid', nullable: true })
  paymentTransactionId: string | null;

  @Column({ name: 'account_number', type: 'varchar', length: 32 })
  accountNumber: string;

  /**
   * ⚠️ TypeORM trả `numeric` về dạng CHUỖI. Mọi phép cộng hoặc so sánh phải
   * bọc `Number()` trước, nếu không `'350000' > 40000` cho kết quả sai.
   */
  @Column({ type: 'numeric', precision: 15, scale: 2 })
  amount: string;

  @Column({ type: 'text' })
  content: string;

  /** Mã tham chiếu rút được từ `content`, NULL khi khách chuyển sai nội dung. */
  @Column({ name: 'ref_code', type: 'varchar', length: 16, nullable: true })
  refCode: string | null;

  @Column({ name: 'transaction_date', type: 'timestamptz' })
  transactionDate: Date;

  @Column({ name: 'match_status', type: 'varchar', length: 20 })
  matchStatus: BankTransactionMatchStatus;

  @Column({ name: 'match_reason', type: 'varchar', length: 32, nullable: true })
  matchReason: BankTransactionMatchReason | null;

  /** Toàn văn thông báo nhận được, phục vụ đối chiếu khi có tranh chấp. */
  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload: Record<string, unknown>;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
