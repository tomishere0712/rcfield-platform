import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContestMatchStatus, ContestMatchType } from '../types';

@Entity('contest_matches')
@Index(['contestId', 'roundNo', 'matchNo'], { unique: true })
export class ContestMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contest_id', type: 'uuid' })
  contestId: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'track_config_id', type: 'uuid', nullable: true })
  trackConfigId: string | null;

  @Column({ name: 'round_no', type: 'int' })
  roundNo: number;

  @Column({ name: 'match_no', type: 'int' })
  matchNo: number;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ name: 'match_type', type: 'varchar', length: 30, enum: ContestMatchType })
  matchType: ContestMatchType;

  @Column({ type: 'varchar', length: 30, default: ContestMatchStatus.DRAFT })
  status: ContestMatchStatus;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'next_match_id', type: 'uuid', nullable: true })
  nextMatchId: string | null;

  @Column({ name: 'advancement_rule', type: 'jsonb', default: {} })
  advancementRule: Record<string, unknown>;

  @Column({ name: 'result_summary', type: 'jsonb', default: {} })
  resultSummary: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
