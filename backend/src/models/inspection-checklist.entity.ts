import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { InspectionItemStatus } from '../types';

@Entity('inspection_checklists')
@Index(['inspectionId'])
export class InspectionChecklist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inspection_id', type: 'uuid' })
  inspectionId: string;

  @Column({ name: 'item_key', type: 'varchar', length: 100 })
  itemKey: string;

  @Column({ name: 'item_label', type: 'varchar', length: 255 })
  itemLabel: string;

  @Column({ type: 'enum', enum: InspectionItemStatus })
  status: InspectionItemStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
