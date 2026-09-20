import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('amenity_catalog')
export class AmenityCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // icon slug matching FE amenityIcons map: timer|tool|road|snow|coffee|camera|wifi|parking|trophy|shield
  @Column({ type: 'varchar', length: 50 })
  icon: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
