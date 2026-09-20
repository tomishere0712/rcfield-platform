# Tasks: Admin Provider Detail & Impersonation

**Input**: Design documents from `specs/005-provider-detail-impersonation/`  
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api.md ✓, quickstart.md ✓

**Organization**: Tasks grouped by user story. US1 (Provider Detail Page) is fully testable without US2. US2 (Impersonation) depends on US1's detail page being in place.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (touches different files, no blocking dependency)
- **[US1]** / **[US2]**: Maps to User Story 1 / User Story 2 in spec.md

---

## Phase 1: Setup (No new project setup required)

No new dependencies, databases, or configuration files needed — this feature extends existing TypeScript/Express/React project.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend type change that both user stories depend on, plus frontend API layer additions.

**⚠️ CRITICAL**: These tasks MUST complete before any user story work begins.

- [X] T001 Extend `AuthPayload` interface in `rcfeild-be/src/types/index.ts` — add optional field `impersonated_by?: string`
- [X] T002 [P] Add `getProviderCafes(providerId)` and `impersonateProvider(providerId)` async functions to `rcfield-fe/src/features/subscriptions/api/index.ts` (or create `rcfield-fe/src/features/admin/api/index.ts` if no existing admin API file)

**Checkpoint**: AuthPayload type is extended; frontend API functions exist. Backend endpoints don't exist yet — that's fine, functions will 404 until Phase 3/4 complete them.

---

## Phase 3: User Story 1 — Admin Provider Detail Page (Priority: P1) 🎯 MVP

**Goal**: Admin can click a provider row in `/admin/providers` list and view a full detail page at `/admin/providers/:providerId` showing account info, business info, subscription, cafes list, and conditional action buttons.

**Independent Test**: Log in as admin → go to `/admin/providers` → click any provider row → verify the detail page loads with all information sections, correct action buttons per status, and cafes list (or empty state).

### Implementation for User Story 1

- [X] T003 [US1] Add `getProviderCafes` controller function in `rcfeild-be/src/controllers/provider-onboarding.controller.ts` — query `cafes` table where `provider_id = :id AND deleted_at IS NULL`, return `{ data: CafeListItem[] }`
- [X] T004 [US1] Register `GET /:id/cafes` route in `rcfeild-be/src/routes/admin-provider.routes.ts` with `authenticate, authorize(UserRole.ADMIN)` middleware pointing to `getProviderCafes`
- [X] T005 [P] [US1] Add `adminProviderDetail: '/admin/providers/:providerId'` to `rcfield-fe/src/app/router/route-paths.ts`
- [X] T006 [US1] Register `AdminProviderDetailPage` route in `rcfield-fe/src/app/router/routes.tsx` — add `{ path: routePaths.adminProviderDetail, element: <AdminProviderDetailPage /> }` inside the admin route group
- [X] T007 [US1] Add row `onClick` navigation in `rcfield-fe/src/pages/admin/AdminProvidersPage.tsx` — wrap each table row with `onClick={() => navigate(\`/admin/providers/${provider.id}\`)}` and `className="cursor-pointer"`
- [X] T008 [US1] Create `rcfield-fe/src/pages/admin/AdminProviderDetailPage.tsx` — page reads `providerId` from `useParams`, fires two parallel React Query calls (`getProviderDetail` + `getProviderCafes`), renders: Account Info section, Business Info section, Status Badge, conditional Action Buttons (PENDING→Duyệt+Từ chối / ACTIVE→Tạm khóa / SUSPENDED→Mở khóa / REJECTED→none), Subscription Info section (show "Chưa có gói" if null), Cafes List section (show empty state if no cafes)
- [X] T009 [US1] Wire action buttons in `AdminProviderDetailPage.tsx` — reuse existing approve/reject/suspend/unsuspend API calls from admin subscriptions API; call `queryClient.invalidateQueries` after each action to refresh detail page data

**Checkpoint**: US1 complete — Admin can view full provider detail and perform all status actions from the detail page. No impersonation UI yet.

---

## Phase 4: User Story 2 — Admin Impersonation (Priority: P2)

**Goal**: Admin can enter a provider's workspace via a short-lived JWT, see an orange banner persisting across all provider pages, and exit cleanly back to the admin detail page. Token expiry auto-exits without full logout.

**Independent Test**: Log in as admin → open an ACTIVE provider detail page → click "Truy cập với tư cách Provider" → verify redirect to `/provider/dashboard`, orange banner shows provider name + "Thoát" button → navigate to `/provider/cafes` → verify banner still there → click "Thoát" → verify return to `/admin/providers/:providerId` with admin session intact.

### Implementation for User Story 2

- [X] T010 [US2] Add `impersonateProvider` controller function in `rcfeild-be/src/controllers/provider-onboarding.controller.ts` — verify provider exists and `registration_status === ACTIVE`, sign JWT with `env.jwt.secret` + `expiresIn: '2h'` + payload `{ userId, role: PROVIDER, email, impersonated_by: adminId }`, return `{ token, expires_in: 7200, provider: { id, business_name } }`
- [X] T011 [US2] Register `POST /:id/impersonate` route in `rcfeild-be/src/routes/admin-provider.routes.ts` with `authenticate, authorize(UserRole.ADMIN)` pointing to `impersonateProvider`
- [X] T012 [P] [US2] Add `adminAuth: 'rcfield.admin_auth'` key to `storageKeys` object in `rcfield-fe/src/shared/lib/storage.ts`
- [X] T013 [US2] Extend Zustand auth store in `rcfield-fe/src/features/auth/stores/auth.store.ts` — add `impersonation: { providerUserId: string; providerName: string } | null` to state (default `null`), add actions `startImpersonation(state)` and `exitImpersonation()` that set/clear this field
- [X] T014 [US2] Create `rcfield-fe/src/shared/components/ImpersonationBanner.tsx` — reads `authStore.impersonation`; returns `null` when `null`; renders sticky orange `div` with text "Đang truy cập với tư cách: **{providerName}**" and "Thoát" button; "Thoát" handler: restore `adminAuth` token → `storageKeys.auth`, remove `adminAuth` from localStorage, call `exitImpersonation()`, navigate to `/admin/providers/${providerUserId}`
- [X] T015 [US2] Add `<ImpersonationBanner />` to `rcfield-fe/src/app/layouts/DashboardLayout.tsx` — render it as first child before `<Outlet />` (sticky top ensures visibility while scrolling)
- [X] T016 [US2] Modify `rcfield-fe/src/shared/components/ProviderStatusGuard.tsx` — add `const impersonation = useAuthStore(s => s.impersonation)` at top of component; add early return `if (impersonation) return <>{children}</>` before any `useEffect` or API call
- [X] T017 [US2] Modify axios 401 response interceptor in `rcfield-fe/src/shared/lib/axios.ts` — before the existing logout logic, check `localStorage.getItem(storageKeys.adminAuth)`; if present: restore admin token to `storageKeys.auth`, remove `adminAuth`, call `useAuthStore.getState().exitImpersonation()`, set `window.location.href = '/admin/providers'`, return `Promise.reject(error)`
- [X] T018 [US2] Add "Truy cập với tư cách Provider" button to `rcfield-fe/src/pages/admin/AdminProviderDetailPage.tsx` — show only when `detail.registration_status === 'ACTIVE'`; click handler calls `impersonateProvider(providerId)`, saves current token to `adminAuth`, sets impersonation token to `storageKeys.auth`, calls `startImpersonation({ providerUserId: resp.provider.id, providerName: resp.provider.business_name })`, navigates to `/provider/dashboard`

**Checkpoint**: US2 complete — full impersonation cycle works: start → navigate → banner persists → exit → auto-exit on expiry.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Verify all existing admin provider action endpoints (approve/reject/suspend/unsuspend) still work correctly from the new detail page — no regression in `AdminProvidersPage.tsx` list actions
- [ ] T020 [P] Verify edge case: "Truy cập với tư cách Provider" button does NOT appear on provider detail page when status is PENDING, SUSPENDED, or REJECTED
- [ ] T021 Run integration test checklist from `specs/005-provider-detail-impersonation/quickstart.md` — verify all 8 items pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1 (Phase 3)**: Depends on T001, T002 from Foundational
- **US2 (Phase 4)**: Depends on US1 being complete (button lives on detail page) + Foundational
- **Polish (Phase 5)**: Depends on US1 + US2 complete

### Within Each Phase

- T003 (controller) → T004 (route registration): sequential, same backend feature
- T005 (route path) and T006 (route register): T006 depends on T005
- T007 (row click) and T008 (detail page): can run in parallel (different components)
- T008 (detail page) → T009 (wire actions): T009 depends on T008 existing
- T010 (controller) → T011 (route): sequential
- T012 (storage key) runs in parallel with T013 (store extension)
- T013 (store) → T014 (banner) → T015 (layout): sequential chain
- T016 (guard) and T017 (axios) can run in parallel after T013
- T018 (button in detail page) depends on T013 + T014

### Parallel Opportunities

```bash
# Foundational — run together:
T001: Extend AuthPayload in rcfeild-be/src/types/index.ts
T002: Add API functions to rcfield-fe/src/features/subscriptions/api/index.ts

# US1 backend + frontend path (after T001, T002):
T003+T004: Backend GET /cafes endpoint
T005+T006+T007: Frontend routing + row click (all different files)
T008: Detail page (can run alongside T003)

# US2 foundation (after T001, T013):
T012: storage.ts key
T013: auth.store.ts extensions
T016: ProviderStatusGuard.tsx bypass (depends on T013)
T017: axios.ts 401 handler (depends on T013)
```

---

## Parallel Example: US2 Foundation

```
Start all after T013 completes:
  Task T014: ImpersonationBanner.tsx (reads from store)
  Task T016: ProviderStatusGuard.tsx bypass
  Task T017: axios.ts 401 handler
  Task T012: storage.ts adminAuth key
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001, T002)
2. Complete Phase 3: User Story 1 (T003–T009)
3. **STOP and VALIDATE**: Admin can view provider detail page, action buttons work, cafes list shows
4. Ship US1 — already valuable without impersonation

### Full Feature Delivery

1. Foundational (T001–T002)
2. US1 detail page (T003–T009) → validate
3. US2 impersonation (T010–T018) → validate full cycle
4. Polish (T019–T021)

---

## Notes

- No new DB migrations needed — reads existing tables only
- Backend auth middleware (`requireActiveProvider`) is NOT modified — guard bypass happens client-side in `ProviderStatusGuard`
- Impersonation token uses same `env.jwt.secret` — no new env vars
- After `exitImpersonation()`, `authStore.role` stays as PROVIDER until the admin token is re-initialized from localStorage on next render cycle — ensure store `initialize()` is called after restoring admin token, or reload page
- [P] tasks = different files, no shared write conflict
