import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('contest_bans')
@Index(['userId', 'providerId', 'contestId'])
@Index(['providerId', 'userId', 'contestId'], {
  unique: true,
  where: 'lifted_at IS NULL',
})
export class ContestBan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'contest_id', type: 'uuid', nullable: true })
  contestId: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 20, default: 'CONTEST' })
  scopeType: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', default: {} })
  evidence: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt: Date | null;

  @Column({ name: 'lifted_by', type: 'uuid', nullable: true })
  liftedBy: string | null;

  @Column({ name: 'lift_reason', type: 'text', nullable: true })
  liftReason: string | null;
}
