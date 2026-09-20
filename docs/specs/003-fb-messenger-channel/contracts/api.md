# API Contracts: Facebook Messenger Channel Integration

**Branch**: `003-fb-messenger-channel` | **Date**: 2026-05-24

---

## Provider Channel Management

### GET /api/v1/channels/facebook/auth-url

Generates the Facebook OAuth URL for the Provider to begin the connection flow.

**Auth**: Bearer JWT, role `PROVIDER`

**Query params**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `cafeId` | string (UUID) | Yes | The cafe to connect |

**Success** `200 OK`:
```json
{
  "url": "https://www.facebook.com/v21.0/dialog/oauth?client_id=...&state=...&scope=..."
}
```

**Errors**:
- `403 FORBIDDEN` — Provider does not own the specified cafe
- `400 BAD_REQUEST` — `cafeId` missing or invalid

---

### GET /api/v1/channels/facebook/callback

Facebook OAuth callback. Facebook redirects here after Provider grants/denies permission. Completes the token exchange, stores the connection, subscribes the Page to webhook events.

**Auth**: Bearer JWT, role `PROVIDER` (Provider must be logged in when redirected back)

**Query params**:

| Param | Type | Description |
|-------|------|-------------|
| `code` | string | Authorization code from Facebook |
| `state` | string | base64url-encoded `{cafeId, nonce}` |
| `error` | string | Present when Provider cancelled/denied |

**On success**: Redirect to `/settings/channels?status=connected`  
**On user cancel**: Redirect to `/settings/channels?status=cancelled`  
**On error**: Redirect to `/settings/channels?status=error&reason=<code>`

**Side effects on success**:
1. Exchanges `code` → short-lived user token → long-lived user token → Page Access Token
2. Inserts (or upserts) `cafe_channels` row with encrypted token
3. Calls `POST /{pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks`
4. Consumes Redis nonce (prevents replay)

**Errors** (returned as redirect query params):
- `state_invalid` — nonce not found in Redis or expired
- `ownership_denied` — Provider does not own cafe in state
- `facebook_error` — Graph API call failed

---

### GET /api/v1/channels/facebook/status

Returns the current Facebook channel connection status for a cafe.

**Auth**: Bearer JWT, role `PROVIDER`

**Query params**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `cafeId` | string (UUID) | Yes | Target cafe |

**Success** `200 OK` — connected:
```json
{
  "connected": true,
  "pageName": "RC Cafe Hà Nội",
  "pageId": "123456789",
  "connectedAt": "2026-05-24T08:00:00.000Z"
}
```

**Success** `200 OK` — not connected:
```json
{
  "connected": false
}
```

**Errors**:
- `403 FORBIDDEN` — Provider does not own the cafe

---

### DELETE /api/v1/channels/facebook

Disconnects the Facebook Page from the cafe. Soft-deletes the `cafe_channels` record and sets `status = DISCONNECTED`.

**Auth**: Bearer JWT, role `PROVIDER`

**Query params**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `cafeId` | string (UUID) | Yes | Target cafe |

**Success** `200 OK`:
```json
{ "success": true }
```

**Errors**:
- `403 FORBIDDEN` — Provider does not own the cafe
- `404 NOT_FOUND` — No active Facebook channel for this cafe

---

## Facebook Webhook Endpoints

### GET /api/v1/webhook/facebook

Facebook webhook verification handshake. Called once by Facebook when the webhook URL is registered in Meta Developer Console.

**Auth**: None (public)

**Query params** (sent by Facebook):

| Param | Description |
|-------|-------------|
| `hub.mode` | Always `subscribe` |
| `hub.verify_token` | Must match `FB_VERIFY_TOKEN` env var |
| `hub.challenge` | Random string — must be echoed back |

**Success** `200 OK`: Returns `hub.challenge` as plain text body.  
**Failure** `403 Forbidden`: Token mismatch.

---

### POST /api/v1/webhook/facebook

Receives all incoming Messenger events for all connected Pages.

**Auth**: None (public) — verified by `object: "page"` check

**Body**: Facebook webhook payload (see research.md Decision 2 for full structure)

**Response**: Always `200 OK` immediately (within 5 seconds).

**Processing logic** (after 200 response):
1. Validate `body.object === "page"` — ignore otherwise
2. For each `entry` → for each `messaging` event:
   a. Skip if `message.is_echo === true`
   b. Skip if no `message.text` (non-text: sticker, image, voice)
   c. Dedup: `SET facebook:processed:{pageId}:{mid} NX EX 300` — skip if key exists
   d. Lookup `cafe_channels` by `page_id = recipient.id` where `status = CONNECTED`
   e. If no cafe found: log warning, skip
   f. Call `checkGate(cafeId)` — if quota exceeded or disabled: send polite fallback message
   g. Call `chat.service.generateResponse(cafeId, message.text, history=[])` 
   h. Format response via `FbMessengerFormatter.format(chatResponse)`
   i. Send via `POST /me/messages?access_token={decrypted_page_token}`

---

## Internal Types

```typescript
// Response shape from GET /api/v1/channels/facebook/status
interface FbChannelStatusResponse {
  connected:   boolean;
  pageName?:   string;
  pageId?:     string;
  connectedAt?: string; // ISO 8601
}

// Response from GET /api/v1/channels/facebook/auth-url
interface FbAuthUrlResponse {
  url: string;
}

// Formatted message for FB Send API
interface FbFormattedMessage {
  text:         string;          // stripped markdown, ≤ 2000 chars
  quickReplies: FbQuickReply[];  // max 5 items
}

interface FbQuickReply {
  content_type: 'text';
  title:        string; // ≤ 20 chars
  payload:      string;
}
```
