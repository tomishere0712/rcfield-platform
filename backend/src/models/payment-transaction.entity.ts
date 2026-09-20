import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  PaymentTransactionStatus,
  PaymentTransactionSubjectType,
  PaymentTransactionType,
} from '../types';

@Entity('payment_transactions')
@Index(['bookingId'])
@Index('IDX_payment_transactions_customer_package_id', ['customerPackageId'])
@Index('IDX_payment_transactions_contest_registration_id', ['contestRegistrationId'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ name: 'customer_package_id', type: 'uuid', nullable: true })
  customerPackageId: string | null;

  @Column({ name: 'contest_registration_id', type: 'uuid', nullable: true })
  contestRegistrationId: string | null;

  @Column({
    name: 'subject_type',
    type: 'varchar',
    length: 40,
    default: PaymentTransactionSubjectType.BOOKING,
  })
  subjectType: PaymentTransactionSubjectType;

  @Column({ name: 'type', type: 'varchar', length: 20 })
  type: PaymentTransactionType;

  @Column({ name: 'gateway', type: 'varchar', length: 20, default: 'VNPAY' })
  gateway: string;

  /**
   * Mã giao dịch do CỔNG sinh ra — `vnp_TransactionNo` với VNPay.
   *
   * Đây là thứ duy nhất dò được một dòng trên báo cáo đối soát của cổng về
   * đúng bản ghi trong hệ thống. `txn_ref` là mã mình tự sinh, phía cổng không
   * dùng nó làm khoá, nên khi hai bên lệch số thì không có gì để đối chiếu.
   *
   * Cột và index đã có sẵn trong schema từ đầu nhưng chưa từng được ghi — mã
   * vẫn bị bóc ra ở `vnpay.service.ts` rồi bỏ đi.
   */
  @Column({ name: 'gateway_transaction_id', type: 'varchar', length: 255, nullable: true })
  gatewayTransactionId: string | null;

  @Column({ name: 'txn_ref', type: 'varchar', length: 100, unique: true })
  txnRef: string;

  /**
   * Mã tham chiếu ngắn nhúng vào nội dung chuyển khoản, dạng `RCF7K2M9`.
   *
   * Chỉ có giá trị với cổng `bank_transfer`; giao dịch VNPay để NULL.
   *
   * Cố ý gắn vào transaction chứ không vào booking: `createCheckoutUrl` tạo
   * transaction mới và đánh dấu transaction cũ FAILED mỗi lần khách đổi phương
   * thức thanh toán, nên một mã QR đã in ra tự hết hiệu lực theo. Gắn vào
   * booking thì mã sống dai hơn phiên thanh toán và khách có thể bị thu hai lần.
   */
  @Column({ name: 'payment_ref_code', type: 'varchar', length: 16, nullable: true })
  paymentRefCode: string | null;

  @Column({ name: 'amount', type: 'numeric', precision: 15, scale: 2 })
  amount: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: PaymentTransactionStatus.PENDING,
  })
  status: PaymentTransactionStatus;

  @Column({ name: 'raw_request', type: 'jsonb', nullable: true })
  rawRequest: object | null;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: object | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
