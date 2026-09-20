import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContestStatus } from '../types';

@Entity('contests')
@Index(['providerId', 'status'])
@Index(['contestTypeId', 'contestFormatId'])
export class Contest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'track_type', type: 'varchar', length: 50, nullable: true })
  legacyTrackType: string | null;

  @Column({ name: 'track_type_id', type: 'uuid', nullable: true })
  trackTypeId: string | null;

  @Column({ name: 'contest_type_id', type: 'uuid', nullable: true })
  contestTypeId: string | null;

  @Column({ name: 'contest_format_id', type: 'uuid', nullable: true })
  contestFormatId: string | null;

  @Column({ name: 'contest_template_id', type: 'uuid', nullable: true })
  contestTemplateId: string | null;

  @Column({ name: 'registration_opens_at', type: 'timestamptz', nullable: true })
  registrationOpensAt: Date | null;

  @Column({ name: 'registration_closes_at', type: 'timestamptz', nullable: true })
  registrationClosesAt: Date | null;

  @Column({ name: 'vehicle_rule', type: 'jsonb', default: {} })
  vehicleRule: Record<string, unknown>;

  @Column({ name: 'banner_image_url', type: 'text', nullable: true })
  bannerImageUrl: string | null;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Column({ type: 'integer', nullable: true })
  capacity: number | null;

  @Column({ name: 'entry_fee', type: 'numeric', precision: 15, scale: 2, default: 0 })
  entryFee: number;

  @Column({ type: 'varchar', length: 20, default: ContestStatus.DRAFT })
  status: ContestStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
