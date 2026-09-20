# Quickstart: Facebook Messenger Channel Integration

**Branch**: `003-fb-messenger-channel` | **Date**: 2026-05-24

---

## Implementation Order

Build in this sequence — each step is independently testable:

1. **Environment & Config** — add FB env vars, extend `env.ts`
2. **Migration** — create `cafe_channels` table
3. **CafeChannel entity + enums** — TypeORM entity, new enums in `types/index.ts`
4. **Crypto utility** — `src/utils/crypto.ts` encrypt/decrypt with AES-256-GCM
5. **FbChannelService** — OAuth URL generation, token exchange, save/disconnect
6. **FbMessengerFormatter** — strip markdown, split, format quick_replies
7. **FbMessengerService** — send message via Graph API
8. **Webhook handler** — `src/routes/fb-webhook.routes.ts` + controller
9. **Provider channel routes** — `src/routes/fb-channel.routes.ts` + controller
10. **Frontend** — `FbConnectButton`, `ChannelSettingsPage`, OAuth callback page
11. **Wire up** — register routes in `src/routes/index.ts`

---

## Step 1: Environment Variables

Add to `.env` and `env.ts`:

```bash
FB_APP_ID=your_app_id
FB_APP_SECRET=your_app_secret
FB_VERIFY_TOKEN=any_random_secret_you_choose
FB_REDIRECT_URI=http://localhost:3000/api/v1/channels/facebook/callback
CHANNEL_ENCRYPTION_KEY=<64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

`src/config/env.ts` addition:
```typescript
facebook: {
  appId:           process.env.FB_APP_ID ?? '',
  appSecret:       process.env.FB_APP_SECRET ?? '',
  verifyToken:     process.env.FB_VERIFY_TOKEN ?? '',
  redirectUri:     process.env.FB_REDIRECT_URI ?? '',
  encryptionKey:   Buffer.from(process.env.CHANNEL_ENCRYPTION_KEY ?? '0'.repeat(64), 'hex'),
},
```

---

## Step 2: Crypto Utility

`src/utils/crypto.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
```

---

## Step 3: FbChannelService Outline

`src/services/fb-channel.service.ts`:

```typescript
export class FbChannelService {
  // 1. Generate OAuth URL + store nonce in Redis
  async buildAuthUrl(cafeId: string): Promise<string>

  // 2. Handle callback: exchange code, get page token, save, subscribe webhook
  async handleOAuthCallback(code: string, state: string): Promise<void>

  // 3. Get current connection status
  async getStatus(cafeId: string): Promise<FbChannelStatusResponse>

  // 4. Disconnect: soft-delete record
  async disconnect(cafeId: string): Promise<void>
}
```

Key sub-steps in `handleOAuthCallback`:
```typescript
// a. Parse and verify state nonce from Redis
const { cafeId } = await parseAndVerifyState(state);

// b. Exchange code → short-lived user token
const shortToken = await exchangeCodeForUserToken(code);

// c. Short-lived → long-lived user token
const longToken = await exchangeForLongLivedToken(shortToken);

// d. Get pages via /me/accounts
const pages = await fetchUserPages(longToken);
const page = pages[0]; // single-page assumption for MVP; choose first or most relevant

// e. Encrypt and save
const encrypted = encryptToken(page.access_token, env.facebook.encryptionKey);
await cafeChannelRepo.upsert({ cafeId, channelType: 'FACEBOOK_MESSENGER', pageId: page.id, pageName: page.name, encryptedPageToken: encrypted, connectedAt: new Date() });

// f. Subscribe page to webhook
await subscribePageToWebhook(page.id, page.access_token);
```

---

## Step 4: Webhook Handler Outline

`src/controllers/fb-webhook.controller.ts`:

```typescript
// GET /api/v1/webhook/facebook — verification
async verifyWebhook(req, res) {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === env.facebook.verifyToken) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
}

// POST /api/v1/webhook/facebook — events
async handleWebhookEvent(req, res) {
  res.sendStatus(200); // respond immediately

  if (req.body?.object !== 'page') return;

  for (const entry of req.body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) continue;
      if (!event.message?.text) continue; // skip non-text

      const mid = event.message.mid;
      const pageId = entry.id; // = recipient.id
      const psid = event.sender.id;
      const text = event.message.text;

      // dedup
      const isNew = await redis.set(`facebook:processed:${pageId}:${mid}`, '1', 'NX', 'EX', 300);
      if (!isNew) continue;

      // route to cafe
      const channel = await cafeChannelRepo.findOne({ where: { pageId, status: 'CONNECTED' } });
      if (!channel) { logger.warn('FbWebhook', 'unknown page_id', { pageId }); continue; }

      // gate check + generate AI response
      try {
        await checkGate(channel.cafeId);
        const chatResponse = await chatService.generateResponse(channel.cafeId, text, []);
        const pageToken = decryptToken(channel.encryptedPageToken, env.facebook.encryptionKey);
        const formatted = FbMessengerFormatter.format(chatResponse);
        await fbMessengerService.sendMessage(psid, formatted, pageToken);
        await incrementQuota(channel.cafeId);
      } catch (err) {
        if (err instanceof AppError && (err.code === 'AI_DISABLED' || err.code === 'QUOTA_EXCEEDED')) {
          const pageToken = decryptToken(channel.encryptedPageToken, env.facebook.encryptionKey);
          await fbMessengerService.sendText(psid, 'Xin lỗi, dịch vụ hỗ trợ tự động hiện không khả dụng. Vui lòng liên hệ trực tiếp chi nhánh.', pageToken);
        }
        logger.error('FbWebhook', 'processing error', err);
      }
    }
  }
}
```

---

## Step 5: FbMessengerFormatter

`src/services/fb-messenger.formatter.ts`:

```typescript
export class FbMessengerFormatter {
  static format(response: ChatResponse): FbFormattedMessage {
    const clean = this.stripMarkdown(response.answer);
    const text = clean.length > 2000
      ? clean.substring(0, clean.lastIndexOf(' ', 2000))
      : clean;

    const quickReplies = (response.quickReplies ?? [])
      .slice(0, 5)
      .map(title => ({
        content_type: 'text' as const,
        title: title.substring(0, 20),
        payload: `QR_${title.toUpperCase().replace(/\s+/g, '_').substring(0, 900)}`,
      }));

    return { text, quickReplies };
  }

  private static stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
      .replace(/\*(.+?)\*/g, '$1')         // italic
      .replace(/`(.+?)`/g, '$1')           // inline code
      .replace(/#{1,6}\s/g, '')            // headers
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .trim();
  }
}
```

---

## Step 6: Frontend Integration

**New pages/components**:
- `src/features/channels/api/channel.api.ts` — wraps `GET /auth-url`, `GET /status`, `DELETE /channels/facebook`
- `src/features/channels/components/FacebookConnectButton.tsx` — button that fetches OAuth URL and opens it
- `src/pages/provider/ChannelSettingsPage.tsx` — shows current status, connect/disconnect button
- `src/pages/FacebookOAuthCallbackPage.tsx` — empty page; BE redirects here with `?status=connected|cancelled|error`

**New route paths**:
```typescript
// route-paths.ts
providerChannels: '/settings/channels',
facebookOAuthCallback: '/settings/channels/callback',
```

**FacebookConnectButton flow**:
```typescript
const handleConnect = async () => {
  const { url } = await channelApi.getAuthUrl(cafeId);
  window.location.href = url; // full redirect (not popup) for simplicity
};
```

**Callback page**:
```typescript
// Reads ?status from URL params, shows toast, redirects to /settings/channels
const { status } = useSearchParams();
useEffect(() => {
  if (status === 'connected') toast.success('Kết nối Facebook thành công');
  if (status === 'cancelled') toast.info('Kết nối đã bị hủy');
  if (status === 'error') toast.error('Kết nối thất bại, thử lại sau');
  router.navigate(routePaths.providerChannels, { replace: true });
}, [status]);
```

---

## Testing Checklist

**US1 — Provider connects FB Page**:
- [ ] `GET /auth-url?cafeId=X` returns valid FB OAuth URL
- [ ] OAuth callback with valid code → `cafe_channels` row created, status CONNECTED
- [ ] OAuth callback with `error=access_denied` → redirect with `status=cancelled`
- [ ] `GET /status?cafeId=X` returns `{ connected: true, pageName: "..." }`
- [ ] Provider A cannot get auth-url for cafe owned by Provider B
- [ ] `DELETE /channels/facebook?cafeId=X` → row soft-deleted, status DISCONNECTED
- [ ] After disconnect, `GET /status?cafeId=X` returns `{ connected: false }`

**US2 — Customer messages via Messenger, AI replies**:
- [ ] Webhook `GET` verification echoes challenge
- [ ] Webhook `POST` with text message → AI response sent to Messenger within 5s
- [ ] Duplicate mid → only one response sent (dedup working)
- [ ] Non-text message (attachment) → no response, no error
- [ ] Echo message (`is_echo: true`) → ignored, no response
- [ ] Unknown `page_id` → warning logged, no crash
- [ ] Quota exceeded → polite fallback message sent
- [ ] AI disabled → polite fallback message sent
- [ ] Response strips markdown, respects 2000-char limit
- [ ] Quick replies ≤ 5, each title ≤ 20 chars
