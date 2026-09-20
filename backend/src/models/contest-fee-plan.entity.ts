import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Bảng giá tổ chức giải, tách hẳn khỏi gói thuê bao SaaS của provider. */
@Entity('contest_fee_plans')
export class ContestFeePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: number;

  /** Số ngày giải được hiển thị trên trang chủ; 0 nghĩa là gói không kèm quảng bá. */
  @Column({ name: 'featured_days', type: 'integer', default: 0 })
  featuredDays: number;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
