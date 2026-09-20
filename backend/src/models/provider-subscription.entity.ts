import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { SubscriptionStatus } from '../types';

@Entity('provider_subscriptions')
@Index(['providerId', 'status'])
@Index(['expiresAt', 'status'])
export class ProviderSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ type: 'enum', enum: SubscriptionStatus, enumName: 'provider_subscription_status_enum' })
  status: SubscriptionStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'grace_ends_at', type: 'timestamptz', nullable: true })
  graceEndsAt: Date | null;

  @Column({ name: 'ai_messages_used', type: 'int', default: 0 })
  aiMessagesUsed: number;

  @Column({ name: 'ai_quota_reset_at', type: 'timestamptz' })
  aiQuotaResetAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
