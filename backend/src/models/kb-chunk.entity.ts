import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { KbDocument } from './kb-document.entity';

@Entity('kb_chunks')
export class KbChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id' })
  cafeId: string;

  @Column({ name: 'document_id' })
  documentId: string;

  @ManyToOne(() => KbDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: KbDocument;

  @Column({ name: 'chunk_text', type: 'text' })
  chunkText: string;

  @Column({ name: 'chunk_index' })
  chunkIndex: number;

  // Stored as vector in PostgreSQL; embedding insert/query must use raw SQL.
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
