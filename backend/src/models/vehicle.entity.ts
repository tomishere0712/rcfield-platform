import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VehicleStatus } from '../types';
import { VehicleCatalog } from './vehicle-catalog.entity';

@Entity('vehicles')
@Index(['cafeId'])
@Index(['status'])
@Index(['catalogId'])
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'catalog_id', type: 'uuid' })
  catalogId: string;

  @ManyToOne(() => VehicleCatalog)
  @JoinColumn({ name: 'catalog_id' })
  catalog: VehicleCatalog;

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    enumName: 'vehicle_status_enum',
    default: VehicleStatus.AVAILABLE,
  })
  status: VehicleStatus;

  @Column({ name: 'last_maintenance_at', type: 'timestamptz', nullable: true })
  lastMaintenanceAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  identifier: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  color: string | null;

  @Column({ name: 'distinctive_image_url', type: 'text', nullable: true })
  distinctiveImageUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
