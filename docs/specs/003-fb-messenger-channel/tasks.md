# Tasks: Facebook Messenger Channel Integration

**Input**: Design documents from `specs/003-fb-messenger-channel/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/api.md ✓, quickstart.md ✓

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend existing project config — no new files, only additions to existing files.

- [X] T001 Add Facebook config block and CHANNEL_ENCRYPTION_KEY to `rcfeild-be/src/config/env.ts` (`facebook.appId`, `appSecret`, `verifyToken`, `redirectUri`, `encryptionKey` as Buffer)
- [X] T002 Add FB and CHANNEL_ENCRYPTION_KEY env vars to `rcfeild-be/.github/workflows/ci.yml` (use ci-placeholder values)
- [X] T003 [P] Add `ChannelType` and `ChannelStatus` enums to `rcfeild-be/src/types/index.ts`
- [X] T004 [P] Add `FbChannelQuerySchema` (cafeId validation) to `rcfeild-be/src/validate/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, entity, and shared utilities that BOTH user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Create AES-256-GCM utility `rcfeild-be/src/utils/crypto.ts` with `encryptToken(plaintext, key): string` and `decryptToken(ciphertext, key): string` using Node.js built-in `crypto` — format: base64(iv[12] + authTag[16] + ciphertext)
- [X] T006 Create TypeORM entity `rcfeild-be/src/models/cafe-channel.entity.ts` — table `cafe_channels`, fields: `id`, `cafeId`, `channelType`, `status`, `pageId`, `pageName`, `encryptedPageToken`, `connectedAt`, `createdAt`, `updatedAt`, `deletedAt` (soft delete)
- [X] T007 Create migration `rcfeild-be/src/migrations/1748390400000-FbMessengerChannel.ts` — creates `cafe_channels` table with: unique index on `(cafe_id, channel_type)` where `deleted_at IS NULL`, and index on `page_id` where `deleted_at IS NULL AND status = 'CONNECTED'`
- [X] T008 Register `CafeChannel` entity in `rcfeild-be/src/config/database.ts` entities array (auto-loaded via glob)

**Checkpoint**: `npm run migration:run` succeeds, `cafe_channels` table created in DB.

---

## Phase 3: User Story 1 — Provider kết nối Facebook Page (Priority: P1) 🎯 MVP

**Goal**: Provider nhấn "Kết nối Facebook", hoàn thành OAuth, hệ thống lưu kết nối và hiển thị tên Page.

**Independent Test**: Call `GET /api/v1/channels/facebook/auth-url?cafeId=X` → receive valid FB OAuth URL. Complete mock OAuth callback → `cafe_channels` row inserted, `GET /status` returns `{ connected: true }`. Call `DELETE` → row soft-deleted.

### Backend — US1

- [X] T009 [US1] Create `rcfeild-be/src/services/fb-channel.service.ts` with methods: `buildAuthUrl`, `handleOAuthCallback`, `getStatus`, `disconnect`
- [X] T010 [US1] Create `rcfeild-be/src/controllers/fb-channel.controller.ts` with handlers for `getAuthUrl`, `oauthCallback`, `getChannelStatus`, `disconnectChannel`
- [X] T011 [US1] Create `rcfeild-be/src/routes/fb-channel.routes.ts` — PROVIDER auth on all routes
- [X] T012 [US1] Register `fb-channel.routes.ts` under `/api/v1/channels/facebook` in `rcfeild-be/src/routes/index.ts`

### Frontend — US1

- [X] T013 [P] [US1] Add route paths to `rcfield-fe/src/app/router/route-paths.ts`: `providerChannels: '/provider/channels'`, `facebookOAuthCallback: '/provider/channels/facebook/callback'`
- [X] T014 [P] [US1] Create `rcfield-fe/src/features/channels/types/index.ts` — `FbChannelStatusResponse` and `FbAuthUrlResponse` interfaces
- [X] T015 [P] [US1] Create `rcfield-fe/src/features/channels/api/channel.api.ts` — `getAuthUrl`, `getStatus`, `disconnect` using shared `api` axios instance
- [X] T016 [US1] Create `rcfield-fe/src/features/channels/components/FacebookConnectButton.tsx` — OAuth redirect button with loading state
- [X] T017 [US1] Create `rcfield-fe/src/pages/provider/ChannelSettingsPage.tsx` — connect/disconnect UI with confirm dialog
- [X] T018 [US1] Create `rcfield-fe/src/pages/FacebookOAuthCallbackPage.tsx` — toast + redirect on OAuth return
- [X] T019 [US1] Add routes for `ChannelSettingsPage` and `FacebookOAuthCallbackPage` in `rcfield-fe/src/app/router/routes.tsx`

**Checkpoint**: Provider can connect and disconnect a Facebook Page. `GET /status` reflects correct state.

---

## Phase 4: User Story 2 — AI trả lời tin nhắn Messenger (Priority: P2)

**Goal**: Khách nhắn tin vào FB Page → AI phản hồi trong 5s, đúng KB, đúng định dạng Messenger.

**Independent Test**: Send a POST to `/api/v1/webhook/facebook` with a valid-shaped payload for a connected `page_id` → verify `fbMessengerService.sendMessage` is called with stripped-markdown text. Send duplicate `mid` → only one send. Send non-text attachment → no send.

### Backend — US2

- [X] T020 [US2] Create `rcfeild-be/src/services/fb-messenger.formatter.ts` — `FbMessengerFormatter.format` with `stripMarkdown`, truncate, quickReplies mapping
- [X] T021 [P] [US2] Create `rcfeild-be/src/services/fb-messenger.service.ts` — `sendMessage` and `sendText` via Graph API v21.0
- [X] T022 [US2] Create `rcfeild-be/src/controllers/fb-webhook.controller.ts` — `verifyWebhook` (GET challenge) + `handleWebhookEvent` (POST, dedup, AI pipeline)
- [X] T023 [US2] Create `rcfeild-be/src/routes/fb-webhook.routes.ts` — public GET + POST
- [X] T024 [US2] Register `fb-webhook.routes.ts` under `/api/v1/webhook/facebook` in `rcfeild-be/src/routes/index.ts`

**Checkpoint**: Webhook receives message for a connected page → AI reply sent. Duplicate mid → only one reply. Non-text → no reply. Quota exceeded → fallback reply.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T025 [P] Add `FB_APP_ID`, `FB_APP_SECRET`, `FB_VERIFY_TOKEN`, `FB_REDIRECT_URI`, `CHANNEL_ENCRYPTION_KEY` to `rcfeild-be/.env.example` with placeholder values and comments explaining each
- [X] T026 [P] Add `FbFormattedMessage` and `FbQuickReply` types to `rcfeild-be/src/types/index.ts`
- [ ] T027 Run quickstart.md testing checklist manually: verify all 16 test scenarios pass (US1 + US2 sections)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — no dependency on US2
- **US2 (Phase 4)**: Depends on Foundational — no dependency on US1 (shares entity/crypto, but US2 doesn't call US1 services)
- **Polish (Phase 5)**: Depends on US1 + US2 completion

### User Story Dependencies

- **US1**: Uses `CafeChannel` entity, `encryptToken/decryptToken`, `env.facebook.*`, Redis
- **US2**: Uses `CafeChannel` entity (read), `decryptToken`, `chat.service.generateResponse` (existing), `checkGate` (existing), `incrementQuota` (existing)
- US1 and US2 **can be implemented in parallel** once Foundational is complete

### Within Each User Story

- Backend service → controller → routes → register in index.ts (sequential)
- Frontend types → api → components → pages → routes (sequential within FE)
- Backend and frontend tasks within US1 **can run in parallel** (different codebases)

### Parallel Opportunities

```
Phase 1: T001 | T002 | T003 | T004  ← all parallel (different files)

Phase 2: T005 | T006  ← parallel (different files)
         T007         ← depends on T006 (migration uses entity fields)
         T008         ← depends on T006 (register entity)

Phase 3 (US1 backend): T009 → T010 → T011 → T012  ← sequential
Phase 3 (US1 frontend): T013 | T014 | T015  ← parallel
                         T016 → T017 → T018 → T019  ← sequential
                         T013+T014+T015 parallel with T009-T012

Phase 4 (US2 backend): T020 | T021  ← parallel (different files)
                        T022 → T023 → T024  ← sequential
```

---

## Implementation Strategy

### MVP (User Story 1 Only — Provider connect flow)

1. Complete Phase 1: Setup (env, CI, enums, validation)
2. Complete Phase 2: Foundational (migration, entity, crypto utility)
3. Complete Phase 3: US1 (OAuth flow, status, disconnect + frontend)
4. **VALIDATE**: Provider can connect/disconnect FB Page end-to-end
5. Test: `GET /auth-url` → valid URL, callback → DB row, status endpoint, disconnect

### Full Feature (US1 + US2)

1. After MVP validated, implement Phase 4: US2 (webhook, formatter, messenger service)
2. Test: send message to connected Page → AI replies in Messenger
3. Complete Phase 5: Polish

### Parallel Team Strategy

With 2 developers after Phase 2 complete:
- Dev A: US1 (Provider connect flow — backend + frontend)
- Dev B: US2 (Webhook + AI reply pipeline — backend only)

---

## Notes

- `[P]` tasks = different files, no blocking dependencies — safe to run in parallel
- US2 reuses `chat.service.generateResponse`, `checkGate`, `incrementQuota` — these already exist and are not modified
- The webhook endpoint is **public** (no JWT auth) — FB does not send auth headers
- `CHANNEL_ENCRYPTION_KEY` for CI: use `"0000000000000000000000000000000000000000000000000000000000000001"` (64 hex chars = valid 32-byte key)
- After implementing T007, run `npm run migration:generate` and verify the migration matches `data-model.md` before running it
