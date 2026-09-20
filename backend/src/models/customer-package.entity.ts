import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CustomerPackageStatus } from '../types';

@Entity('customer_packages')
@Index('IDX_customer_packages_customer_id', ['customerId'])
@Index('IDX_customer_packages_cafe_id_status', ['cafeId', 'status'])
@Index('IDX_customer_packages_status_expires_at', ['status', 'expiresAt'])
export class CustomerPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'package_id', type: 'uuid' })
  packageId: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'slots_total', type: 'int' })
  slotsTotal: number;

  // Decimal credit keeps the 12–24h cancellation policy fair for a package
  // booking that consumes an odd number of slots.
  @Column({ name: 'slots_remaining', type: 'numeric', precision: 10, scale: 2 })
  slotsRemaining: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: CustomerPackageStatus.PENDING_PAYMENT,
  })
  status: CustomerPackageStatus;

  @Column({ name: 'purchased_price', type: 'numeric', precision: 15, scale: 2 })
  purchasedPrice: number;

  @Column({ name: 'package_name_snapshot', type: 'varchar', length: 255 })
  packageNameSnapshot: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
