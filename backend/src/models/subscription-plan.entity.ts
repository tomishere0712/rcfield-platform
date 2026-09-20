import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanName } from '../types';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PlanName, unique: true })
  name: PlanName;

  @Column({ name: 'branch_limit', type: 'int' })
  branchLimit: number;

  @Column({ name: 'ai_quota_per_month', type: 'int' })
  aiQuotaPerMonth: number;

  @Column({ name: 'channel_limit', type: 'int' })
  channelLimit: number;

  @Column({ name: 'price_per_month', type: 'decimal', precision: 12, scale: 2 })
  pricePerMonth: number;

  @Column({ name: 'is_trial', type: 'boolean', default: false })
  isTrial: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
