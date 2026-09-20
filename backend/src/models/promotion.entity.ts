import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DiscountType, PromoApplicableTo, PromotionScheduleMode } from '../types';

@Entity('promotions')
@Index(['cafeId'])
@Index(['expiresAt'])
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
    enumName: 'discount_type_enum',
  })
  discountType: DiscountType;

  @Column({ name: 'discount_value', type: 'numeric', precision: 15, scale: 2 })
  discountValue: string;

  @Column({ name: 'max_discount_amount', type: 'numeric', precision: 15, scale: 2, nullable: true })
  maxDiscountAmount: string | null;

  @Column({ name: 'min_order_amount', type: 'numeric', precision: 15, scale: 2, nullable: true })
  minOrderAmount: string | null;

  @Column({ name: 'max_uses', type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ name: 'max_uses_per_user', type: 'int', default: 1 })
  maxUsesPerUser: number;

  @Column({ name: 'uses_count', type: 'int', default: 0 })
  usesCount: number;

  @Column({
    name: 'applicable_to',
    type: 'enum',
    enum: PromoApplicableTo,
    enumName: 'promo_applicable_to_enum',
    default: PromoApplicableTo.ALL,
  })
  applicableTo: PromoApplicableTo;

  @Column({ name: 'cafe_id', type: 'uuid', nullable: true })
  cafeId: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({
    name: 'schedule_mode',
    type: 'enum',
    enum: PromotionScheduleMode,
    enumName: 'promotion_schedule_mode_enum',
    default: PromotionScheduleMode.ONCE,
  })
  scheduleMode: PromotionScheduleMode;

  @Column({ name: 'schedule_start_time', type: 'time', nullable: true })
  scheduleStartTime: string | null;

  @Column({ name: 'schedule_end_time', type: 'time', nullable: true })
  scheduleEndTime: string | null;

  @Column({ name: 'schedule_weekdays', type: 'text', array: true, default: () => "'{}'" })
  scheduleWeekdays: string[];

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'show_on_cafe_page', type: 'boolean', default: true })
  showOnCafePage: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
