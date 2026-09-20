# Research: Admin Provider Detail & Impersonation

**Feature**: 005-provider-detail-impersonation  
**Date**: 2026-05-28

---

## Decision 1: Impersonation Token Strategy

**Decision**: Dùng lại `env.jwt.secret` hiện có, thêm optional claim `impersonated_by: adminId` vào JWT payload. Token có `expiresIn: '2h'` và không có refresh token.

**Rationale**:
- Không cần secret key riêng — đơn giản hóa config và không phá vỡ middleware `authenticate` hiện có.
- `impersonated_by` cho phép backend biết đây là token impersonation (có thể dùng cho future audit log).
- `AuthPayload` chỉ cần thêm optional field `impersonated_by?: string`.
- Middleware `authenticate` verify bình thường — token hợp lệ vì dùng cùng secret.
- Không có refresh: token hết hạn sau 2h là terminal — frontend tự restore admin session.

**Alternatives considered**:
- Dùng secret key riêng cho impersonation token → phức tạp hơn, cần thêm env var, không cần thiết ở MVP.
- Lưu impersonation session vào DB (Redis) → thêm infrastructure, không có benefit rõ ràng ở MVP khi không cần revoke.

---

## Decision 2: Client-Side Token Storage Pattern

**Decision**: Khi bắt đầu impersonation:
1. Đọc session hiện tại từ `localStorage[storageKeys.auth]` (hoặc sessionStorage).
2. Save vào `localStorage[storageKeys.adminAuth]` = `"rcfield.admin_auth"` (key mới).
3. Ghi impersonation token vào `localStorage[storageKeys.auth]` (overwrite).
4. Update `authStore` với `role: 'provider'` + impersonation metadata.

Khi exit:
1. Đọc lại từ `localStorage[storageKeys.adminAuth]`.
2. Restore vào `localStorage[storageKeys.auth]`.
3. Xóa `localStorage[storageKeys.adminAuth]`.
4. Restore authStore về admin state.

**Rationale**:
- Axios interceptor đọc từ `storageKeys.auth` — không cần sửa interceptor cho request path.
- Tách `adminAuth` key riêng tránh collision và cho phép detect "đang impersonate" chỉ bằng cách check key này tồn tại.
- Dùng `localStorage` (không phải sessionStorage) để impersonation token survive page refresh — nhất quán với behavior của admin token thường.

**Alternatives considered**:
- Dùng memory-only (Zustand state, không persist) → token mất khi F5, UX kém.
- Dùng sessionStorage → impersonation token không survive tab F5.

---

## Decision 3: ProviderStatusGuard Bypass

**Decision**: Thêm `impersonation` state vào `authStore`. `ProviderStatusGuard` kiểm tra `useAuthStore(s => s.impersonation)` — nếu non-null thì skip toàn bộ API call và redirect logic, render children trực tiếp.

**Rationale**:
- `ProviderStatusGuard` hiện tại gọi `GET /provider/me` để check `registration_status`. Admin không có `provider_profile` nên API này sẽ trả 404/403, dẫn đến redirect sai.
- Bypass trong Guard component là nơi đúng nhất — không phải ở mỗi page.
- Pattern đơn giản: 1 dòng check ở đầu useEffect.

---

## Decision 4: Auto-Exit khi Impersonation Token Hết Hạn

**Decision**: Modify axios response interceptor. Khi nhận 401 và `localStorage[storageKeys.adminAuth]` tồn tại, thực hiện logic "exit impersonation" thay vì logout hoàn toàn. Navigate về `/admin/providers` (generic, không có :id vì không lưu providerId trong interceptor).

**Rationale**:
- Interceptor hiện tại clear auth và redirect về login — đây là hành vi sai khi đang impersonate.
- Đơn giản nhất: check `storageKeys.adminAuth` trong interceptor. Nếu có → restore admin → navigate admin. Nếu không → logout như cũ.
- Navigate về `/admin/providers` (list) thay vì `/admin/providers/:id` vì interceptor không có context về providerId đang impersonate.

---

## Decision 5: Provider Detail Page — Cafes List

**Decision**: Thêm endpoint `GET /admin/providers/:id/cafes` trả về danh sách cafes của provider đó. Query từ `cafes` table filter theo `provider_id` và `deleted_at IS NULL`.

**Rationale**:
- `getProviderDetail` hiện tại chỉ trả user + profile + subscription — không có cafes.
- Có thể extend query trong `getProviderDetail` nhưng tách endpoint riêng sạch hơn và cho phép pagination sau này.
- Frontend gọi 2 queries song song: `getProviderDetail` + `getProviderCafes`.

---

## Decision 6: ImpersonationBanner Placement

**Decision**: Render `ImpersonationBanner` trong `DashboardLayout` (wrap toàn bộ provider pages). Banner là sticky `div` ở top, không phải position fixed — để không overlap với sidebar/header.

**Rationale**:
- `DashboardLayout` bao gồm tất cả provider + staff + admin pages — banner chỉ render khi `authStore.impersonation` non-null.
- Sticky top đảm bảo banner luôn visible khi scroll.
- Navigate giữa provider pages không unmount `DashboardLayout` → banner không mất.
