# Implementation Plan: User Login

**Branch**: `main` | **Date**: 2026-05-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-user-login/spec.md`

## Summary

Implement a complete authentication system for RCField: email/password login with bcrypt verification, Google OAuth2 ID-token verification, JWT access token (1h) + refresh token (7d) pair, refresh token rotation with theft detection, per-account brute-force lockout via Redis, and logout that revokes the refresh token. The `users` and `refresh_tokens` tables already exist in the schema; no new DB migration is required for MVP.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22+
**Primary Dependencies**: Express.js, TypeORM (PostgreSQL), ioredis (Redis), jsonwebtoken, bcrypt, zod — all already installed. New: `google-auth-library` for Google ID token verification.
**Storage**: PostgreSQL (`users`, `refresh_tokens` tables) + Redis (brute-force counters + lockout flags)
**Testing**: Jest + Supertest against real test DB (`rcfeild_test`)
**Target Platform**: Linux server (Docker Compose)
**Project Type**: web-service (REST API)
**Performance Goals**: Login < 3s p95, Google OAuth < 5s (including network round-trip to Google)
**Constraints**: 5 failed attempts per account in 15 min → 15-min Redis lockout; SHA-256 hash of refresh token stored in DB (raw token never persisted)
**Scale/Scope**: MVP — single active session per user per device; no multi-session management

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Snapshot-First Pricing | ✅ N/A | Login does not touch financial calculations |
| II. State Machine Gate | ✅ N/A | Auth has no booking state transitions |
| III. Evidence-Based Handover | ✅ N/A | No asset handover involved |
| IV. Payment Component Isolation | ✅ N/A | No payment components created |
| V. Test-First (Financial/State) | ✅ N/A | Auth logic is not financial/state logic; integration tests are written alongside code |
| VI. RBAC Enforcement | ✅ Required | Login and refresh are public endpoints; logout MUST use `authenticate` middleware. Role is returned in login response so client can route. |

**Post-Phase 1 re-check**: All routes follow the pattern — public routes skip `authenticate`, logout applies `authenticate` before handler. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-login/
├── plan.md              ← This file
├── research.md          ← Phase 0: decisions and rationale
├── data-model.md        ← Phase 1: TypeORM entities
├── contracts/
│   └── auth.md          ← Phase 1: API endpoint contracts
├── quickstart.md        ← Phase 1: how to start implementing
└── tasks.md             ← Phase 2 (/speckit-tasks — not yet created)
```

### Source Code (backend `rcfeild-be/`)

```text
src/
├── models/
│   ├── user.model.ts          ← User entity (already needed by existing auth middleware)
│   └── refresh-token.model.ts ← RefreshToken entity
├── services/
│   └── auth.service.ts        ← Business logic: login, googleAuth, refresh, logout
├── controllers/
│   └── auth.controller.ts     ← Request parsing, Zod validation, calls service
├── routes/
│   └── auth.routes.ts         ← Mount POST /login, /google, /refresh; authenticate + POST /logout
└── __tests__/routes/
    └── auth.test.ts           ← Integration tests (all 4 stories + edge cases)
```

**Structure Decision**: Single-project backend (Option 1). Auth is one domain — 1 route file, 1 controller, 1 service. No sub-folder needed.

## Complexity Tracking

> No constitution violations — section left empty per instructions.
