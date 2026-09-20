import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity('cafe_track_configs')
@Index(['cafeId'])
export class CafeTrackConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', type: 'uuid' })
  cafeId: string;

  @Column({ name: 'track_type_id', type: 'uuid' })
  trackTypeId: string;

  @Column({ name: 'max_concurrent', type: 'int', default: 10 })
  maxConcurrent: number;

  @Column({ name: 'byoc_capacity', type: 'int' })
  byocCapacity: number;

  @Column({ type: 'text', array: true, default: [] })
  images: string[];

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
