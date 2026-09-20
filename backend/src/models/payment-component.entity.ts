import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PaymentComponentStatus, PaymentComponentType } from '../types';

@Entity('payment_components')
@Index(['bookingId'])
@Index(['bookingId', 'type'])
export class PaymentComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'booking_vehicle_id', type: 'uuid', nullable: true })
  bookingVehicleId: string | null;

  @Column({ name: 'type', type: 'varchar', length: 30 })
  type: PaymentComponentType;

  @Column({ name: 'amount', type: 'numeric', precision: 15, scale: 2 })
  amount: number;

  @Column({ name: 'status', type: 'varchar', length: 30, default: PaymentComponentStatus.PENDING })
  status: PaymentComponentStatus;

  @Column({ name: 'refunded_amount', type: 'numeric', precision: 15, scale: 2, default: 0 })
  refundedAmount: number;

  @Column({ name: 'disbursed_at', type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
