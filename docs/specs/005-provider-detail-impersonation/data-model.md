# Data Model: Admin Provider Detail & Impersonation

**No new database tables are introduced by this feature.** All data is read from existing tables.

---

## Data Sources

### Provider Detail (aggregated response)

| Field Group | Source Table | Key Fields |
|---|---|---|
| Account | `users` | `id`, `full_name`, `email`, `phone`, `created_at` |
| Business | `provider_profiles` | `business_name`, `business_description`, `registration_status` |
| Subscription | `provider_subscriptions` JOIN `subscription_plans` | `plan_name`, `status`, `expires_at`, `ai_messages_used` |
| Cafes | `cafes` | `id`, `name`, `address`, `status`, `deleted_at IS NULL` |

### Impersonation Token Payload (JWT, not persisted)

```typescript
interface ImpersonationTokenPayload {
  userId: string;           // provider's user ID
  role: UserRole.PROVIDER;  // hardcoded PROVIDER
  email: string;            // provider's email
  impersonated_by: string;  // admin's userId
  exp: number;              // now + 2 hours
}
```

### Frontend Impersonation State (Zustand, not persisted to DB)

```typescript
interface ImpersonationState {
  providerUserId: string;   // for return path /admin/providers/:id
  providerName: string;     // shown in banner: "Đang truy cập với tư cách: [providerName]"
}
```

Stored in `authStore.impersonation: ImpersonationState | null`.

---

## State Transitions (client-side)

```
Normal Admin Session
  └─ [Start Impersonation]
       ├─ Save admin token → localStorage["rcfield.admin_auth"]
       ├─ Set impersonation token → localStorage["rcfield.auth"]
       ├─ Set authStore.impersonation = { providerUserId, providerName }
       └─ Impersonation Session
            ├─ [Manual Exit / "Thoát" button]
            │    └─ Restore admin token, clear impersonation → Normal Admin Session
            └─ [Auto Exit: 401 with adminAuth key present]
                 └─ Restore admin token, clear impersonation → Normal Admin Session
```

---

## Existing AuthPayload Type (needs modification)

```typescript
// Current
interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
}

// After modification
interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
  impersonated_by?: string;  // present only on impersonation tokens
}
```

---

## API Response Shapes

### GET /admin/providers/:id/cafes

```typescript
interface CafeListItem {
  id: string;
  name: string;
  address: string;
  status: CafeStatus;  // ACTIVE | INACTIVE | MAINTENANCE
}

type GetProviderCafesResponse = CafeListItem[];
```

### POST /admin/providers/:id/impersonate

```typescript
interface ImpersonateResponse {
  token: string;          // short-lived JWT, 2h
  expires_in: number;     // 7200 (seconds)
  provider: {
    id: string;           // provider's userId
    business_name: string;
  };
}
```
