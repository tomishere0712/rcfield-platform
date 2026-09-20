# Data Model: Thanh toán chuyển khoản theo từng chi nhánh

**Feature**: `019-cafe-bank-payment` · **Date**: 2026-08-11 · **Phase**: 1

Hai bảng mới, một cột mới trên bảng có sẵn. Không sửa `bookings`, không sửa `cafes`.

---

## Bảng mới 1 — `cafe_payment_settings`

Cấu hình nhận tiền của một chi nhánh. Một hàng sống mỗi chi nhánh.

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `cafe_id` | uuid | NOT NULL, FK → `cafes(id)` | unique khi chưa xoá |
| `method` | varchar(20) | NOT NULL, default `'VNPAY'` | `VNPAY \| BANK_TRANSFER` |
| `bank_code` | varchar(20) | NULL | mã ngân hàng, vd `VCB` |
| `bank_bin` | varchar(10) | NULL | BIN Napas, dùng để dựng chuỗi VietQR |
| `account_number` | varchar(32) | NULL | |
| `account_name` | varchar(160) | NULL | tên chủ tài khoản do chủ quán tự khai |
| `is_verified` | boolean | NOT NULL, default `false` | FR-007 |
| `verified_at` | timestamptz | NULL | |
| `verified_by` | uuid | NULL, FK → `users(id)` | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |
| `deleted_at` | timestamptz | NULL | soft delete |

**Ràng buộc**

```sql
CHECK (method IN ('VNPAY','BANK_TRANSFER'))
CHECK (method <> 'BANK_TRANSFER' OR (bank_bin IS NOT NULL
       AND account_number IS NOT NULL AND account_name IS NOT NULL))
CHECK (is_verified = false OR verified_at IS NOT NULL)
CREATE UNIQUE INDEX ux_cafe_payment_settings_cafe
  ON cafe_payment_settings (cafe_id) WHERE deleted_at IS NULL;
```

**Quy tắc nghiệp vụ**

- FR-008 — mỗi khi `bank_bin` hoặc `account_number` đổi, service **phải** đặt lại `is_verified = false`, `verified_at = NULL`. Thực hiện trong service chứ không bằng trigger, để còn ghi được audit.
- FR-007 — chỉ `method = 'BANK_TRANSFER'` **và** `is_verified = true` mới bật chuyển khoản. Mọi tổ hợp khác rơi về VNPay.

---

## Bảng mới 2 — `bank_transactions`

Sổ đối soát: mọi khoản tiền hệ thống được báo là đã về, khớp hay không khớp.

| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | PK | |
| `gateway` | varchar(20) | NOT NULL | `SEPAY \| SANDBOX` — nguồn gửi thông báo |
| `external_id` | varchar(100) | NOT NULL | mã giao dịch **do ngân hàng cấp** — khoá chống trùng |
| `cafe_id` | uuid | NULL, FK → `cafes(id)` | NULL khi không nhận ra tài khoản (US3 kịch bản 7) |
| `payment_transaction_id` | uuid | NULL, FK → `payment_transactions(id)` | chỉ có khi đã khớp |
| `account_number` | varchar(32) | NOT NULL | tài khoản nhận, lấy từ payload |
| `amount` | numeric(15,2) | NOT NULL, `CHECK (amount > 0)` | |
| `content` | text | NOT NULL | nội dung chuyển khoản nguyên văn |
| `ref_code` | varchar(16) | NULL | mã tham chiếu rút được từ `content` |
| `transaction_date` | timestamptz | NOT NULL | thời điểm ngân hàng ghi nhận |
| `match_status` | varchar(20) | NOT NULL | `MATCHED \| NEEDS_REVIEW \| IGNORED` |
| `match_reason` | varchar(32) | NULL | xem bảng lý do bên dưới |
| `raw_payload` | jsonb | NOT NULL | toàn văn thông báo (FR-034) |
| `resolved_by` | uuid | NULL, FK → `users(id)` | ai xử lý tay |
| `resolved_at` | timestamptz | NULL | |
| `resolution_note` | text | NULL | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |
| `deleted_at` | timestamptz | NULL | |

**Ràng buộc**

```sql
CHECK (match_status IN ('MATCHED','NEEDS_REVIEW','IGNORED'))
CHECK (match_status <> 'MATCHED' OR payment_transaction_id IS NOT NULL)

-- Chống trùng (FR-019, SC-003)
CREATE UNIQUE INDEX ux_bank_transactions_external
  ON bank_transactions (gateway, external_id) WHERE deleted_at IS NULL;

-- Hàng đợi của nhân viên (FR-025a)
CREATE INDEX ix_bank_transactions_review
  ON bank_transactions (cafe_id, created_at DESC)
  WHERE deleted_at IS NULL AND match_status = 'NEEDS_REVIEW';

-- Sổ đầy đủ của chủ quán (FR-025)
CREATE INDEX ix_bank_transactions_cafe
  ON bank_transactions (cafe_id, transaction_date DESC) WHERE deleted_at IS NULL;
```

⚠️ Vị từ của index phải khớp với vị từ của câu truy vấn. Sự cố `track-configs` trước đây bắt nguồn đúng từ chỗ này: index lọc `deleted_at`, câu đọc lọc `is_active`.

### Bảng lý do (`match_reason`)

| Giá trị | Khi nào | `match_status` | Ai thấy |
|---|---|---|---|
| `null` | Khớp sạch | `MATCHED` | chủ quán |
| `OVERPAID` | Tiền nhiều hơn số phải trả — booking vẫn xác nhận | `MATCHED` | chủ quán |
| `NO_REF_CODE` | Nội dung không chứa mã tham chiếu | `NEEDS_REVIEW` | chủ + nhân viên |
| `REF_NOT_FOUND` | Có mã nhưng không tra ra transaction nào | `NEEDS_REVIEW` | chủ + nhân viên |
| `SHORT_PAID` | Tiền ít hơn số phải trả | `NEEDS_REVIEW` | chủ + nhân viên |
| `ALREADY_PAID` | Transaction đã SUCCESS — khách chuyển lần hai | `NEEDS_REVIEW` | chủ + nhân viên |
| `SESSION_REPLACED` | Transaction đã FAILED — khách đã đổi phương thức | `NEEDS_REVIEW` | chủ + nhân viên |
| `BOOKING_EXPIRED` | Tiền về sau khi hết hạn giữ chỗ | `NEEDS_REVIEW` | chủ + nhân viên |
| `UNKNOWN_ACCOUNT` | Tài khoản nhận không thuộc chi nhánh nào | `NEEDS_REVIEW` | **chỉ chủ** (FR-025c) |

`IGNORED` chỉ đạt được bằng thao tác tay của chủ quán ("không liên quan").

### Vòng đời

```
              ┌──────────────┐
  webhook ──▶ │ NEEDS_REVIEW │ ──gán tay──▶ MATCHED
              └──────┬───────┘
                     └────đánh dấu bỏ qua───▶ IGNORED

  webhook ──▶ MATCHED        (khớp tự động, đường thẳng)
```

`MATCHED` và `IGNORED` là trạng thái cuối. Không có đường quay lại — sửa nhầm thì tạo bản ghi đối ứng, theo đúng tinh thần Principle IV.

---

## Cột mới trên bảng có sẵn — `payment_transactions.payment_ref_code`

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `payment_ref_code` | varchar(16) | NULL, unique khi chưa xoá |

```sql
ALTER TABLE payment_transactions ADD COLUMN payment_ref_code VARCHAR(16);
CREATE UNIQUE INDEX ux_payment_transactions_ref_code
  ON payment_transactions (payment_ref_code) WHERE payment_ref_code IS NOT NULL;
```

**Định dạng**: `RCF` + 5 ký tự Crockford base32 (bỏ `I`, `L`, `O`, `U` để khỏi đọc nhầm) → 8 ký tự, ~1 triệu tổ hợp. Sinh ngẫu nhiên, thử lại khi đụng unique.

**Vì sao đặt ở đây chứ không ở `bookings`**: xem D3 trong `research.md`. Tóm tắt: `createCheckoutUrl` đã tạo transaction mới và giết transaction cũ mỗi lần khách đổi phương thức (`payment.service.ts:669–682`), nên gắn mã vào transaction là cách để FR-004a tự thoả mãn mà không viết thêm dòng nào.

**Không backfill.** Giao dịch cũ để `NULL` — chúng thuộc luồng VNPay, không cần mã tham chiếu.

---

## Quan hệ

```
cafes 1───1 cafe_payment_settings
  │
  └──0..n bank_transactions        (cafe_id NULL khi không nhận ra tài khoản)
                │
                └──0..1 payment_transactions   (chỉ khi MATCHED)
                          │
                          └──1 bookings
```

---

## Ranh giới với Payment Component (Principle IV)

`bank_transactions` **không phải** `PaymentComponent` và không bao giờ trở thành một.

Nó là **bằng chứng tiền đã về tài khoản ngân hàng**, đứng trước và độc lập với việc hệ thống ghi nhận doanh thu. Component vẫn do `createPaymentComponents` (`payment.service.ts:748`) sinh ra khi booking được xác nhận, y như luồng VNPay. Một giao dịch `NEEDS_REVIEW` có tiền thật trong tài khoản nhưng **không** sinh component nào — đúng như vậy, vì chưa có dịch vụ nào được bán.

Danh sách `PaymentComponentType` trong Constitution không được thêm giá trị nào.

---

## Tính bất biến

`bank_transactions` có sửa được ở ba cột: `match_status`, `match_reason`, `payment_transaction_id`, cộng nhóm `resolved_*`. Đây là ngoại lệ có chủ đích so với tính bất biến của Principle IV, vì bản ghi mô tả một **sự kiện bên ngoài** cùng với **phán quyết của hệ thống về sự kiện đó** — phán quyết thay đổi được khi có người xử lý, sự kiện thì không.

Phần bất biến — `external_id`, `amount`, `content`, `transaction_date`, `raw_payload` — **không bao giờ được sửa sau khi ghi**. Đây là phần đối soát với sao kê ngân hàng. Mọi thay đổi phán quyết đều ghi `resolved_by` + `resolved_at`.

---

## Migration

Một migration, chạy với `--transaction each` theo chuẩn dự án:

`src/migrations/<timestamp>-CafePaymentSettingsAndBankTransactions.ts`

Thứ tự: `cafe_payment_settings` → `bank_transactions` → cột `payment_ref_code` → các index.

`down()` đảo ngược đầy đủ, kể cả `DROP COLUMN payment_ref_code`.

**Không có native enum nào được tạo** — đã học từ `session_vehicle_status_enum`, nơi mỗi câu chèn thô đều phải ép kiểu tường minh.

---

## Ảnh hưởng tới bộ test

`jest-setup.ts` cắt sạch bảng ở mỗi `beforeEach`. Phải thêm vào danh sách TRUNCATE:

```
bank_transactions, cafe_payment_settings
```

Đặt `bank_transactions` **trước** `cafe_payment_settings` vì có khoá ngoại. Bỏ sót bước này sẽ gây lỗi vi phạm khoá ngoại rải rác giữa các test — đúng triệu chứng đã gặp khi thêm `contest_ledger_entries` ở feature 018.
