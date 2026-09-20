import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { KbDocumentStatus, KbContentType } from '../types';

@Entity('kb_documents')
export class KbDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id' })
  cafeId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'original_filename', length: 500 })
  originalFilename: string;

  @Column({
    name: 'content_type',
    type: 'varchar',
    length: 20,
    default: KbContentType.CUSTOM,
  })
  contentType: KbContentType;

  @Column({ name: 'raw_content', type: 'text', nullable: true })
  rawContent: string | null;

  @Column({ type: 'varchar', length: 10, default: KbDocumentStatus.PENDING })
  status: KbDocumentStatus;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
