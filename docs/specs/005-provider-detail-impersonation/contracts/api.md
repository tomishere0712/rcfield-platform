# API Contracts: Admin Provider Detail & Impersonation

Base URL: `/api/v1`  
All endpoints require: `Authorization: Bearer <admin_token>`  
Auth middleware: `authenticate` → `authorize(UserRole.ADMIN)`

---

## Existing Endpoints (unchanged, for reference)

### GET /admin/providers/:id
Returns provider detail: account + business profile + subscription.  
Already implemented in `provider-onboarding.controller.ts`.

---

## New Endpoints

### GET /admin/providers/:id/cafes

Returns the list of cafes belonging to a provider.

**Route**: `GET /api/v1/admin/providers/:id/cafes`  
**Auth**: Admin only  
**Controller**: `provider-onboarding.controller.ts` → `getProviderCafes`

#### Request

| Parameter | Location | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string (UUID) | yes | Provider's user ID |

#### Response 200

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Chi nhánh Quận 1",
      "address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
      "status": "ACTIVE"
    },
    {
      "id": "uuid",
      "name": "Chi nhánh Bình Thạnh",
      "address": "45 Xô Viết Nghệ Tĩnh, Bình Thạnh, TP.HCM",
      "status": "INACTIVE"
    }
  ]
}
```

#### Response 404

```json
{
  "error": "PROVIDER_NOT_FOUND",
  "message": "Provider not found"
}
```

#### Response: empty list

```json
{
  "data": []
}
```

#### Implementation Notes

- Query `cafes` table with `WHERE provider_id = :id AND deleted_at IS NULL`
- Return empty array if provider has no cafes (not 404)
- `status` maps to `CafeStatus` enum: `ACTIVE | INACTIVE | MAINTENANCE`

---

### POST /admin/providers/:id/impersonate

Creates a short-lived JWT that carries the provider's identity with an additional `impersonated_by` claim.

**Route**: `POST /api/v1/admin/providers/:id/impersonate`  
**Auth**: Admin only  
**Controller**: `provider-onboarding.controller.ts` → `impersonateProvider`

#### Request

| Parameter | Location | Type | Required | Description |
|---|---|---|---|---|
| `id` | path | string (UUID) | yes | Provider's user ID |

No request body required.

#### Response 200

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 7200,
  "provider": {
    "id": "provider-user-uuid",
    "business_name": "RC Arena Việt Nam"
  }
}
```

#### Response 404

```json
{
  "error": "PROVIDER_NOT_FOUND",
  "message": "Provider not found"
}
```

#### Response 400 — Provider not ACTIVE

```json
{
  "error": "PROVIDER_NOT_ACTIVE",
  "message": "Impersonation is only allowed for ACTIVE providers"
}
```

#### JWT Payload

```json
{
  "userId": "provider-user-uuid",
  "role": "PROVIDER",
  "email": "provider@example.com",
  "impersonated_by": "admin-user-uuid",
  "iat": 1716900000,
  "exp": 1716907200
}
```

#### Implementation Notes

- Fetch provider user by `id`, verify `registration_status === 'ACTIVE'` on `provider_profiles`
- Sign token with `env.jwt.secret`, `expiresIn: '2h'`
- Include `impersonated_by: req.user.userId` in payload (admin's userId from middleware)
- Do NOT create any DB record — token is the entire session
- Admin calling this endpoint keeps their own session unaffected

---

## Frontend API Functions

```typescript
// src/features/subscriptions/api/index.ts (or admin api file)

export async function getProviderCafes(providerId: string): Promise<CafeListItem[]> {
  const res = await api.get(`/admin/providers/${providerId}/cafes`);
  return res.data.data;
}

export async function impersonateProvider(providerId: string): Promise<ImpersonateResponse> {
  const res = await api.post(`/admin/providers/${providerId}/impersonate`);
  return res.data;
}
```
