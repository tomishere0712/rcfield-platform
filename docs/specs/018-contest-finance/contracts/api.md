# API Contracts: Quản lý thu chi giải đấu

**Feature**: `018-contest-finance` | **Date**: 2026-08-08 | **Phase**: 1

Tiền tố chung: `/api/v1`. Router: `src/routes/contest.routes.ts` (mount tại `router.use('/', contestRouter)` trong `routes/index.ts:138`).

Khuôn phản hồi theo chuẩn dự án: `{ success: true, data: ... }` khi thành công; lỗi đi qua Express error middleware dưới dạng `AppError(message, statusCode, code)`.

---

## Tóm tắt

| # | Method | Path | Vai trò | Ghi chú |
|---|---|---|---|---|
| 1 | `GET` | `/contests/:contestId/finance` | PROVIDER owner | Báo cáo tổng hợp |
| 2 | `GET` | `/contests/:contestId/ledger-entries` | PROVIDER owner | Danh sách toàn bộ sổ |
| 3 | `POST` | `/contests/:contestId/ledger-entries` | PROVIDER owner \| STAFF | Staff bị siết: chỉ `OUT`, chỉ khi giải đang chạy |
| 4 | `GET` | `/contests/:contestId/ledger-entries/mine` | STAFF | Chỉ bút toán do chính mình tạo |
| 5 | `PATCH` | `/contest-ledger-entries/:entryId` | PROVIDER owner | |
| 6 | `DELETE` | `/contest-ledger-entries/:entryId` | PROVIDER owner | Xoá mềm |
| 7 | `POST` | `/contests/:contestId/ledger-entries/receipt` | PROVIDER owner \| STAFF | Upload ảnh chứng từ, trả URL |
| 8 | `POST` | `/contest-registrations/:registrationId/mark-entry-fee-paid` | PROVIDER \| STAFF | ⚠️ **THAY ĐỔI PHÁ VỠ** |

Endpoint 1–2 và 4 **không** mang `requireActiveProvider`; 3, 5, 6, 7 thì có ([D6](../research.md#d6--requireactiveprovider-chỉ-áp-cho-endpoint-ghi-không-áp-cho-endpoint-đọc)).

---

## 1. `GET /contests/:contestId/finance`

Báo cáo tài chính của một giải.

**Middleware**: `authenticate` → `authorize(PROVIDER)` → handler → `assertContestFinanceOwner`

```
200 OK
{
  "success": true,
  "data": {
    "contest_id": "…",
    "entry_fee": {
      "collected_total": 1200000,
      "collected_by_method": { "ONLINE": 800000, "CASH": 400000, "TRANSFER": 0, "UNKNOWN": 0 },
      "pending_total": 600000,
      "waived_total": 200000,
      "counts": { "collected": 6, "pending": 3, "waived": 1 }
    },
    "income": {
      "total": 2000000,
      "by_category": [ { "category": "SPONSORSHIP", "total": 2000000, "count": 1 } ]
    },
    "expense": {
      "total": 2000000,
      "by_category": [ { "category": "PRIZE_CASH", "total": 1500000, "count": 1 } ],
      "platform_fee": { "amount": 500000, "plan_name": "Gói nổi bật 7 ngày", "editable": false }
    },
    "summary": { "total_income": 3200000, "total_expense": 2000000, "net": 1200000 }
  }
}
```

`expense.total` **đã bao gồm** `platform_fee.amount`; `by_category` thì **không** chứa nó (dòng ảo, tách riêng — [D11](../research.md#d11--phí-tổ-chức-giải-là-dòng-chi-tính-động-không-phải-bút-toán)).

`waived_total` **không** nằm trong `summary.total_income` (FR-011).

| Lỗi | Code | Khi nào |
|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu token |
| 403 | `FORBIDDEN` | Không phải PROVIDER, hoặc PROVIDER không sở hữu giải, hoặc là ADMIN (FR-017a) |
| 404 | `CONTEST_NOT_FOUND` | Giải không tồn tại |

**Giải chưa có dữ liệu** trả `200` với mọi số bằng 0, không phải `404` (US1 kịch bản 4).

---

## 2. `GET /contests/:contestId/ledger-entries`

Query: `direction` (`IN`\|`OUT`), `category`, `from`, `to` — tất cả tuỳ chọn.

```
200 OK
{ "success": true, "data": [
    { "id": "…", "direction": "OUT", "category": "PRIZE_CASH",
      "title": "Tiền thưởng hạng nhất", "amount": 1500000,
      "occurred_at": "2026-08-05T10:00:00.000Z",
      "note": null, "receipt_url": null,
      "created_by": { "id": "…", "full_name": "Nguyễn Văn A", "role": "PROVIDER" },
      "created_at": "…", "updated_at": "…" }
] }
```

Chỉ trả bản ghi `deleted_at IS NULL`. Sắp xếp `occurred_at DESC, created_at DESC`.

---

## 3. `POST /contests/:contestId/ledger-entries`

**Middleware**: `authenticate` → `authorize(PROVIDER, STAFF)` → `requireActiveProvider` → handler

```json
{
  "direction": "OUT",
  "category": "OTHER",
  "title": "Mua pin dự phòng",
  "amount": 150000,
  "occurred_at": "2026-08-05T14:30:00.000Z",
  "note": "Hết pin giữa vòng bán kết",
  "receipt_url": null
}
```

### Ràng buộc zod

| Trường | Quy tắc |
|---|---|
| `direction` | Bắt buộc, `IN` \| `OUT`. **STAFF chỉ được `OUT`** (FR-019) |
| `category` | Bắt buộc; tập hợp lệ phụ thuộc `direction` — dùng `z.discriminatedUnion('direction', …)` |
| `title` | Bắt buộc, trim, 1–255 ký tự |
| `amount` | Bắt buộc, số nguyên dương > 0 (FR-004) |
| `occurred_at` | Bắt buộc, ISO datetime |
| `note` | ≤1000 ký tự. **Bắt buộc khi người tạo là STAFF** (FR-020) |
| `receipt_url` | Tuỳ chọn, URL |

`created_by` và `created_by_role` lấy từ token, **không** nhận từ body.

```
201 Created
{ "success": true, "data": { …bút toán vừa tạo… } }
```

| Lỗi | Code | Khi nào |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod fail |
| 403 | `FORBIDDEN` | PROVIDER không sở hữu giải, hoặc STAFF chưa được phân công vào giải |
| 403 | `CONTEST_LEDGER_STAFF_INCOME_FORBIDDEN` | STAFF gửi `direction: "IN"` (FR-019) |
| 409 | `CONTEST_LEDGER_STAFF_WINDOW_CLOSED` | STAFF ghi khi giải **không** ở trạng thái `RUNNING` (FR-019a) |
| 404 | `CONTEST_NOT_FOUND` | |

Chủ doanh nghiệp ghi được ở **mọi** trạng thái giải, kể cả `DRAFT`, `COMPLETED`, `CANCELLED` (FR-018a).

---

## 4. `GET /contests/:contestId/ledger-entries/mine`

Dành cho nhân viên xem lại bút toán của chính mình (FR-021).

**Middleware**: `authenticate` → `authorize(STAFF)` → handler

Lọc cứng `created_by = viewer.userId`. Phản hồi giống endpoint 2 nhưng **không kèm bất kỳ số tổng nào** — không `summary`, không `by_category`, không tổng cộng ở `meta`.

Nhân viên đã bị gỡ phân công vẫn `GET` được các bút toán cũ của mình (FR-023) nhưng không tạo mới được.

---

## 5. `PATCH /contest-ledger-entries/:entryId`

Body: tập con của `category`, `title`, `amount`, `occurred_at`, `note`, `receipt_url`. **Không** đổi được `direction` — muốn đổi chiều thì xoá rồi tạo lại, vì đổi chiều làm mọi con số lịch sử trong audit mất nghĩa.

| Lỗi | Code |
|---|---|
| 403 | `FORBIDDEN` — không phải chủ sở hữu giải; STAFF luôn bị chặn kể cả với bút toán của chính mình (FR-022) |
| 404 | `CONTEST_LEDGER_ENTRY_NOT_FOUND` — không tồn tại hoặc đã xoá mềm |
| 400 | `VALIDATION_ERROR` |

Ghi audit `ledger.entry_updated` với đủ `before_json` / `after_json` (FR-026).

---

## 6. `DELETE /contest-ledger-entries/:entryId`

Xoá mềm. `200 OK` với `{ "success": true, "data": { "id": "…", "deleted_at": "…" } }`.

Xoá lại một bút toán đã xoá → `404 CONTEST_LEDGER_ENTRY_NOT_FOUND`, không phải `204`.

---

## 7. `POST /contests/:contestId/ledger-entries/receipt`

`multipart/form-data`, field `file`. Theo đúng khuôn `uploadBanner` (`contest.controller.ts:658`).

- Giới hạn 5MB (`multer` memoryStorage)
- Chỉ nhận `image/jpeg`, `image/png`, `image/webp`, `image/jpg` → sai định dạng trả `422 UNSUPPORTED_FORMAT`
- Thiếu file → `400 FILE_REQUIRED`
- Cloudinary folder: `rcfield/contests/${providerId}/receipts`

```
201 Created
{ "success": true, "data": { "url": "https://res.cloudinary.com/…" } }
```

Client gắn URL này vào `receipt_url` khi tạo hoặc sửa bút toán ([D12](../research.md#d12--ảnh-chứng-từ-upload-qua-endpoint-riêng-trả-url)).

---

## 8. ⚠️ THAY ĐỔI PHÁ VỠ — `POST /contest-registrations/:registrationId/mark-entry-fee-paid`

### Trước

```typescript
// validate/index.ts:594
export const ContestMarkFeePaidSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
```

Body `{}` hợp lệ.

### Sau

```typescript
export const ContestMarkFeePaidSchema = z.object({
  payment_method: z.enum(['CASH', 'TRANSFER']),   // BẮT BUỘC
  note: z.string().trim().max(1000).optional(),
});
```

`ONLINE` **không** nằm trong tập nhận từ body — giá trị đó chỉ do luồng VNPay tự gán, người dùng không tự khai được.

### Tác động

- Mọi client đang gọi endpoint này với body rỗng sẽ nhận `400 VALIDATION_ERROR`. Cần sửa FE **cùng lúc** với BE, không deploy lệch.
- `ContestMarkFeePaidSchema` đang được **dùng chung** cho cả `waiveEntryFee` (`contest.controller.ts:241`). Miễn lệ phí thì không có phương thức thu nào cả → **phải tách thành hai schema**, nếu không việc miễn phí sẽ đòi `payment_method` một cách vô lý.

```typescript
export const ContestWaiveFeeSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
```

Đây là bẫy dễ bỏ sót nhất của endpoint này: hai handler khác nhau đang chia sẻ một schema, sửa một chỗ là hỏng chỗ kia.

### Ràng buộc phía service

`markEntryFeePaid` ghi `entry_fee_payment_method`; `waiveEntryFee` phải **set về `NULL`** (bất biến ở [data-model](../data-model.md#cột-mới-contest_registrationsentry_fee_payment_method): cột chỉ có nghĩa khi `payment_status = MARKED_PAID`).

---

## Bảng mã lỗi mới

| Code | HTTP | Ý nghĩa |
|---|---|---|
| `CONTEST_LEDGER_ENTRY_NOT_FOUND` | 404 | Bút toán không tồn tại hoặc đã xoá mềm |
| `CONTEST_LEDGER_STAFF_INCOME_FORBIDDEN` | 403 | Nhân viên cố ghi khoản thu |
| `CONTEST_LEDGER_STAFF_WINDOW_CLOSED` | 409 | Nhân viên ghi ngoài lúc giải đang chạy |

Các mã sẵn có được tái sử dụng: `UNAUTHORIZED`, `FORBIDDEN`, `CONTEST_NOT_FOUND`, `VALIDATION_ERROR`, `FILE_REQUIRED`, `UNSUPPORTED_FORMAT`.
