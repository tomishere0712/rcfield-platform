# Data Model: Provider KYC Verification

**Feature**: 012-provider-kyc  
**Date**: 2026-07-06  
**Decision**: Không tạo bảng mới — extend `provider_profiles` với 3 column mới.

---

## Modified Table: `provider_profiles`

### New columns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `business_type` | varchar(20) | NULL | `INDIVIDUAL` \| `BUSINESS` — set khi Provider nộp KYC |
| `kyc_documents` | jsonb | NULL, default `'[]'` | Array documents của lần nộp gần nhất |
| `kyc_submitted_at` | timestamptz | NULL | Thời điểm nộp hồ sơ gần nhất |

**Note**: Resubmit ghi đè `kyc_documents` và `kyc_submitted_at`. Không có lịch sử các lần nộp trước.

### `kyc_documents` JSONB structure

```json
[
  {
    "documentType": "CCCD_FRONT",
    "cloudinaryUrl": "https://res.cloudinary.com/...",
    "cloudinaryPublicId": "rcfield/kyc/uuid/cccd-front-...",
    "originalFilename": "cccd-mat-truoc.jpg"
  },
  {
    "documentType": "CCCD_BACK",
    "cloudinaryUrl": "https://res.cloudinary.com/...",
    "cloudinaryPublicId": "rcfield/kyc/uuid/cccd-back-...",
    "originalFilename": "cccd-mat-sau.jpg"
  },
  {
    "documentType": "VENUE_PHOTO",
    "cloudinaryUrl": "https://res.cloudinary.com/...",
    "cloudinaryPublicId": "rcfield/kyc/uuid/venue-...",
    "originalFilename": "san-rc.jpg"
  }
]
```

---

## No New Tables

Không tạo `provider_kyc_applications` hay `provider_kyc_documents`. Lịch sử các lần nộp không được lưu — đây là trade-off có chủ đích để đơn giản hóa schema.

---

## Migration

**File**: `src/migrations/{timestamp}-AddKycColumnsToProviderProfiles.ts`

```sql
-- Up
ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS business_type    varchar(20),
  ADD COLUMN IF NOT EXISTS kyc_documents    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz;

-- Down
ALTER TABLE provider_profiles
  DROP COLUMN IF EXISTS business_type,
  DROP COLUMN IF EXISTS kyc_documents,
  DROP COLUMN IF EXISTS kyc_submitted_at;
```

---

## TypeORM Entity Changes

### `ProviderProfile` — thêm 3 fields

```typescript
// src/models/provider-profile.entity.ts — ADD these columns:

@Column({ name: 'business_type', type: 'varchar', length: 20, nullable: true })
businessType: KycBusinessType | null;

@Column({ name: 'kyc_documents', type: 'jsonb', default: [] })
kycDocuments: KycDocumentItem[];

@Column({ name: 'kyc_submitted_at', type: 'timestamptz', nullable: true })
kycSubmittedAt: Date | null;
```

### New types

```typescript
// src/types/index.ts

export enum KycBusinessType {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS   = 'BUSINESS',
}

export enum KycDocumentType {
  CCCD_FRONT        = 'CCCD_FRONT',
  CCCD_BACK         = 'CCCD_BACK',
  GPKD              = 'GPKD',
  REPRESENTATIVE_ID = 'REPRESENTATIVE_ID',
  VENUE_PHOTO       = 'VENUE_PHOTO',
}

export interface KycDocumentItem {
  documentType: KycDocumentType;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  originalFilename: string | null;
}
```

---

## Enum Changes

### `ProviderStatus` — thêm transition `REJECTED → PENDING`

```typescript
// src/services/provider-onboarding.service.ts
const PROVIDER_STATUS_TRANSITIONS: Record<ProviderStatus, ProviderStatus[]> = {
  [ProviderStatus.PENDING]:   [ProviderStatus.ACTIVE, ProviderStatus.REJECTED],
  [ProviderStatus.ACTIVE]:    [ProviderStatus.SUSPENDED],
  [ProviderStatus.SUSPENDED]: [ProviderStatus.ACTIVE],
  [ProviderStatus.REJECTED]:  [ProviderStatus.PENDING],  // ← NEW
};
```
