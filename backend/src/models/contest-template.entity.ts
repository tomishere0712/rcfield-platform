import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contest_templates')
@Index(['contestTypeId', 'contestFormatId'])
export class ContestTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_type_id', type: 'uuid' })
  contestTypeId: string;

  @Column({ name: 'contest_format_id', type: 'uuid' })
  contestFormatId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'default_config', type: 'jsonb', default: {} })
  defaultConfig: Record<string, unknown>;

  @Column({ name: 'vehicle_policy_options', type: 'jsonb', default: [] })
  vehiclePolicyOptions: string[];

  @Column({ name: 'feature_flags', type: 'jsonb', default: {} })
  featureFlags: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
