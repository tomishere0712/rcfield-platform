# Sequence Flow: Redis Usage

Mô tả toàn bộ các điểm Redis được sử dụng trong RCField backend — gồm 5 use case: brute-force guard (auth), slot lock xe (RENTAL), BYOC capacity counter, Facebook OAuth nonce, và Facebook Messenger session + dedup.

> Dữ liệu được phân tích từ `src/config/redis.ts`, `src/services/auth.service.ts`, `src/services/booking.service.ts`, `src/services/fb-channel.service.ts`, `src/controllers/fb-webhook.controller.ts`.
> See **Reference** at the bottom for legend.

---

## 0. Identifiers

| Field | Value | Notes |
|-------|-------|-------|
| Key — Auth | `auth:failed:{email}` | Counter, TTL từ `BRUTE_FORCE_TTL`, tự xóa sau login thành công |
| Key — Vehicle lock | `slot:lock:vehicle:{vehicleId}:{slotStart.getTime()}` | SET NX EX, TTL = `env.platform.slotLockTtlSeconds` |
| Key — BYOC counter | `slot:byoc:{cafeId}:{slotStart.getTime()}` | INCRBY/DECRBY counter |
| Key — FB nonce | `oauth:fb:nonce:{nonce}` | TTL = `NONCE_TTL`, xóa ngay sau verify |
| Key — FB session | `fb:cafe-session:{pageId}:{psid}` | TTL = 86400s (24h) |
| Key — FB dedup | `facebook:processed:{pageId}:{mid}` | TTL = 300s, SET NX |
| Endpoint | `POST /api/v1/auth/login` | `auth.controller` → `authService.loginWithPassword` |
| Endpoint | `POST /api/v1/bookings` | `booking.controller` → `createBooking` |
| Endpoint | `GET /api/v1/channels/facebook/auth-url` | `fb-channel.service.buildAuthUrl` |
| Endpoint | `GET /api/v1/channels/facebook/callback` | `fb-channel.service.handleCallback` |
| Endpoint | `POST /api/v1/webhook/facebook` | `fb-webhook.controller.handleWebhook` |
| Brute-force max | `BRUTE_FORCE_MAX = 5` lần sai | Sau đó trả 403 ACCOUNT_LOCKED |

---

## 1. Auth — Brute Force Protection

Mỗi lần đăng nhập sai, Redis tăng counter theo email. Đạt ngưỡng 5 lần → block không cần kiểm tra DB. Đăng nhập thành công → xóa counter.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant B as API<br/>(Express / AuthController)
    participant R as Redis
    participant DB as PostgreSQL

    U->>B: POST /api/v1/auth/login { email, password }

    B->>R: GET auth:failed:{email}
    R-->>B: count (số lần sai trước đó)

    alt count >= 5
        Note over B,R: Không cần tra DB — block ngay
        B-->>U: 403 { code: "ACCOUNT_LOCKED" }
    else count < 5 — tra DB
        B->>DB: SELECT * FROM users WHERE email = ?
        DB-->>B: user row

        alt user không tồn tại hoặc password sai
            B->>R: INCR auth:failed:{email}
            B->>R: EXPIRE auth:failed:{email} BRUTE_FORCE_TTL
            B-->>U: 401 { code: "INVALID_CREDENTIALS" }
        else password đúng + is_active = false
            B-->>U: 403 { code: "ACCOUNT_LOCKED" }
        else password đúng + active
            B->>R: DEL auth:failed:{email}
            Note over B,DB: issue JWT access_token (1h) + refresh_token (DB)
            B-->>U: 200 { access_token, refresh_token, user }
        end
    end
```

> **Lưu ý:** Counter tự expire sau `BRUTE_FORCE_TTL` giây → user tự unlock theo thời gian mà không cần admin can thiệp.

---

## 2. Booking — Vehicle Slot Lock (RENTAL mode)

Khi tạo booking RENTAL, mỗi xe được "khóa" trong Redis bằng atomic `SET NX EX`. Nếu xe đã bị lock bởi booking khác cùng slot → từ chối ngay (không cần DB query).

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer
    participant B as API<br/>(Express / BookingController)
    participant R as Redis
    participant DB as PostgreSQL

    U->>B: POST /api/v1/bookings { play_mode: RENTAL, vehicle_ids, slot_start, ... }

    Note over B,DB: Validate cafe, track config, vehicles (DB queries)

    loop Với mỗi vehicleId trong vehicle_ids
        B->>R: SET slot:lock:vehicle:{vehicleId}:{slotStart} {bookingId} EX {ttl} NX
        R-->>B: "OK" | null

        alt null — xe đã bị lock
            B->>R: DEL slot:lock:vehicle:* (rollback các xe đã lock trước đó)
            B-->>U: 409 { code: "VEHICLE_NOT_AVAILABLE" }
        end
    end

    Note over B,R: Tất cả xe lock thành công
    B->>DB: INSERT INTO bookings, booking_vehicles, booking_participants, fnb_orders
    DB-->>B: booking created

    B-->>U: 201 { bookingId, status: "PENDING", paymentUrl }

    Note over R: Nếu booking timeout (payment không xác nhận)<br/>→ booking-timeout.job gọi transition(PAYMENT_TIMEOUT)<br/>→ releaseVehicleLocks() → DEL tất cả key lock
```

> **Key pattern:** `slot:lock:vehicle:{vehicleId}:{slotStart.getTime()}` — TTL bằng `env.platform.slotLockTtlSeconds`.
> Lock bị xóa khi: (1) booking bị CANCELLED/TIMEOUT, (2) TTL tự hết hạn.

---

## 3. Booking — BYOC Capacity Counter

BYOC (Bring Your Own Car) không lock xe cụ thể mà track tổng số người chơi trên một slot của cafe. Dùng INCRBY/DECRBY atomic để tránh race condition.

```mermaid
sequenceDiagram
    autonumber
    participant U as Customer
    participant B as API<br/>(Express / BookingController)
    participant R as Redis
    participant DB as PostgreSQL

    U->>B: POST /api/v1/bookings { play_mode: BYOC, participants, slot_start, ... }

    Note over B,DB: Đọc byocCapacity từ cafe_track_configs (DB)

    B->>R: INCRBY slot:byoc:{cafeId}:{slotStart} {participantCount}
    B->>R: EXPIRE slot:byoc:{cafeId}:{slotStart} {ttl}
    R-->>B: newTotal (sau khi cộng)

    alt newTotal > byocCapacity
        Note over B,R: Rollback ngay — không ghi DB
        B->>R: DECRBY slot:byoc:{cafeId}:{slotStart} {participantCount}
        B-->>U: 409 { code: "SLOT_FULL" }
    else newTotal <= byocCapacity
        B->>DB: INSERT INTO bookings, booking_participants ...
        DB-->>B: booking created
        B-->>U: 201 { bookingId, status: "PENDING" }
    end

    opt Booking bị CANCELLED / NO_SHOW
        Note over B,R: releaseByocSlot() — GET current → SET max(0, current - count)
        B->>R: GET slot:byoc:{cafeId}:{slotStart}
        R-->>B: current
        B->>R: SET slot:byoc:{cafeId}:{slotStart} {max(0, current - count)} EX {ttl}
    end
```

> **Lưu ý:** Khác với vehicle lock, BYOC counter dùng `INCRBY` thay vì `SET NX` vì nhiều participant có thể cùng book vào một slot (miễn tổng ≤ capacity).

---

## 4. Facebook Channel — OAuth Nonce

Khi Provider kết nối Facebook Page, backend tạo một `nonce` ngẫu nhiên lưu vào Redis để verify callback. Bảo vệ chống CSRF trong OAuth flow.

```mermaid
sequenceDiagram
    autonumber
    participant P as Provider
    participant B as API<br/>(Express / FbChannelController)
    participant R as Redis
    participant FB as Facebook<br/>(OAuth)

    P->>B: GET /api/v1/channels/facebook/auth-url
    Note over B: buildAuthUrl() — tạo nonce = randomBytes(16)

    B->>R: SET oauth:fb:nonce:{nonce} { cafeId, userId, returnPath } EX NONCE_TTL
    R-->>B: "OK"

    B-->>P: 302 Redirect → Facebook OAuth URL (state=base64(cafeId+nonce+...))

    P->>FB: Đăng nhập + cấp quyền Pages
    FB-->>P: Redirect → /api/v1/channels/facebook/callback?code=...&state=...

    P->>B: GET /api/v1/channels/facebook/callback?code={code}&state={state}
    Note over B: parseAndVerifyState() — decode state, extract nonce

    B->>R: GET oauth:fb:nonce:{nonce}
    R-->>B: stored JSON | null

    alt null — nonce hết hạn hoặc không tồn tại
        B-->>P: 403 { code: "STATE_MISMATCH" }
    else nonce hợp lệ
        Note over B: Verify cafeId + userId khớp với stored
        B->>R: DEL oauth:fb:nonce:{nonce}
        Note over B,FB: Exchange code → long-lived page token → encrypt → lưu DB
        B-->>P: 302 Redirect → returnPath (kết nối thành công)
    end
```

> **Security:** Nonce là single-use — bị xóa ngay sau verify đầu tiên, không thể replay.

---

## 5. Facebook Messenger — Session + Message Dedup

Mỗi lần user nhắn tin trên Messenger, backend cần biết họ đang hỏi về chi nhánh nào. Redis lưu mapping `psid → cafeId` 24h. Ngoài ra, dedup bằng `message.mid` để tránh xử lý trùng webhook.

```mermaid
sequenceDiagram
    autonumber
    participant FB as Facebook<br/>(Messenger)
    participant B as API<br/>(Express / FbWebhookController)
    participant R as Redis
    participant DB as PostgreSQL
    participant AI as ChatService<br/>(RAG)

    FB->>B: POST /api/v1/webhook/facebook { entry[].messaging[] }
    Note over B: Verify X-Hub-Signature-256

    loop Mỗi messaging event
        Note over B: Bỏ qua is_echo events

        B->>R: SET facebook:processed:{pageId}:{mid} "1" EX 300 NX
        R-->>B: "OK" | null

        alt null — đã xử lý rồi (FB gửi lại)
            Note over B: Skip — return sớm
        else "OK" — message mới
            B->>R: GET fb:cafe-session:{pageId}:{psid}
            R-->>B: cafeId | null

            alt cafeId == null (session chưa có)
                B->>DB: SELECT cafes WHERE page_id = {pageId}
                DB-->>B: danh sách cafes

                alt 1 cafe duy nhất
                    B->>R: SET fb:cafe-session:{pageId}:{psid} {cafeId} EX 86400
                    Note over B,AI: Auto-select, tiếp tục xử lý tin nhắn
                else nhiều cafe
                    B-->>FB: sendCafeSelection() — quick reply buttons
                    Note over B: Return sớm, chờ user chọn chi nhánh
                end
            else User gõ reset keyword ("đổi chi nhánh", ...)
                B->>R: DEL fb:cafe-session:{pageId}:{psid}
                Note over B: cafeId = null → prompt lại
            else cafeId đã có trong session
                Note over B,AI: Dùng cafeId từ Redis
            end

            opt Có cafeId → xử lý tin nhắn
                par
                    B->>FB: markSeen(psid)
                and
                    B->>FB: typingOn(psid)
                end

                B->>AI: route(text) → ragChat(cafeId, text)
                AI-->>B: response

                B-->>FB: sendMessage(psid, formattedResponse)
            end
        end
    end
```

> **Session lifecycle:** 
> - Tạo: lần đầu nhắn tin hoặc sau khi chọn cafe
> - Reset: user gõ "đổi chi nhánh" / "chọn lại chi nhánh" / "change branch" 
> - TTL: tự expire sau 24h idle

---

## 6. Decision Logic Summary

| Tình huống | Redis operation | Kết quả |
|-----------|----------------|---------|
| Login sai lần 1–4 | `INCR auth:failed:{email}` + `EXPIRE` | 401, counter tăng |
| Login sai lần 5+ | `GET` → count ≥ 5 | 403 block, không tra DB |
| Login đúng | `DEL auth:failed:{email}` | Token issued |
| Tạo booking RENTAL, xe available | `SET NX` → "OK" | Lock thành công, tạo booking |
| Tạo booking RENTAL, xe đã bị lock | `SET NX` → null | 409, rollback các lock trước |
| Tạo booking BYOC, còn chỗ | `INCRBY` → ≤ capacity | Tạo booking |
| Tạo booking BYOC, hết chỗ | `INCRBY` → > capacity → `DECRBY` | 409 SLOT_FULL |
| Cancel / NO_SHOW booking | `DEL` vehicle keys hoặc `DECRBY` BYOC | Giải phóng slot |
| Facebook OAuth flow | `SET` nonce → `GET` → `DEL` | Single-use CSRF token |
| Messenger message đầu tiên | `GET session` → null → `SET session` | Session init |
| Messenger message tiếp theo | `GET session` → cafeId | Dùng cache, không tra DB |
| Messenger duplicate webhook | `SET NX dedup` → null | Skip xử lý |
| User reset session | `DEL session` | Prompt chọn chi nhánh lại |

---

## 7. Key Files

### Backend (`rcfeild-be/src`)

| Area | Path | Note |
|------|------|------|
| Config | `src/config/redis.ts` | Export `redis` (ioredis prod / MemoryRedis test) |
| Auth brute-force | `src/services/auth.service.ts` | `loginWithPassword()` lines 119–159 |
| Slot lock | `src/services/booking.service.ts` | `acquireVehicleLock()`, `releaseVehicleLocks()` lines 73–88 |
| BYOC counter | `src/services/booking.service.ts` | `acquireByocSlot()`, `releaseByocSlot()` lines 90–117 |
| FB OAuth nonce | `src/services/fb-channel.service.ts` | `buildAuthUrl()`, `parseAndVerifyState()` |
| FB Webhook | `src/controllers/fb-webhook.controller.ts` | `handleWebhook()` — session + dedup |

---

## 8. Open Questions

1. **Vehicle lock TTL vs booking payment timeout**: `slotLockTtlSeconds` và payment timeout của VNPay cần khớp nhau — nếu TTL Redis ngắn hơn, xe có thể bị unlock trước khi payment confirm.
2. **BYOC counter drift**: Nếu server restart mà Redis mất dữ liệu (non-persistent), counter sẽ reset về 0 → có thể overbooking. Cần đánh giá có cần Redis persistence (`appendonly yes`) không.
3. **`MemoryRedis` thiếu `incrby`/`decrby`**: Class `MemoryRedis` (dùng trong test) không implement `incrby`/`decrby` — BYOC flow trong test environment có thể không cover đầy đủ.

---

## 9. Application Flow Overview

```mermaid
flowchart LR
    subgraph AuthFlow["Auth (login)"]
        direction TB
        A1["POST /auth/login"]
        A2{"count >= 5?"}
        A3["INCR + EXPIRE"]
        A4["DEL counter"]
        A1 --> A2
        A2 -->|"Yes"| A5["403 Block"]
        A2 -->|"No"| A6["Verify password"]
        A6 -->|"Fail"| A3
        A6 -->|"OK"| A4
    end

    subgraph BookingFlow["Booking (slot lock)"]
        direction TB
        B1["POST /bookings"]
        B2{"RENTAL?"}
        B3["SET NX per vehicle"]
        B4{"All OK?"}
        B5["INCRBY BYOC counter"]
        B6{"<= capacity?"}
        B7["INSERT booking → DB"]
        B1 --> B2
        B2 -->|"RENTAL"| B3
        B2 -->|"BYOC"| B5
        B3 --> B4
        B4 -->|"No"| B8["409 + DEL locks"]
        B4 -->|"Yes"| B7
        B5 --> B6
        B6 -->|"No"| B9["409 + DECRBY"]
        B6 -->|"Yes"| B7
    end

    subgraph FbFlow["Facebook Messenger"]
        direction TB
        F1["POST /webhook/facebook"]
        F2["SET NX dedup mid"]
        F3{"New?"}
        F4["GET session cafeId"]
        F5{"Session?"}
        F6["Prompt branch select"]
        F7["ragChat → reply"]
        F1 --> F2
        F2 --> F3
        F3 -->|"No"| F10["Skip"]
        F3 -->|"Yes"| F4
        F4 --> F5
        F5 -->|"Miss"| F6
        F5 -->|"Hit"| F7
        F6 -->|"User picks"| F11["SET session"]
        F11 --> F7
    end

    subgraph FbOAuth["Facebook OAuth"]
        direction TB
        O1["GET /channels/fb/connect"]
        O2["SET nonce EX"]
        O3["→ FB OAuth URL"]
        O4["GET /channels/fb/callback"]
        O5["GET nonce → verify → DEL"]
        O6["Save page token DB"]
        O1 --> O2 --> O3
        O4 --> O5 --> O6
    end

    classDef happy fill:#e6f4ea,stroke:#1e8449,color:#0d3d1f
    classDef error fill:#fde2e2,stroke:#c0392b,color:#7a1f1f
    classDef wait  fill:#fff4d6,stroke:#b8860b,color:#5c3c00

    class A4,B7,F7,O6 happy
    class A5,B8,B9,F10 error
    class A3,B3,B5,F2 wait
```

---

## 10. Class Diagram: Redis Usage

```mermaid
classDiagram
    class LoginPage {
        +submitLogin()
    }
    class CreateBookingPage {
        +reserveSlot()
        +submitBooking()
    }
    class ChannelSettingsPage {
        +connectFacebook()
    }
    class FbWebhookController {
        +handleWebhook()
        +deduplicateMessage()
    }
    class AuthController {
        +login()
    }
    class BookingController {
        +create()
    }
    class FbChannelController {
        +connect()
        +callback()
    }
    class AuthService {
        +loginWithPassword()
        +recordFailedLogin()
        +clearFailedLogin()
    }
    class BookingService {
        +lockRentalVehicleSlot()
        +incrementByocCapacity()
        +releaseSlotLocks()
    }
    class FbChannelService {
        +createOAuthNonce()
        +verifyOAuthNonce()
    }
    class RedisClient {
        +get()
        +set()
        +setNxEx()
        +incrBy()
        +decrBy()
        +del()
    }
    class User
    class Booking
    class BookingVehicle
    class CafeChannel
    class FacebookMessage

    LoginPage --> AuthController
    CreateBookingPage --> BookingController
    ChannelSettingsPage --> FbChannelController
    AuthController --> AuthService
    BookingController --> BookingService
    FbChannelController --> FbChannelService
    FbWebhookController --> RedisClient
    AuthService --> RedisClient
    BookingService --> RedisClient
    FbChannelService --> RedisClient
    AuthService --> User
    BookingService --> Booking
    Booking "1" --> "*" BookingVehicle
    FbChannelService --> CafeChannel
    FbWebhookController --> FacebookMessage
```

---

## Reference

### Source files analyzed (via codegraph)
- `src/config/redis.ts` — cấu hình Redis, `MemoryRedis` fallback cho test
- `src/services/auth.service.ts` — brute-force counter
- `src/services/booking.service.ts` — vehicle lock + BYOC counter
- `src/services/fb-channel.service.ts` — OAuth nonce
- `src/controllers/fb-webhook.controller.ts` — session + message dedup

### Legend
- **B** = `rcfeild-be` Express + TypeScript backend
- **R** = Redis (ioredis in production, `MemoryRedis` in `NODE_ENV=test`)
- **DB** = PostgreSQL via TypeORM
- `-->>` = response / return value
- `-->>`  = async return
- `->>` = request / call
- `NX` = SET only if Not eXists (atomic)
- `EX {n}` = expire in n seconds

---

*Last updated: 2026-06-16 · Based on: codegraph exploration của rcfeild-be codebase*
