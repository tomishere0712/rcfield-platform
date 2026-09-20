# Research: Facebook Messenger Channel Integration

**Branch**: `003-fb-messenger-channel` | **Date**: 2026-05-24

---

## Decision 1: Facebook OAuth for Pages — Token Acquisition

**Decision**: Use standard Facebook OAuth 2.0 with two-step token exchange: short-lived user token → long-lived user token → Page Access Token via `/me/accounts`.

**Rationale**: Page Access Tokens derived from a long-lived user token **never expire** (`expires_at: 0`). This eliminates the need for token refresh logic in MVP. Calling `fb_exchange_token` on a Page token is a no-op — the exchange must happen at the User token level first.

**Flow**:
1. Redirect Provider to FB OAuth dialog with scopes: `pages_show_list,pages_manage_metadata,pages_messaging`
2. FB returns `code` → exchange for short-lived User Access Token via `GET /oauth/access_token`
3. Exchange short-lived User token → long-lived User token via `?grant_type=fb_exchange_token` (valid ~60 days, not stored)
4. Call `GET /me/accounts?access_token={long_lived_user_token}` → returns list of Pages with Page Access Tokens that **never expire**
5. If Provider manages multiple Pages: return list, let them choose one
6. Store chosen Page's: `page_id`, `page_name`, encrypted `page_access_token`
7. Subscribe Page to webhook events: `POST /{pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`

**Alternatives considered**:
- Manual token input (original spec) — rejected because poor UX, error-prone, requires Provider to understand FB Developer Portal
- System-level App Access Token — not applicable; we need user-granted Page permissions

---

## Decision 2: Webhook Architecture — Single Shared Endpoint

**Decision**: One webhook URL (`POST /api/v1/webhook/facebook`) handles all Pages. Route to correct cafe by matching `recipient.id` (= `page_id`) against `cafe_channels` table.

**Rationale**: Facebook's app-level webhook is configured once in the Meta Developer Console and applies to all Pages subscribed to the app. Per-page routing is done in application code via DB lookup.

**Payload key fields**:
```json
{
  "object": "page",
  "entry": [{ "id": "PAGE_ID", "messaging": [{ "sender": { "id": "USER_PSID" }, "recipient": { "id": "PAGE_ID" }, "message": { "mid": "...", "text": "..." } }] }]
}
```

**Multi-entry handling**: `entry` is an array but FB guarantees one event per `messaging` array in practice. Always iterate both arrays for correctness.

**Echo filtering**: Messages with `message.is_echo: true` are the bot's own sent messages — must be filtered and ignored to prevent infinite loops.

**5-second rule**: FB expects HTTP 200 within 5 seconds or retries. Pattern: respond `200` immediately, then process synchronously (AI response is fast enough — target <3s).

---

## Decision 3: Deduplication — Redis Atomic SETNX

**Decision**: `SET facebook:processed:{pageId}:{mid} 1 NX EX 300` (single atomic Redis command).

**Rationale**: `SET NX EX` is atomic — no race condition between SETNX and EXPIRE. TTL of 300s covers FB's retry window (~4 retries over ~5 minutes). Using `mid` (message ID) as the unique key — globally unique per FB.

**Alternatives considered**:
- Separate SETNX + EXPIRE — rejected: race condition if server crashes between two calls
- PostgreSQL `processed_events` table — rejected: unnecessary DB write for ephemeral data; Redis already in stack
- In-memory Map — rejected: lost on server restart

---

## Decision 4: AES-256-GCM Encryption for Page Access Token

**Decision**: Node.js built-in `crypto` module, AES-256-GCM. Concatenate `IV (12 bytes) + AuthTag (16 bytes) + Ciphertext` as a single base64 string in one DB column.

**Rationale**: Single-column storage simplifies schema. GCM provides authenticated encryption — detects tampering via auth tag verification. 96-bit IV is the NIST-recommended size for GCM. Key is 32 bytes (256-bit) from env var `CHANNEL_ENCRYPTION_KEY` (64 hex chars).

**Key generation**: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Schema**: `encrypted_page_token TEXT` — stores base64(iv + tag + ciphertext). Never stored in plain text.

**App Secret handling**: Stored only in env var `FB_APP_SECRET`, never in DB. Used server-side only for token exchange.

---

## Decision 5: OAuth State — CSRF Protection with Redis Nonce

**Decision**: `state` = `base64url(JSON{ cafeId, nonce })`. Nonce stored in Redis `oauth:fb:nonce:{nonce}` TTL 600s. Consumed (deleted) on first use (one-time use).

**Rationale**: Prevents CSRF attacks on the OAuth callback. Redis TTL means expired nonces auto-clean. One-time use prevents replay. Consistent with existing Redis patterns in the codebase.

**Callback route**: `GET /api/v1/channels/facebook/callback?code=xxx&state=xxx [PROVIDER auth]` — validates nonce, verifies Provider owns the cafe, completes token exchange.

---

## Decision 6: Messenger Message Formatting

**Decision**: Channel formatter strips markdown, splits at 2000 chars at word boundary, maps `quickReplies[]` to FB quick_replies format.

**FB quick_replies format**:
```json
{ "content_type": "text", "title": "<= 20 chars", "payload": "QUICK_REPLY_<SLUG>" }
```

**Constraints enforced in `FbMessengerFormatter`**:
- Strip `**bold**`, `# headers`, `` `code` ``, `*italic*` — FB renders plain text only
- Split messages > 2000 chars into multiple sends (split at last space before limit)
- Quick replies: max 5 (conservative, spec-defined), title max 20 chars
- `messaging_type: 'RESPONSE'` required for all replies within 24-hour window

**Alternatives considered**:
- Quick replies max 13 (new FB limit) — keeping spec's limit of 5 for now as it aligns with widget behavior and prevents UI clutter

---

## Decision 7: Page Webhook Subscription After OAuth

**Decision**: Immediately after storing the Page Access Token, call `POST /{pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token={pageToken}`.

**Rationale**: Without this per-page subscription, the app-level webhook receives no events from the Page. This must happen once per connected Page using the Page's own access token.

**On disconnect**: No explicit unsubscribe needed — removing the `cafe_channels` record means webhook events for that `page_id` will find no matching cafe and be silently ignored (graceful degradation).

---

## Environment Variables Added

| Var | Description |
|-----|-------------|
| `FB_APP_ID` | Facebook App ID from Meta Developer Console |
| `FB_APP_SECRET` | Facebook App Secret (server-side only, never in DB) |
| `FB_VERIFY_TOKEN` | Webhook verify token (arbitrary secret, same in Meta Console) |
| `FB_REDIRECT_URI` | OAuth callback URL, e.g. `https://api.rcfield.vn/api/v1/channels/facebook/callback` |
| `CHANNEL_ENCRYPTION_KEY` | 64 hex chars = 32-byte AES-256 key for encrypting Page tokens |
