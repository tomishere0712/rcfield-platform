import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { PhotoAngle } from '../types';

@Entity('inspection_photos')
@Index(['inspectionId'])
export class InspectionPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inspection_id', type: 'uuid' })
  inspectionId: string;

  @Column({ type: 'enum', enum: PhotoAngle })
  angle: PhotoAngle;

  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
