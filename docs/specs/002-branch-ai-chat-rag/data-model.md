# Data Model: Branch AI Chat Assistant

**Phase 1 Output** | **Date**: 2026-05-17

---

## Entities mới

### KbDocument (`kb_documents`)

```typescript
// src/models/kb-document.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Cafe } from './cafe.entity';
import { User } from './user.entity';
import { KbDocumentStatus, KbContentType } from '../types';

@Entity('kb_documents')
export class KbDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id' })
  cafeId: string;

  @ManyToOne(() => Cafe)
  @JoinColumn({ name: 'cafe_id' })
  cafe: Cafe;

  @Column({ length: 255 })
  title: string;

  @Column({ name: 'original_filename', length: 255 })
  originalFilename: string;

  @Column({ name: 'content_type', type: 'enum', enum: KbContentType, default: KbContentType.CUSTOM })
  contentType: KbContentType;

  @Column({ name: 'raw_content', type: 'text', nullable: true })
  rawContent: string | null;

  @Column({ type: 'enum', enum: KbDocumentStatus, default: KbDocumentStatus.PENDING })
  status: KbDocumentStatus;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
```

---

### KbChunk (`kb_chunks`)

TypeORM không có native vector type — dùng raw column type.

```typescript
// src/models/kb-chunk.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cafe } from './cafe.entity';
import { KbDocument } from './kb-document.entity';

@Entity('kb_chunks')
export class KbChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id' })
  cafeId: string;

  @ManyToOne(() => Cafe)
  @JoinColumn({ name: 'cafe_id' })
  cafe: Cafe;

  @Column({ name: 'document_id' })
  documentId: string;

  @ManyToOne(() => KbDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: KbDocument;

  @Column({ name: 'chunk_text', type: 'text' })
  chunkText: string;

  @Column({ name: 'chunk_index' })
  chunkIndex: number;

  // pgvector type — TypeORM không hỗ trợ natively, dùng raw type
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string | null; // stored as vector(768), retrieved via raw SQL

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

> **Note**: Embedding insert/query phải dùng TypeORM `queryRunner.query()` hoặc `DataSource.query()` vì TypeORM ORM layer không hỗ trợ `vector` type. Xem quickstart.md cho pattern cụ thể.

---

### CafeWidgetConfig (`cafe_widget_configs`)

```typescript
// src/models/cafe-widget-config.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Cafe } from './cafe.entity';

@Entity('cafe_widget_configs')
export class CafeWidgetConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id', unique: true })
  cafeId: string;

  @OneToOne(() => Cafe)
  @JoinColumn({ name: 'cafe_id' })
  cafe: Cafe;

  @Column({ name: 'primary_color', length: 20, default: '#1a73e8' })
  primaryColor: string;

  @Column({ length: 20, default: 'BOTTOM_RIGHT' })
  position: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'welcome_message', type: 'text', default: 'Xin chào! Tôi có thể giúp gì cho bạn?' })
  welcomeMessage: string;

  @Column({ name: 'quick_replies', type: 'jsonb', default: '[]' })
  quickReplies: string[];

  @Column({ name: 'greeting_message', type: 'text', nullable: true })
  greetingMessage: string | null;

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ name: 'is_enabled', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

## Enums mới (thêm vào `src/types/index.ts`)

```typescript
// Knowledge Base
export enum KbDocumentStatus {
  PENDING  = 'PENDING',
  INDEXED  = 'INDEXED',
  FAILED   = 'FAILED',
}

export enum KbContentType {
  POLICY       = 'POLICY',
  FAQ          = 'FAQ',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  CUSTOM       = 'CUSTOM',
}

export enum WidgetPosition {
  BOTTOM_RIGHT = 'BOTTOM_RIGHT',
  BOTTOM_LEFT  = 'BOTTOM_LEFT',
}
```

---

## Response types (chat, không lưu DB)

```typescript
// src/types/index.ts — thêm vào

export type ChatResponseType = 'greeting' | 'text' | 'slot_list' | 'vehicle_list';

export interface SlotItem {
  time: string;         // "15:00"
  availableCount: number;
}

export interface VehicleItem {
  name: string;
  tier: string;
  hourlyRate: number;
  status: string;
}

export interface ChatResponse {
  answer: string;
  responseType: ChatResponseType;
  data?: {
    date?: string;
    slots?: SlotItem[];
    vehicles?: VehicleItem[];
  };
  sources?: string[];
  quickReplies?: string[];
}
```

---

## Relationships & Constraints

```
cafes ──< kb_documents ──< kb_chunks
cafes ──1 cafe_widget_configs
feature_flags (entity_type='CAFE', entity_id=cafe_id) ── quota per cafe
```

- `kb_chunks.cafe_id` denormalized từ `kb_documents.cafe_id` để enable single-filter vector search không join.
- `cafe_widget_configs` unique per cafe — upsert pattern (INSERT ON CONFLICT DO UPDATE).
- `kb_documents` soft delete (`deleted_at`) — xóa tài liệu chỉ soft-delete document, cascade hard-delete chunks qua FK `ON DELETE CASCADE`.
