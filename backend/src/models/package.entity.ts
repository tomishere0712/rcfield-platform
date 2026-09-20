import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PackageBillingPeriod, PackageStatus } from '../types';

@Entity('packages')
@Index(['cafeId'])
export class Package {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'slot_count', type: 'int' })
  slotCount: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  price: string;

  @Column({ name: 'valid_days', type: 'int' })
  validDays: number;

  @Column({
    name: 'billing_period',
    type: 'enum',
    enum: PackageBillingPeriod,
    enumName: 'package_billing_period_enum',
    default: PackageBillingPeriod.MONTH,
  })
  billingPeriod: PackageBillingPeriod;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  benefits: string[];

  @Column({ name: 'is_popular', type: 'boolean', default: false })
  isPopular: boolean;

  @Column({ name: 'applicable_play_modes', type: 'text', array: true, default: () => "'{}'" })
  applicablePlayModes: string[];

  @Column({
    type: 'enum',
    enum: PackageStatus,
    enumName: 'package_status_enum',
    default: PackageStatus.ACTIVE,
  })
  status: PackageStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
