# Graph Report - .  (2026-05-17)

## Corpus Check
- 69 files · ~52,513 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 180 nodes · 377 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Booking Entity|Booking Entity]]
- [[_COMMUNITY_auth.test.ts|auth.test.ts]]
- [[_COMMUNITY_app.ts|app.ts]]
- [[_COMMUNITY_API Server (Backend)|API Server (Backend)]]
- [[_COMMUNITY_Backend Schema Index|Backend Schema Index]]
- [[_COMMUNITY_auth.service.ts|auth.service.ts]]
- [[_COMMUNITY_Feature 001 User Login|Feature 001: User Login]]
- [[_COMMUNITY_InitialSchema1747180800000|InitialSchema1747180800000]]
- [[_COMMUNITY_global-teardown.ts|global-teardown.ts]]

## God Nodes (most connected - your core abstractions)
1. `AppError` - 5 edges
2. `createTestUser()` - 4 edges
3. `InitialSchema1747180800000` - 3 edges
4. `requestLogger()` - 3 edges
5. `createTestCafe()` - 3 edges
6. `maskBody()` - 2 edges
7. `authenticate()` - 2 edges
8. `User` - 2 edges
9. `generateToken()` - 2 edges
10. `createTestVehicle()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `auth.test.ts` --integration_tests--> `auth.service.ts`  [EXTRACTED]
   →   _Bridges community 1 → community 5_
- `auth.test.ts` --verifies_acceptance_scenarios_from--> `001-user-login/spec.md`  [EXTRACTED]
   →   _Bridges community 1 → community 6_
- `test helpers/index.ts` --uses_for_direct_inserts--> `AppDataSource`  [EXTRACTED]
   →   _Bridges community 1 → community 2_
- `seed-users.ts` --inserts_seed_rows--> `User Entity`  [EXTRACTED]
   →   _Bridges community 2 → community 5_
- `001-user-login/research.md` --architecture_decisions_for--> `Feature 001: User Login`  [EXTRACTED]
   →   _Bridges community 5 → community 6_

## Communities (10 total, 2 thin omitted)

### Community 0 - "Booking Entity"
Cohesion: 0.10887949260042283
Nodes (44): ADR-002: Express.js Backend Framework, Architecture: Booking & Session, RCField Architecture Overview, Architecture README, Architecture: System Overview, Booking Data Flow Diagram, Sequence Flow: Booking Lifecycle, Booking-Session Data Separation (+36 more)

### Community 1 - "auth.test.ts"
Cohesion: 0.09803921568627451
Nodes (26): auth.controller.ts, authenticate middleware, auth.routes.ts, auth.test.ts, bookings.test.ts, ACCOUNT_LOCKED error code, GOOGLE_AUTH_FAILED error code, INVALID_CREDENTIALS error code (+18 more)

### Community 2 - "app.ts"
Cohesion: 0.11182795698924732
Nodes (21): AppDataSource, app.ts, config/database.ts, config/env.ts, config/logger.ts, config/redis.ts, eslint.config.js, jest.config.ts (+13 more)

### Community 3 - "API Server (Backend)"
Cohesion: 0.18095238095238095
Nodes (21): API Server (Backend), Backend CLAUDE.md — Coding Guidelines, Backend Docker Compose, Backend Logger (src/config/logger.ts), Backend Enums & Types (src/types/index.ts), Backend Zod Schemas (src/validate/index.ts), Cloudinary Photo Storage, Module: Auth (+13 more)

### Community 4 - "Backend Schema Index"
Cohesion: 0.15789473684210525
Nodes (19): Actor: Admin, Actor: Customer, Actor: Provider, Actor: Staff, ADR-001: B2B SaaS Chain Branch Model, B2B SaaS Chain Model, Backend README, Backend Schema Index (+11 more)

### Community 5 - "auth.service.ts"
Cohesion: 0.1895424836601307
Nodes (10): AppError class, AuthProvider enum, auth.service.ts, RefreshToken Entity, User Entity, OAuth2Client (google-auth-library), 001-user-login/data-model.md, 001-user-login/research.md (+2 more)

### Community 6 - "Feature 001: User Login"
Cohesion: 0.3333333333333333
Nodes (7): CLAUDE.md, Feature 001: User Login, 001-user-login/plan.md, 001-user-login/checklists/requirements.md, 001-user-login/spec.md, README.md, SETUP.md

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `auth.test.ts` to `auth.service.ts`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Should `Booking Entity` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `auth.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._