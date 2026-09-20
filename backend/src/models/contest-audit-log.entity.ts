import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('contest_audit_logs')
@Index(['contestId', 'createdAt'])
export class ContestAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })
  contestId: string;

  @Column({ name: 'registration_id', type: 'uuid', nullable: true })
  registrationId: string | null;

  @Column({ name: 'match_id', type: 'uuid', nullable: true })
  matchId: string | null;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_role', type: 'varchar', length: 30, nullable: true })
  actorRole: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 80 })
  eventType: string;

  @Column({ name: 'before_json', type: 'jsonb', nullable: true })
  beforeJson: Record<string, unknown> | null;

  @Column({ name: 'after_json', type: 'jsonb', nullable: true })
  afterJson: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
