# Quickstart: Staff Management — Provider Invite Flow

Implementation order and integration test scenarios.

## Implementation Order

```
1. Backend foundation
   ├── Migration: staff_invite_tokens table
   ├── Entity: StaffInviteToken
   ├── types/index.ts: AuthPayload.cafeId
   └── auth.service.ts: cafeId in JWT for STAFF

2. Backend — Provider side
   ├── email.service.ts: sendStaffInvite()
   ├── staff.service.ts: modify createStaffForProvider (is_active=false + invite token)
   ├── staff.service.ts: listStaffForProvider()
   ├── staff.service.ts: deactivateStaff(), reactivateStaff()
   ├── staff.service.ts: resendInvite()
   ├── validate/index.ts: InviteStaffSchema (remove password field)
   ├── staff.controller.ts: listStaff, deactivate, reactivate, resendInvite handlers
   └── provider-subscription.routes.ts: wire new routes

3. Backend — Public activation
   ├── staff.service.ts: validateInviteToken(), activateStaffAccount()
   ├── staff-invite.controller.ts: validateToken, activateAccount handlers
   └── staff-invite.routes.ts: public router

4. Backend — Staff data endpoint
   ├── staff.service.ts (or new staff-ops.service.ts): getTodayBookings(cafeId)
   ├── staff.controller.ts: todayBookings handler
   └── staff.routes.ts (new): GET /staff/today-bookings

5. Frontend — New activation page
   └── pages/staff/activate/StaffActivatePage.tsx

6. Frontend — Wire Provider staff management
   ├── features/staff/api/staff.api.ts
   └── pages/provider/ProviderStaffPage.tsx (remove mock, use real API)

7. Frontend — Wire staff dashboard
   └── pages/staff/dashboard/StaffDashboardPage.tsx (remove mock, use real API)
```

---

## End-to-End Test Scenarios

### Scenario A: Happy path — invite + activate

```
1. Provider logs in (PROVIDER role, active subscription)
2. POST /provider/staff
   Body: { cafe_id, full_name: "Test Staff", email: "newstaff@test.com" }
   Assert: 201, data.status = "PENDING", data.emailSent = true

3. GET /provider/staff
   Assert: staff appears with status "PENDING"

4. (Simulate email) Extract token from staff_invite_tokens table
5. GET /auth/staff-invite/validate?token=<raw_token>
   Assert: 200, data.email = "newstaff@test.com"

6. POST /auth/staff-invite/activate
   Body: { token: <raw_token>, password: "Password123" }
   Assert: 200, returns access_token, user.role = "STAFF", user.cafeId = <cafe_id>

7. GET /provider/staff
   Assert: staff now shows status "ACTIVE", activatedAt is set

8. GET /staff/today-bookings  (with staff JWT)
   Assert: 200, returns array (may be empty)
```

### Scenario B: Deactivate + reactivate

```
1. (After Scenario A) Provider deactivates the staff
   PATCH /provider/staff/<staffId>/deactivate
   Assert: 200, status = "DISABLED"

2. Staff tries to log in
   POST /auth/login
   Assert: 403 ACCOUNT_LOCKED

3. Provider reactivates
   PATCH /provider/staff/<staffId>/reactivate
   Assert: 200, status = "ACTIVE"

4. Staff logs in successfully
   Assert: 200, JWT returned
```

### Scenario C: Brevo failure — account persists

```
1. Mock Brevo to return 500
2. POST /provider/staff
   Assert: 201, data.emailSent = false (no error thrown)

3. GET /provider/staff
   Assert: staff appears with status "PENDING"

4. Provider resends invite
   POST /provider/staff/<staffId>/resend-invite
   Assert: 200, emailSent = true (if Brevo recovered)
```

### Scenario D: Expired token

```
1. Create staff (PENDING)
2. Fast-forward token expires_at to past (DB update in test setup)
3. GET /auth/staff-invite/validate?token=<raw_token>
   Assert: 410 INVITE_TOKEN_EXPIRED
```

### Scenario E: Email conflict

```
1. Register a CUSTOMER with email "customer@test.com"
2. Provider tries to invite that email as staff
   POST /provider/staff
   Body: { email: "customer@test.com", ... }
   Assert: 409 EMAIL_ALREADY_EXISTS
```

---

## Key Files Reference

| Area | File | What changes |
|------|------|-------------|
| Migration | `rcfeild-be/src/migrations/TIMESTAMP-AddStaffInviteTokens.ts` | New table |
| Entity | `rcfeild-be/src/models/staff-invite-token.entity.ts` | New |
| Types | `rcfeild-be/src/types/index.ts` | AuthPayload.cafeId |
| Auth | `rcfeild-be/src/services/auth.service.ts` | cafeId in JWT |
| Email | `rcfeild-be/src/services/email.service.ts` | sendStaffInvite() |
| Staff svc | `rcfeild-be/src/services/staff.service.ts` | Full invite flow |
| Staff ctrl | `rcfeild-be/src/controllers/staff.controller.ts` | 4 new handlers |
| Invite ctrl | `rcfeild-be/src/controllers/staff-invite.controller.ts` | New |
| Provider routes | `rcfeild-be/src/routes/provider-subscription.routes.ts` | New staff routes |
| Invite routes | `rcfeild-be/src/routes/staff-invite.routes.ts` | New public router |
| Validate | `rcfeild-be/src/validate/index.ts` | 2 new schemas |
| FE activate | `rcfield-fe/src/pages/staff/activate/StaffActivatePage.tsx` | New |
| FE staff API | `rcfield-fe/src/features/staff/api/staff.api.ts` | New |
| FE provider | `rcfield-fe/src/pages/provider/ProviderStaffPage.tsx` | Remove mock |
| FE dashboard | `rcfield-fe/src/pages/staff/dashboard/StaffDashboardPage.tsx` | Remove mock |
