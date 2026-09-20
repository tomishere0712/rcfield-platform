import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { PaymentRequestStatus } from '../types';

@Entity('payment_requests')
export class PaymentRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({
    type: 'enum',
    enum: PaymentRequestStatus,
    default: PaymentRequestStatus.PENDING,
  })
  status: PaymentRequestStatus;

  @Column({ name: 'transfer_reference', type: 'varchar', length: 255 })
  transferReference: string;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate: string;

  @Column({ name: 'transfer_amount', type: 'decimal', precision: 12, scale: 2 })
  transferAmount: number;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
