# Data Model: Thiết kế lại Nghiệp vụ Tính Giá Đền Bù Hư Hỏng Xe

**Date**: 2026-07-14
**Feature**: `specs/016-damage-charge-redesign/spec.md`

---

## Thực thể mới

### `DamageLineItem` — Hạng mục hư hỏng

**Bảng DB**: `damage_line_items`
**File entity**: `rcfeild-be/src/models/damage-line-item.entity.ts`

| Cột | Kiểu DB | TypeORM | TypeScript | Nullable | Ghi chú |
|-----|---------|---------|------------|----------|---------|
| `id` | `uuid` | `@PrimaryGeneratedColumn('uuid')` | `string` | No | PK |
| `inspection_id` | `uuid` | `@Column` + `@ManyToOne` | `string` | No | FK → `inspections.id` |
| `part_type` | `enum DamagePartType` | `@Column({ type: 'enum', enum: DamagePartType })` | `DamagePartType` | No | Loại bộ phận |
| `custom_part_name` | `varchar(255)` | `@Column({ nullable: true })` | `string \| null` | Yes | Bắt buộc khi `part_type = OTHER` |
| `parts_price` | `numeric(15,2)` | `@Column({ type: 'numeric', precision: 15, scale: 2 })` | `number` | No | Giá linh kiện, >= 0 |
| `labor_price` | `numeric(15,2)` | `@Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })` | `number` | No | Phí công, >= 0, default 0 |
| `created_at` | `timestamptz` | `@CreateDateColumn` | `Date` | No | Auto |
| `updated_at` | `timestamptz` | `@UpdateDateColumn` | `Date` | No | Auto |
| `deleted_at` | `timestamptz` | `@DeleteDateColumn` | `Date \| null` | Yes | Soft delete |

**Derived**: `line_total = parts_price + labor_price` (computed in service, không lưu DB)

**Validation rules**:
- `parts_price >= 0` (bắt buộc, lỗi nếu thiếu)
- `labor_price >= 0` (mặc định 0)
- Khi `part_type = OTHER`: `custom_part_name` bắt buộc không rỗng
- Khi `part_type != OTHER`: `custom_part_name` nên là null

---

## Enum mới

### `DamagePartType`

**File**: `rcfeild-be/src/types/index.ts` (thêm vào)

```typescript
export enum DamagePartType {
  TIRE_WHEEL = 'TIRE_WHEEL',   // Bánh xe & lốp
  SPOILER    = 'SPOILER',      // Cánh gió
  CHASSIS    = 'CHASSIS',      // Khung gầm
  MOTOR      = 'MOTOR',        // Motor điện
  SHELL      = 'SHELL',        // Vỏ nhựa (shell)
  SERVO      = 'SERVO',        // Trục lái (servo)
  REMOTE     = 'REMOTE',       // Điều khiển từ xa (remote)
  OTHER      = 'OTHER',        // Khác (yêu cầu custom_part_name)
}
```

---

## Thực thể sửa đổi

### `Inspection` — Biên bản kiểm xe (hiện có)

**File**: `rcfeild-be/src/models/inspection.entity.ts`

| Thay đổi | Chi tiết |
|----------|---------|
| **Thêm relation** | `@OneToMany(() => DamageLineItem, (item) => item.inspection) damageLineItems: DamageLineItem[]` |
| **Giữ nguyên** | `damageCostEstimate: number \| null` — không xoá, dùng cho backward compat (records cũ) |
| **Giữ nguyên** | `aiAnalysisJson: Record<string, unknown> \| null` — giữ nhưng `damageMultiplier` trong đó không còn được đọc |
| **Giữ nguyên** | `damageNoted`, `damageDescription`, `customerConfirmed`, `customerConfirmedAt` — không đổi |

---

## Logic tính tổng đền bù (thay thế cũ)

**Cũ** (`settleSessionCheckoutBilling` hiện tại):
```
damageCharge = damageCostEstimate × (aiAnalysisJson.damageMultiplier ?? 1.5)
```

**Mới**:
```
damageCharge = SUM(damage_line_items WHERE inspection_id = inspection.id AND deleted_at IS NULL)
             = SUM(parts_price + labor_price)
```

**Fallback cho records cũ** (không có line items):
```
if (damageLineItems.length === 0 && damageCostEstimate !== null):
  damageCharge = damageCostEstimate × 1.5  // giữ hành vi cũ cho data legacy
```

---

## Quan hệ

```
inspections (1) ──< (N) damage_line_items
```

- Một inspection có thể có nhiều DamageLineItem
- DamageLineItem thuộc về đúng một Inspection
- Khi staff chỉnh sửa (tranh chấp), các items cũ bị soft-delete và items mới được tạo

---

## Migration DB

**File mới**: `rcfeild-be/src/migrations/YYYYMMDDHHMMSS-create-damage-line-items.ts`

```sql
-- Up
CREATE TYPE damage_part_type AS ENUM (
  'TIRE_WHEEL', 'SPOILER', 'CHASSIS', 'MOTOR',
  'SHELL', 'SERVO', 'REMOTE', 'OTHER'
);

CREATE TABLE damage_line_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id    UUID        NOT NULL REFERENCES inspections(id),
  part_type        damage_part_type NOT NULL,
  custom_part_name VARCHAR(255),
  parts_price      NUMERIC(15,2) NOT NULL DEFAULT 0,
  labor_price      NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX idx_damage_line_items_inspection_id ON damage_line_items(inspection_id);

-- Down
DROP TABLE damage_line_items;
DROP TYPE damage_part_type;
```

---

## Thực thể không đổi (liên quan)

- **`PaymentComponent`**: Giữ nguyên type `DAMAGE_CHARGE`. Chỉ thay đổi nguồn tính `amount`.
- **`Session`**: Giữ nguyên `CHECKING_OUT` state. Không thêm state mới.
- **`Booking`**: Không thay đổi.
- **`Incidents`** (Constitution II): Được tạo khi staff escalate dispute lên Provider. Dùng table đã có trong Phase 1 schema.
