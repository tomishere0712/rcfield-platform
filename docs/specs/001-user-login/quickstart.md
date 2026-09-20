# Quickstart: Implementing User Login

**Feature**: 001-user-login | **Date**: 2026-05-14

## Prerequisites

- Docker running: `docker compose up -d` (PostgreSQL + Redis)
- Migrations applied: `npm run migration:run` (users + refresh_tokens tables already exist)
- `.env` has: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_CLIENT_ID`

## New dependency

```bash
cd rcfeild-be
npm install google-auth-library
npm install --save-dev @types/node  # for crypto.randomBytes (already likely installed)
```

Add to `.env` and `.env.example`:
```
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

## Implementation order

### 1. TypeORM entities

Create `src/models/user.model.ts` and `src/models/refresh-token.model.ts` mapping to existing tables. Add them to `src/config/database.ts` entities array.

### 2. Auth service

Create `src/services/auth.service.ts` with methods:
- `loginWithPassword(email, password)` → `{ access_token, refresh_token, user }`
- `loginWithGoogle(idToken)` → `{ access_token, refresh_token, user }`
- `refreshTokens(refreshToken)` → `{ access_token, refresh_token }`
- `logout(userId, refreshToken)` → void

Helper methods (private):
- `issueTokenPair(user)` — generates JWT + random refresh token, stores SHA-256 hash
- `revokeAll(userId)` — sets `revoked_at` on all active refresh tokens for user

### 3. Auth controller

Create `src/controllers/auth.controller.ts`:
- Parse and validate request body with Zod schemas
- Call service methods
- Return standardized responses

### 4. Auth routes

Create `src/routes/auth.routes.ts`:
```typescript
router.post('/login',   authController.login);
router.post('/google',  authController.googleLogin);
router.post('/refresh', authController.refresh);
router.post('/logout',  authenticate, authController.logout);
```

Mount in `src/routes/index.ts`:
```typescript
router.use('/auth', authRouter);
```

### 5. Rate limiting middleware

In `src/routes/auth.routes.ts`, apply per-IP rate limiting to all auth routes:
```typescript
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
router.use(authLimiter);
```

Per-account brute-force logic lives inside `auth.service.ts` using `redis.incr()` + `redis.expire()`.

### 6. Integration tests

Create `src/__tests__/routes/auth.test.ts` covering all acceptance scenarios from `spec.md`.
Run: `npm test -- auth`

## Key implementation details

**Issuing tokens**:
```typescript
// Access token
const accessToken = jwt.sign(
  { sub: user.id, role: user.role },
  env.JWT_SECRET,
  { expiresIn: '1h' }
);

// Refresh token (opaque)
const rawToken = crypto.randomBytes(32).toString('hex');
const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
// Store tokenHash in DB, return rawToken to client
```

**Brute-force check** (in auth.service.ts, before bcrypt):
```typescript
const key = `auth:failed:${email}`;
const count = await redis.get(key);
if (Number(count) >= 5) throw new AppError('ACCOUNT_LOCKED', 403);
```

**On failed password**:
```typescript
await redis.incr(key);
await redis.expire(key, 900);
throw new AppError('INVALID_CREDENTIALS', 401);
```

**On successful login**:
```typescript
await redis.del(key); // reset counter
```

## Verification

After implementing:
1. `npm test -- auth` — all tests pass
2. Manual smoke test:
   - `POST /api/v1/auth/login` with valid credentials → 200 + tokens
   - Use access token to call `GET /api/v1/health` — should work
   - `POST /api/v1/auth/logout` → 200
   - `POST /api/v1/auth/refresh` with revoked token → 401
