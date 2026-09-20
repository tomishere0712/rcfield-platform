import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { AssetTier } from '../types';

@Entity('vehicle_catalogs')
@Index(['cafeId'])
export class VehicleCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: AssetTier, enumName: 'vehicle_tier_enum' })
  tier: AssetTier;

  @Column({ name: 'hourly_rate', type: 'numeric', precision: 15, scale: 2 })
  hourlyRate: number;

  @Column({ name: 'security_deposit', type: 'numeric', precision: 15, scale: 2 })
  securityDeposit: number;

  @Column({ name: 'compatible_track_types', type: 'uuid', array: true, default: [] })
  compatibleTrackTypes: string[];

  @Column({ name: 'cover_image_url', type: 'text', nullable: true })
  coverImageUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
