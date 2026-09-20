import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DamagePartType } from '../types';
import { Inspection } from './inspection.entity';

@Entity('damage_line_items')
@Index(['inspectionId'])
export class DamageLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inspection_id', type: 'uuid' })
  inspectionId: string;

  @ManyToOne(() => Inspection, (inspection) => inspection.damageLineItems)
  @JoinColumn({ name: 'inspection_id' })
  inspection: Inspection;

  @Column({ name: 'part_type', type: 'enum', enum: DamagePartType })
  partType: DamagePartType;

  @Column({ name: 'custom_part_name', type: 'varchar', length: 255, nullable: true })
  customPartName: string | null;

  @Column({ name: 'parts_price', type: 'numeric', precision: 15, scale: 2 })
  partsPrice: number;

  @Column({ name: 'labor_price', type: 'numeric', precision: 15, scale: 2, default: 0 })
  laborPrice: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
