import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('vehicle_catalog_images')
@Index(['catalogId', 'sortOrder'])
export class VehicleCatalogImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'catalog_id', type: 'uuid' })
  catalogId: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
