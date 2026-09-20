# Data Model: Booking Review & Rating

**Feature**: [spec.md](spec.md)  
**Research**: [research.md](research.md)

---

## New Table

### `reviews`

Records a single review submitted by a customer for a completed booking.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `booking_id` | UUID | NOT NULL, UNIQUE, FK → bookings.id | One review per booking |
| `cafe_id` | UUID | NOT NULL, FK → cafes.id | Denormalized for query performance |
| `customer_id` | UUID | NOT NULL, FK → users.id | |
| `overall_score` | SMALLINT | NOT NULL, CHECK (1–5) | Required field |
| `vehicle_score` | SMALLINT | NULL, CHECK (1–5) | Null for BYOC bookings |
| `staff_score` | SMALLINT | NULL, CHECK (1–5) | Optional |
| `facility_score` | SMALLINT | NULL, CHECK (1–5) | Optional |
| `note` | TEXT | NULL | Max 500 chars enforced at application layer |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'VISIBLE' | `VISIBLE` or `HIDDEN` |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Set on hide/unhide |

**Indexes**:
```sql
CREATE UNIQUE INDEX idx_reviews_booking_id ON reviews(booking_id);
CREATE INDEX idx_reviews_cafe_status ON reviews(cafe_id, status);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);
```

**Entity class**: `src/models/review.entity.ts` → `@Entity('reviews')`

---

## Altered Tables

### `bookings` — 2 new columns

```sql
ALTER TABLE bookings ADD COLUMN completed_at TIMESTAMPTZ NULL;
ALTER TABLE bookings ADD COLUMN review_dismissed_at TIMESTAMPTZ NULL;

CREATE INDEX idx_bookings_completed_at ON bookings(completed_at) WHERE completed_at IS NOT NULL;
```

| Column | Type | Notes |
|--------|------|-------|
| `completed_at` | TIMESTAMPTZ NULL | Set to `NOW()` when booking transitions to COMPLETED. Used for the 7-day deadline check. |
| `review_dismissed_at` | TIMESTAMPTZ NULL | Set to `NOW()` when customer dismisses the review prompt. NULL = not dismissed. |

The `review_dismissed_at` approach is simpler than a separate dismissal table — a single `WHERE review_dismissed_at IS NULL` check covers the reminder query, and no extra entity/FK is needed.

---

## Migration

One migration file (`rcfeild-be/src/migrations/`):

### `1752100000000-AddReviewTables.ts`

```sql
-- reviews table
CREATE TABLE reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE,
  cafe_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  overall_score SMALLINT NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  vehicle_score SMALLINT NULL CHECK (vehicle_score BETWEEN 1 AND 5),
  staff_score SMALLINT NULL CHECK (staff_score BETWEEN 1 AND 5),
  facility_score SMALLINT NULL CHECK (facility_score BETWEEN 1 AND 5),
  note TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT PK_reviews PRIMARY KEY (id),
  CONSTRAINT FK_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT FK_reviews_cafe FOREIGN KEY (cafe_id) REFERENCES cafes(id),
  CONSTRAINT FK_reviews_customer FOREIGN KEY (customer_id) REFERENCES users(id)
);

CREATE INDEX idx_reviews_cafe_status ON reviews(cafe_id, status);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);

-- new columns on bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS review_dismissed_at TIMESTAMPTZ NULL;

CREATE INDEX idx_bookings_completed_at ON bookings(completed_at) WHERE completed_at IS NOT NULL;
```

---

## TypeORM Entity

### `Review` entity (sketch)

```typescript
// src/models/review.entity.ts
@Entity('reviews')
@Index(['cafeId', 'status'])
@Index(['customerId'])
export class Review {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'booking_id', type: 'uuid', unique: true }) bookingId: string;
  @Column({ name: 'cafe_id', type: 'uuid' }) cafeId: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
  @Column({ name: 'overall_score', type: 'smallint' }) overallScore: number;
  @Column({ name: 'vehicle_score', type: 'smallint', nullable: true }) vehicleScore: number | null;
  @Column({ name: 'staff_score', type: 'smallint', nullable: true }) staffScore: number | null;
  @Column({ name: 'facility_score', type: 'smallint', nullable: true }) facilityScore: number | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'varchar', length: 20, default: 'VISIBLE' }) status: 'VISIBLE' | 'HIDDEN';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
```

The `Booking` entity gains two new optional columns (no new entity file needed):

```typescript
// additions to src/models/booking.entity.ts
@Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
completedAt: Date | null;

@Column({ name: 'review_dismissed_at', type: 'timestamptz', nullable: true })
reviewDismissedAt: Date | null;
```

---

## Key Relationships

```
bookings (1) ──────── (0..1) reviews
cafes    (1) ──────── (0..N) reviews
users    (1) ──────── (0..N) reviews
```

---

## Enums / String Unions

Add to `src/types/index.ts`:

```typescript
// ── Reviews ───────────────────────────────────────────────────────────────────

export type ReviewStatus = 'VISIBLE' | 'HIDDEN';
```

Add to `NotificationType` union in `src/types/index.ts`:

```typescript
// Existing union — add:
| 'BOOKING_REVIEW_REQUEST'
```
