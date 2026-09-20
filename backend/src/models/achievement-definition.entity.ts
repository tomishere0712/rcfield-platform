import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('achievement_definitions')
export class AchievementDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'badge_icon_url', type: 'text', nullable: true })
  badgeIconUrl: string | null;

  @Column({ name: 'title_label', type: 'varchar', length: 120, nullable: true })
  titleLabel: string | null;

  @Column({ name: 'rule_code', type: 'varchar', length: 80 })
  ruleCode: string;

  @Column({ name: 'rule_config', type: 'jsonb', default: {} })
  ruleConfig: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
