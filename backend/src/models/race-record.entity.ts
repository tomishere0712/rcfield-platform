import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RaceRecordSourceType, RaceRecordVerificationStatus, VehicleSource } from '../types';

@Entity('race_records')
@Index(['verificationStatus', 'cafeId', 'trackConfigId', 'vehicleSource'])
export class RaceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'track_config_id', type: 'uuid', nullable: true })
  trackConfigId: string | null;

  @Column({ name: 'contest_id', type: 'uuid', nullable: true })
  contestId: string | null;

  @Column({ name: 'match_id', type: 'uuid', nullable: true })
  matchId: string | null;

  @Column({ name: 'contest_match_participant_id', type: 'uuid', nullable: true })
  contestMatchParticipantId: string | null;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ name: 'vehicle_source', type: 'varchar', length: 20, enum: VehicleSource })
  vehicleSource: VehicleSource;

  @Column({ name: 'source_type', type: 'varchar', length: 30, enum: RaceRecordSourceType })
  sourceType: RaceRecordSourceType;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 20,
    enum: RaceRecordVerificationStatus,
    default: RaceRecordVerificationStatus.PENDING,
  })
  verificationStatus: RaceRecordVerificationStatus;

  @Column({ name: 'best_lap_ms', type: 'int', nullable: true })
  bestLapMs: number | null;

  @Column({ name: 'total_time_ms', type: 'int', nullable: true })
  totalTimeMs: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  score: number | null;

  @Column({ name: 'finish_position', type: 'int', nullable: true })
  finishPosition: number | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
