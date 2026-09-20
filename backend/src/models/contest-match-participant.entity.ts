import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContestParticipantStatus } from '../types';

@Entity('contest_match_participants')
@Index(['matchId', 'registrationId'], { unique: true })
@Index(['matchId', 'slotNo'], { unique: true })
export class ContestMatchParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id', type: 'uuid' })
  matchId: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({ name: 'slot_no', type: 'int' })
  slotNo: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  lane: string | null;

  @Column({ name: 'grid_position', type: 'int', nullable: true })
  gridPosition: number | null;

  @Column({ name: 'seed_no', type: 'int', nullable: true })
  seedNo: number | null;

  @Column({ type: 'varchar', length: 30, default: ContestParticipantStatus.READY })
  status: ContestParticipantStatus;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  score: number | null;

  @Column({ name: 'finish_position', type: 'int', nullable: true })
  finishPosition: number | null;

  @Column({ name: 'best_lap_ms', type: 'int', nullable: true })
  bestLapMsLegacy: number | null;

  @Column({ name: 'total_time_ms', type: 'int', nullable: true })
  totalTimeMsLegacy: number | null;

  @Column({ name: 'best_lap_seconds', type: 'numeric', precision: 10, scale: 3, nullable: true })
  bestLapSeconds: number | null;

  @Column({
    name: 'total_time_seconds',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
  })
  totalTimeSeconds: number | null;

  @Column({ name: 'is_winner', type: 'boolean', default: false })
  isWinner: boolean;

  @Column({ name: 'result_note', type: 'text', nullable: true })
  resultNote: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
