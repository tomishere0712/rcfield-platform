# CLAUDE.md — RCField Backend

AI coding guidelines for this project. Read before writing any code.

---

## Controller Convention

Every handler in a controller **must** have a comment indicating the endpoint above it:

```typescript
// POST /api/v1/auth/login
async login(req: Request, res: Response, next: NextFunction) {
  ...
}

// POST /api/v1/auth/logout  [auth]
async logout(req: AuthRequest, res: Response, next: NextFunction) {
  ...
}
```

Format: `// METHOD /api/v1/<path>` — append `[auth]` if the route requires authentication.

---

## Logger Convention

Do not use `console.log`. Use `logger` from `src/config/logger.ts`:

```typescript
logger.auth('login', { email, role })            // auth events
logger.info('Booking', 'created', { id })        // general business events
logger.warn('Seed', 'already exists: x@y.com')  // warnings
logger.error('Redis', 'timeout', err)            // errors
logger.debug('HTTP', 'body', data)               // dev only
```

---

## Validation Convention

All Zod schemas live in `src/validate/index.ts`, grouped by table:

```typescript
// ── users ─────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({ ... });

// ── bookings ──────────────────────────────────────────────────────────────────
export const CreateBookingSchema = z.object({ ... });
```

Controllers import from `'../validate'`. Never define schemas inside a controller.

---

## Enum Convention

All enums live in `src/types/index.ts`. Never define enums inside entities or services.

```typescript
import { BookingStatus, AssetTier } from '../types';
```

---

## Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Entity | PascalCase singular | `Booking`, `Vehicle` |
| Router file | kebab-case | `booking.routes.ts` |
| Controller | kebab-case | `booking.controller.ts` |
| Service | kebab-case | `booking.service.ts` |
| Request body type | PascalCase + Body | `CreateBookingBody` |
| Enum value | SCREAMING_SNAKE_CASE | `BookingStatus.PENDING` |
| DB table | snake_case plural | `bookings`, `refresh_tokens` |
| Foreign key | `entity_id` | `booking_id`, `vehicle_id` |
