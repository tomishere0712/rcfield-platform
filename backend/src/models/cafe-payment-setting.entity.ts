import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CafePaymentMethod } from '../types';

/**
 * Tài khoản ngân hàng một chi nhánh dùng để nhận tiền booking.
 *
 * Không có hàng nào, hoặc có mà `isVerified = false`, đều có nghĩa là chi nhánh
 * dùng cổng thanh toán dùng chung — hành vi mặc định, không đổi gì so với
 * trước khi có tính năng này.
 *
 * `isVerified` chỉ bật lên khi chủ quán tự quét mã QR mẫu và xác nhận thấy đúng
 * tên mình. Đây là hàng rào duy nhất bắt được lỗi gõ sai một chữ số — hệ thống
 * không có cách nào tự biết số tài khoản nhập vào có phải của chủ quán không,
 * và nếu sai thì tiền của mọi khách chảy vào tài khoản người lạ.
 */
@Entity('cafe_payment_settings')
@Index(['cafeId'])
export class CafePaymentSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ type: 'varchar', length: 20, default: CafePaymentMethod.VNPAY })
  method: CafePaymentMethod;

  /** Mã ngắn hiển thị cho người dùng, vd `VCB`. */
  @Column({ name: 'bank_code', type: 'varchar', length: 20, nullable: true })
  bankCode: string | null;

  /** BIN Napas — thứ thực sự đi vào chuỗi VietQR. */
  @Column({ name: 'bank_bin', type: 'varchar', length: 10, nullable: true })
  bankBin: string | null;

  @Column({ name: 'account_number', type: 'varchar', length: 32, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'account_name', type: 'varchar', length: 160, nullable: true })
  accountName: string | null;

  /**
   * Mã merchant VNPay riêng của chi nhánh. `null` = dùng cổng cấp nền tảng.
   */
  @Column({ name: 'vnpay_tmn_code', type: 'varchar', length: 32, nullable: true })
  vnpayTmnCode: string | null;

  /**
   * Khoá ký VNPay, đã mã hoá. KHÔNG BAO GIỜ trả ra khỏi máy chủ dưới mọi hình
   * thức — kể cả che bớt. Lộ khoá này là người ngoài ký được giao dịch giả mà
   * hệ thống không phân biệt nổi với giao dịch thật.
   */
  @Column({ name: 'vnpay_hash_secret_encrypted', type: 'text', nullable: true })
  vnpayHashSecretEncrypted: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
