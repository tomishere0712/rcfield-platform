import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { CafeOperatingHours, CafeStatus, WidgetConfigData } from '../types';

@Entity('cafes')
@Index(['providerId'])
@Index(['status'])
@Index(['city', 'district'])
export class Cafe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: CafeStatus, enumName: 'cafe_status_enum' })
  status: CafeStatus;

  @Column({ name: 'cover_image_url', type: 'text', nullable: true })
  coverImageUrl: string | null;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'varchar', length: 100 })
  district: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ name: 'operating_hours', type: 'jsonb', default: {} })
  operatingHours: CafeOperatingHours;

  @Column({ name: 'track_types', type: 'uuid', array: true, default: [] })
  trackTypes: string[];

  @Column({ name: 'slot_duration_minutes', type: 'int', default: 60 })
  slotDurationMinutes: number;

  @Column({ name: 'slot_fee_rate', type: 'numeric', precision: 15, scale: 2 })
  slotFeeRate: number;

  @Column({ name: 'max_concurrent_bookings', type: 'int', default: 10 })
  maxConcurrentBookings: number;

  @Column({ name: 'min_booking_notice_minutes', type: 'int', default: 60 })
  minBookingNoticeMinutes: number;

  @Column({ name: 'max_advance_booking_days', type: 'int', default: 30 })
  maxAdvanceBookingDays: number;

  @Column({ name: 'byoc_capacity', type: 'int', default: 5 })
  byocCapacity: number;

  @Column({ name: 'amenity_ids', type: 'uuid', array: true, default: [] })
  amenityIds: string[];

  @Column({ type: 'text', array: true, default: [] })
  rules: string[];

  @Column({ name: 'widget_config', type: 'jsonb' })
  widgetConfig: WidgetConfigData;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
