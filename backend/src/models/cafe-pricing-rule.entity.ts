import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { PricingRuleType } from '../types';

@Entity('cafe_pricing_rules')
@Index(['cafeId', 'ruleType', 'isActive'])
@Index(['cafeId', 'deletedAt'])
export class CafePricingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({
    name: 'rule_type',
    type: 'enum',
    enum: PricingRuleType,
    enumName: 'pricing_rule_type_enum',
  })
  ruleType: PricingRuleType;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  multiplier: number;

  @Column({ name: 'peak_start_time', type: 'time', nullable: true })
  peakStartTime: string | null;

  @Column({ name: 'peak_end_time', type: 'time', nullable: true })
  peakEndTime: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
