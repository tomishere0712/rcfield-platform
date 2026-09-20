# Implementation Plan: Admin Provider Detail & Impersonation

**Branch**: `005-provider-detail-impersonation` | **Date**: 2026-05-28 | **Spec**: [spec.md](spec.md)

## Summary

Implement two features: (1) Admin Provider Detail Page aggregating user account, business profile, subscription, and cafes; (2) Impersonation — admin generates a short-lived JWT for a provider and temporarily assumes their identity in the UI with an orange banner and graceful exit/auto-exit behavior.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (backend); TypeScript + React 18 (frontend)  
**Primary Dependencies**: Express.js, TypeORM, jsonwebtoken (backend); React Query, Zustand, Axios, React Router v6 (frontend)  
**Storage**: PostgreSQL — no new tables; reads from `users`, `provider_profiles`, `provider_subscriptions`, `subscription_plans`, `cafes`  
**Testing**: Manual (Postman for API, browser for UI)  
**Target Platform**: Linux server (backend); Web (frontend)  
**Project Type**: Web service (REST API) + Web application (React SPA)  
**Performance Goals**: Provider detail page loads within 3 seconds (2 parallel API calls); impersonation initiation under 5 seconds  
**Constraints**: No new DB tables; impersonation state is client-side only (MVP); impersonation token has 2h TTL, no refresh  
**Scale/Scope**: Single tenant — 1 platform admin team, estimated tens to low hundreds of providers

## Constitution Check

- [X] No new database tables for impersonation (client-side only, MVP)
- [X] Reuses existing `env.jwt.secret` — no additional env vars
- [X] Follows existing RBAC middleware pattern (`authenticate`, `authorize`)
- [X] No new infrastructure dependencies
- [X] Impersonation token 2h TTL is terminal — no refresh token path

## Project Structure

### Documentation (this feature)

```text
specs/005-provider-detail-impersonation/
├── plan.md              # This file
├── research.md          # 6 technical decisions
├── spec.md              # Feature specification
├── data-model.md        # Data flow (no new DB tables)
├── quickstart.md        # Implementation order and code patterns
├── contracts/
│   └── api.md           # 2 new endpoints: GET /:id/cafes, POST /:id/impersonate
└── checklists/
    └── requirements.md  # Spec quality checklist (all passed)
```

### Source Code

```text
rcfeild-be/src/
├── controllers/
│   └── provider-onboarding.controller.ts   ← ADD: getProviderCafes, impersonateProvider
├── routes/
│   └── admin-provider.routes.ts            ← ADD: GET /:id/cafes, POST /:id/impersonate
├── types/
│   └── index.ts                            ← MODIFY: AuthPayload + impersonated_by?
└── services/
    └── (no new service files — logic inline in controller)

rcfield-fe/src/
├── features/auth/stores/
│   └── auth.store.ts                       ← MODIFY: add impersonation state + actions
├── shared/lib/
│   ├── storage.ts                          ← MODIFY: add adminAuth key
│   └── axios.ts                            ← MODIFY: 401 handler detects adminAuth
├── shared/components/
│   ├── ProviderStatusGuard.tsx             ← MODIFY: bypass when impersonating
│   └── ImpersonationBanner.tsx             ← NEW: orange banner with exit button
├── app/layouts/
│   └── DashboardLayout.tsx                 ← MODIFY: render ImpersonationBanner
├── app/router/
│   ├── route-paths.ts                      ← MODIFY: add adminProviderDetail path
│   └── routes.tsx                          ← MODIFY: add AdminProviderDetailPage route
├── pages/admin/
│   └── AdminProviderDetailPage.tsx         ← NEW: full detail page
├── pages/admin/
│   └── AdminProvidersPage.tsx              ← MODIFY: add row onClick navigate
└── features/subscriptions/
    └── api/index.ts                        ← MODIFY: add getProviderCafes, impersonateProvider calls
```

**Structure Decision**: Extends existing backend controller/route pair; frontend builds on existing auth store pattern.
