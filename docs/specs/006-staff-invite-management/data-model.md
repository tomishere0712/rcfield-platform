# Data Model: Staff Management — Provider Invite Flow

## New Table: `staff_invite_tokens`

Follows the same pattern as `password_reset_tokens`.

```sql
CREATE TABLE staff_invite_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,           -- SHA-256 hash of raw token
  expires_at  TIMESTAMPTZ NOT NULL,           -- created_at + 48 hours
  used_at     TIMESTAMPTZ NULL,               -- set on successful activation
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_invite_tokens_user_id ON staff_invite_tokens(user_id);
```

**Migration file**: `TIMESTAMP-AddStaffInviteTokens.ts`

---

## New TypeORM Entity: `StaffInviteToken`

**File**: `src/models/staff-invite-token.entity.ts`

```typescript
@Entity('staff_invite_tokens')
export class StaffInviteToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) user_id: string;
  @Column({ type: 'text' }) token: string;          // hashed
  @Column({ type: 'timestamptz' }) expires_at: Date;
  @Column({ type: 'timestamptz', nullable: true }) used_at: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at: Date;
}
```

---

## Modified: `AuthPayload` in `src/types/index.ts`

Add optional `cafeId` field. STAFF users will have this populated after login.

```typescript
export interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
  cafeId?: string;           // ← NEW: populated for STAFF users only
  impersonated_by?: string;
}
```

---

## Modified: `auth.service.ts` — JWT payload for STAFF

In `issueTokenPair`, include `cafeId` when `user.role === STAFF`:

```typescript
// pseudo-code
const cafeId = user.role === UserRole.STAFF
  ? await this.getAssignedCafeId(user.id)
  : undefined;

const access_token = jwt.sign(
  { userId: user.id, email: user.email, role: user.role, ...(cafeId && { cafeId }) },
  env.jwt.secret,
  { expiresIn: '1h' },
);
```

---

## Existing Tables (no schema changes)

### `users`

No schema change. State mapping:

| `is_active` | Active invite token exists? | Staff status |
|-------------|----------------------------|--------------|
| `false`     | YES (not used, not expired) | **PENDING**  |
| `true`      | (irrelevant)               | **ACTIVE**   |
| `false`     | NO                         | **DISABLED** |

The `createStaffForProvider` function changes `is_active` from `true` → `false` on initial creation.

### `staff_cafe_assignments`

No schema change. Existing schema:

```sql
staff_id    UUID REFERENCES users(id)   -- UNIQUE (1 staff → 1 cafe)
cafe_id     UUID REFERENCES cafes(id)
assigned_by UUID REFERENCES users(id)
assigned_at TIMESTAMPTZ DEFAULT NOW()
```

---

## Response Shapes

### `StaffListItem` (GET /provider/staff response)

```typescript
interface StaffListItem {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  cafeId: string;
  cafeName: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  createdAt: string;       // ISO 8601
  activatedAt: string | null;
}
```

### `InviteStaffResponse` (POST /provider/staff response)

```typescript
interface InviteStaffResponse {
  id: string;
  email: string;
  fullName: string;
  cafeId: string;
  status: 'PENDING';
  emailSent: boolean;      // false if Brevo failed — Provider sees a warning
}
```

### `ValidateInviteResponse` (GET /auth/staff-invite/validate response)

```typescript
interface ValidateInviteResponse {
  email: string;           // show to user: "Activating account for X@email.com"
  fullName: string;
}
```

### `ActivateStaffResponse` (POST /auth/staff-invite/activate response)

```typescript
interface ActivateStaffResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'STAFF';
    cafeId: string;
  };
}
```
