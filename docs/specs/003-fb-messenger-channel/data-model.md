# Data Model: Facebook Messenger Channel Integration

**Branch**: `003-fb-messenger-channel` | **Date**: 2026-05-24

---

## New Entity: CafeChannel

**Table**: `cafe_channels`  
**Purpose**: Stores one channel connection per cafe per channel type. For MVP, only `FACEBOOK_MESSENGER` type is used.

### Fields

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, generated | Primary key |
| `cafe_id` | VARCHAR | NOT NULL | Cafe this channel belongs to |
| `channel_type` | VARCHAR | NOT NULL, enum | Channel type: `FACEBOOK_MESSENGER` |
| `status` | VARCHAR | NOT NULL, default `CONNECTED` | `CONNECTED` \| `DISCONNECTED` |
| `page_id` | VARCHAR | NOT NULL, indexed | FB Page ID used for webhook routing |
| `page_name` | VARCHAR | NOT NULL | Display name (e.g. "RC Cafe Hà Nội") |
| `encrypted_page_token` | TEXT | NOT NULL | AES-256-GCM ciphertext: base64(iv + authTag + token) |
| `connected_at` | TIMESTAMP | NOT NULL | When OAuth completed successfully |
| `created_at` | TIMESTAMP | auto | Row creation time |
| `updated_at` | TIMESTAMP | auto | Last update time |
| `deleted_at` | TIMESTAMP | nullable | Soft delete (TypeORM @DeleteDateColumn) |

### Constraints

- **Unique**: `(cafe_id, channel_type)` — one channel connection per type per cafe
- **Index**: `page_id` — used in hot path (every webhook lookup)

### TypeORM Entity: `CafeChannel`

```typescript
// src/models/cafe-channel.entity.ts
@Entity('cafe_channels')
export class CafeChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cafe_id' })
  cafeId: string;

  @Column({ name: 'channel_type', length: 50 })
  channelType: ChannelType; // enum: FACEBOOK_MESSENGER

  @Column({ length: 20, default: 'CONNECTED' })
  status: ChannelStatus; // enum: CONNECTED | DISCONNECTED

  @Column({ name: 'page_id', length: 100 })
  pageId: string;

  @Column({ name: 'page_name', length: 255 })
  pageName: string;

  @Column({ name: 'encrypted_page_token', type: 'text' })
  encryptedPageToken: string;

  @Column({ name: 'connected_at' })
  connectedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
```

---

## New Enums (add to `src/types/index.ts`)

```typescript
export enum ChannelType {
  FACEBOOK_MESSENGER = 'FACEBOOK_MESSENGER',
}

export enum ChannelStatus {
  CONNECTED    = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}
```

---

## Existing Entities — No Changes

| Entity | Reason untouched |
|--------|-----------------|
| `CafeWidgetConfig` | AI response logic reused as-is via `chat.service.ts` |
| `KbChunk` / `KbDocument` | Knowledge base lookup reused as-is |
| `feature_flags` (raw table) | Quota gate reused via `checkGate(cafeId)` |
| `User` / `RefreshToken` | Auth unchanged |

---

## Redis Keys (ephemeral, not DB tables)

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `oauth:fb:nonce:{nonce}` | 600s | CSRF nonce during OAuth flow |
| `facebook:processed:{pageId}:{mid}` | 300s | Deduplication of webhook retries |

---

## Migration

**File**: `src/migrations/{timestamp}-FbMessengerChannel.ts`

```sql
-- Create cafe_channels table
CREATE TABLE cafe_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id VARCHAR NOT NULL,
  channel_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
  page_id VARCHAR(100) NOT NULL,
  page_name VARCHAR(255) NOT NULL,
  encrypted_page_token TEXT NOT NULL,
  connected_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP
);

-- Unique: one channel type per cafe
CREATE UNIQUE INDEX uq_cafe_channels_cafe_type
  ON cafe_channels(cafe_id, channel_type)
  WHERE deleted_at IS NULL;

-- Index for hot webhook routing path
CREATE INDEX idx_cafe_channels_page_id
  ON cafe_channels(page_id)
  WHERE deleted_at IS NULL AND status = 'CONNECTED';
```
