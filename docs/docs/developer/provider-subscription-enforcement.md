# Provider Subscription Enforcement Guide

Mọi tính năng dành cho Provider phải được ràng buộc bởi gói đăng ký (subscription plan) và trạng thái tài khoản. Tài liệu này là nguồn sự thật duy nhất cho việc đó.

> **Đọc tài liệu này trước khi implement bất kỳ endpoint nào có role PROVIDER.**

---

## 1. Hai lớp ràng buộc

Có hai lớp kiểm tra độc lập, luôn phải áp dụng cùng nhau:

| Lớp | Kiểm tra gì | Enforced ở đâu |
|-----|-------------|----------------|
| **Account status** | Provider có bị suspend không | Middleware `requireActiveProvider` — đã tự động chạy trên mọi route PROVIDER |
| **Subscription status + quota** | Gói còn hạn không, giới hạn có bị vượt không | **Service layer** — từng tính năng phải tự gọi |

`requireActiveProvider` chỉ block `SUSPENDED`. **GRACE_PERIOD và EXPIRED không bị block tự động** — mỗi write operation phải tự kiểm tra.

---

## 2. Ma trận trạng thái — tính năng nào được phép

| Subscription Status | Xem dashboard | Tạo booking mới | Booking đang chạy | Tạo chi nhánh | Kết nối kênh | AI chat | Tạo staff |
|---------------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `TRIAL`             | ✅ | ✅ | ✅ | ✅ (giới hạn) | ✅ (giới hạn) | ✅ (giới hạn) | ✅ |
| `ACTIVE`            | ✅ | ✅ | ✅ | ✅ (giới hạn) | ✅ (giới hạn) | ✅ (giới hạn) | ✅ |
| `GRACE_PERIOD`      | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `EXPIRED`           | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `SUSPENDED` (account) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Nguyên tắc**: Đọc dữ liệu (GET) luôn được phép với mọi trạng thái subscription. Ghi dữ liệu (POST/PATCH/DELETE) cần kiểm tra.

---

## 3. Các guard đã có sẵn

### 3.1 `requireActiveProvider` middleware
**File**: `rcfeild-be/src/middlewares/auth.middleware.ts`

Tự động chạy nếu route có `authorize(UserRole.PROVIDER)`. Trả về `403 ACCOUNT_SUSPENDED` nếu `registration_status = SUSPENDED`.

```typescript
// routes/my-feature.routes.ts — middleware tự động chạy
router.use(authenticate, authorize(UserRole.PROVIDER), requireActiveProvider);
```

### 3.2 `checkBranchQuota(providerId)`
**File**: `rcfeild-be/src/services/subscription.service.ts`

Kiểm tra số chi nhánh hiện tại so với `plan.branch_limit`. Throw `403 PLAN_LIMIT_EXCEEDED` nếu đã đạt giới hạn.

```typescript
await checkBranchQuota(providerId);
// sau đó mới INSERT cafe
```

**Trạng thái**: Đã implement trong subscription.service, **chưa được gọi** vì cafe service chưa tồn tại.

### 3.3 `checkChannelQuota(providerId)`
**File**: `rcfeild-be/src/services/subscription.service.ts`

Kiểm tra số kênh CONNECTED so với `plan.channel_limit`. Đã được gọi trong `fb-channel.service.ts → handleOAuthCallback`.

### 3.4 `incrementAIQuota(providerId)`
**File**: `rcfeild-be/src/services/subscription.service.ts`

Atomic UPDATE tăng `ai_messages_used` lên 1. Fail nếu đã đạt quota. Đã được gọi trong `fb-webhook.controller.ts`.

---

## 4. Pattern chuẩn cho tính năng mới

Mỗi khi implement một write operation cho provider, hỏi 3 câu:

```
1. Có bị block bởi GRACE_PERIOD / EXPIRED không?
   → Nếu CÓ: gọi assertSubscriptionActive(providerId)

2. Có giới hạn số lượng theo gói không?
   → Nếu CÓ: gọi check___Quota(providerId)

3. Có tiêu thụ AI quota không?
   → Nếu CÓ: gọi incrementAIQuota(providerId)
```

### Helper `assertSubscriptionActive`

Thêm function này vào `subscription.service.ts` khi cần dùng lần đầu:

```typescript
// rcfeild-be/src/services/subscription.service.ts

/**
 * Throw 403 nếu subscription không phải TRIAL hoặc ACTIVE.
 * Dùng cho mọi write operation bị block khi grace/expired.
 */
export async function assertSubscriptionActive(providerId: string): Promise<void> {
  const sub = await getActive(providerId);
  if (!sub) {
    throw new AppError('Không có gói đăng ký đang hoạt động', 403, 'NO_ACTIVE_SUBSCRIPTION');
  }
  if (sub.status === SubscriptionStatus.GRACE_PERIOD) {
    throw new AppError(
      'Gói đăng ký đang trong thời gian gia hạn — vui lòng thanh toán để tiếp tục',
      403,
      'SUBSCRIPTION_GRACE_PERIOD',
    );
  }
  if (sub.status === SubscriptionStatus.EXPIRED) {
    throw new AppError(
      'Gói đăng ký đã hết hạn — vui lòng gia hạn để tiếp tục sử dụng',
      403,
      'SUBSCRIPTION_EXPIRED',
    );
  }
}
```

### Ví dụ đầy đủ — tạo booking mới

```typescript
// booking.service.ts
export async function createBooking(providerId: string, body: CreateBookingBody) {
  // Lớp 1: subscription status (block grace/expired)
  await assertSubscriptionActive(providerId);

  // Lớp 2: quota check nếu có
  // (booking không có giới hạn số lượng theo gói hiện tại)

  // Business logic bình thường
  const booking = repo.create({ providerId, ...body });
  return repo.save(booking);
}
```

### Ví dụ — tạo chi nhánh

```typescript
// cafe.service.ts
export async function createCafe(providerId: string, body: CreateCafeBody) {
  await assertSubscriptionActive(providerId); // block grace/expired
  await checkBranchQuota(providerId);         // block nếu đạt giới hạn gói
  
  const cafe = repo.create({ providerId, ...body });
  return repo.save(cafe);
}
```

### Ví dụ — tạo staff

```typescript
// staff.service.ts
export async function createStaff(providerId: string, body: CreateStaffBody) {
  await assertSubscriptionActive(providerId); // block grace/expired
  // Không có staff limit trong plans hiện tại → không cần quota check

  const staff = repo.create({ ...body });
  return repo.save(staff);
}
```

---

## 5. Checklist khi implement tính năng provider mới

Copy và điền vào PR description:

```
## Subscription Enforcement Checklist

- [ ] Route có `requireActiveProvider` middleware
- [ ] Xác nhận: tính năng này có bị block khi GRACE_PERIOD/EXPIRED không?
      → [ ] Có — đã gọi `assertSubscriptionActive(providerId)`
      → [ ] Không — lý do: _______________
- [ ] Xác nhận: có giới hạn số lượng theo gói không?
      → [ ] Có — đã gọi check quota tương ứng
      → [ ] Không — lý do: _______________
- [ ] Xác nhận: có tiêu thụ AI quota không?
      → [ ] Có — đã gọi `incrementAIQuota(providerId)`
      → [ ] Không — lý do: _______________
```

---

## 6. Map tính năng sắp tới

Danh sách các tính năng provider dự kiến và yêu cầu enforcement tương ứng:

| Tính năng | assertActive | Quota guard | Ghi chú |
|-----------|:---:|:---:|---------|
| Tạo cafe/chi nhánh | ✅ | `checkBranchQuota` | Đã có guard, chưa gọi |
| Sửa/xoá cafe | ❌ | — | Không block |
| Tạo booking (staff walk-in) | ✅ | — | Block grace/expired |
| Sửa giờ / cancel booking | ❌ | — | Cho phép trong grace |
| Tạo vehicle | ✅ | — | Block grace/expired |
| Sửa/xoá vehicle | ❌ | — | Không block |
| Tạo menu item | ✅ | — | Block grace/expired |
| Tạo package | ✅ | — | Block grace/expired |
| Tạo promotion | ✅ | — | Block grace/expired |
| Tạo staff | ✅ | — | Không có staff limit hiện tại |
| Kết nối kênh FB/Zalo | ✅ | `checkChannelQuota` | Đã implemented |
| AI chat message | — | `incrementAIQuota` | Không cần assertActive (webhook) |
| Xem báo cáo doanh thu | ❌ | — | Read-only, không block |
| Xem lịch sử booking | ❌ | — | Read-only, không block |

> **Cột `assertActive`**: ✅ = gọi `assertSubscriptionActive` trước khi INSERT/UPDATE. ❌ = không cần (read-only hoặc tính năng được phép trong mọi trạng thái).

---

## 7. Lấy `providerId` từ request

`providerId` là `req.user.userId` sau khi đã qua `authenticate` middleware.

```typescript
// controller
const providerId = req.user!.userId;
await assertSubscriptionActive(providerId);
```

Nếu endpoint có thể được gọi bởi cả PROVIDER lẫn STAFF, dùng logic sau:

```typescript
// Staff thao tác nhân danh provider của cafe họ thuộc về
const cafe = await cafeRepo.findOne({ where: { id: cafeId } });
const providerId = req.user!.role === UserRole.PROVIDER
  ? req.user!.userId
  : cafe!.providerId;

await assertSubscriptionActive(providerId);
```

---

## 8. Error codes cần biết

| Code | HTTP | Nghĩa |
|------|------|-------|
| `NO_ACTIVE_SUBSCRIPTION` | 403 | Provider chưa được duyệt hoặc không có sub nào |
| `SUBSCRIPTION_GRACE_PERIOD` | 403 | Sub đang trong 7 ngày gia hạn |
| `SUBSCRIPTION_EXPIRED` | 403 | Sub đã hết hạn hoàn toàn |
| `PLAN_LIMIT_EXCEEDED` | 403 | Đạt giới hạn số lượng của gói (branch/channel) |
| `AI_QUOTA_EXCEEDED` | 429 | Đã dùng hết quota AI messages tháng này |
| `ACCOUNT_SUSPENDED` | 403 | Account bị admin tạm khóa |

---

## 9. Những lỗi thường gặp

**❌ Sai — bỏ qua subscription check:**
```typescript
// KHÔNG làm vậy
export async function createBooking(providerId: string, body: any) {
  return repo.save(repo.create({ providerId, ...body }));
}
```

**❌ Sai — chỉ check quota mà không check subscription status:**
```typescript
// KHÔNG làm vậy — provider đang EXPIRED vẫn tạo được booking
await checkBranchQuota(providerId);
const booking = repo.create(...);
```

**✅ Đúng — check status trước, quota sau:**
```typescript
await assertSubscriptionActive(providerId); // status trước
await checkBranchQuota(providerId);         // quota sau
const cafe = repo.create(...);
```

**❌ Sai — kiểm tra role mà quên dùng `requireActiveProvider` trong route:**
```typescript
// authorize(PROVIDER) đã bật nhưng thiếu requireActiveProvider
router.use(authenticate, authorize(UserRole.PROVIDER));
// → provider bị SUSPEND vẫn gọi được API
```

**✅ Đúng:**
```typescript
router.use(authenticate, authorize(UserRole.PROVIDER), requireActiveProvider);
```

---

## Tham khảo

- `rcfeild-be/src/services/subscription.service.ts` — tất cả guard functions
- `rcfeild-be/src/middlewares/auth.middleware.ts` — `requireActiveProvider`
- `specs/004-provider-subscription/data-model.md` — subscription state machine
- `docs/diagrams/sequence/sequence-flow-provider-onboarding-subscription.md` — flow diagram đầy đủ

*Cập nhật lần cuối: 2026-05-25*
