---
id: system-knowledge-base
title: RCField — System Knowledge Base
sidebar_label: System Knowledge Base
---

# RCField — System Knowledge Base

Tài liệu này mô tả **hệ thống RCField**: nó làm gì, dữ liệu nằm ở đâu, luật nào
đang được cưỡng chế, và chỗ nào hiện chưa đúng như tài liệu nói.

Đây **không phải** kho tri thức của chatbot từng quán. Kho đó nằm ở bảng
`kb_documents` / `kb_chunks`, tách riêng theo `cafe_id`, chứa chính sách và FAQ
do provider tải lên để trả lời khách.

:::info Nguyên tắc của tài liệu này
Mọi con số và quy tắc dưới đây đều đối chiếu trực tiếp với mã nguồn hoặc với
schema của cơ sở dữ liệu đang chạy, kèm đường dẫn tới chỗ kiểm được. Chỗ nào
tài liệu khác nói một đằng mà code làm một nẻo thì ghi rõ cả hai.
:::

---

## 1. Hệ thống là gì

RCField là **nền tảng SaaS đa chủ thể** cho các quán vận hành sân xe điều khiển
từ xa (RC) tại Việt Nam. Nó không phải sàn thương mại: mỗi **Provider** là một
doanh nghiệp độc lập, tự vận hành một hoặc nhiều **chi nhánh (cafe)** trên cùng
một hệ thống, và trả tiền cho RCField dưới dạng **phí thuê bao phần mềm**.

**Nền tảng không ăn phần trăm trên đơn đặt lịch.** `platform_fee_pct` cố định
bằng 0. Doanh thu của RCField đến từ hai nguồn: gói thuê bao của provider, và
phí tổ chức giải đấu.

**Không có tiền cọc.** Nền tảng đã bỏ hoàn toàn security deposit khỏi mọi luồng
thanh toán. Giá trị `SECURITY_DEPOSIT` vẫn nằm trong enum
`payment_component_type` để đọc được dữ liệu cũ, nhưng không dòng code nào tạo
component loại này nữa.

### Năm nhóm người dùng

| Vai trò | Là ai | Làm gì |
|---|---|---|
| **Guest** | Khách chưa đăng nhập | Xem chi nhánh, giải đấu, bảng xếp hạng; đặt lịch và thanh toán không cần tài khoản |
| **Customer** | Khách có tài khoản | Đặt lịch, mua gói chơi, xác nhận biên bản bàn giao, đăng ký thi đấu, đánh giá |
| **Staff** | Nhân viên **một** chi nhánh | Nhận xe/trả xe, ghi biên bản, gia hạn, ghi món, bảo trì, điều hành giải |
| **Provider** | Chủ doanh nghiệp | Quản lý chi nhánh, đội xe, thực đơn, gói, khuyến mãi, nhân sự, giải đấu, thuê bao |
| **Admin** | Đội RCField | Duyệt đối tác và chi nhánh, đối soát tiền, quản lý danh mục nền, feature flag |

Ràng buộc quan trọng: **một nhân viên thuộc đúng một chi nhánh**
(`staff_cafe_assignments.staff_id` là khoá duy nhất) và chỉ thao tác được trong
phạm vi dữ liệu của chi nhánh đó.

### Hai chế độ chơi

- **RENTAL** — khách thuê xe của quán. Có biên bản bàn giao, có tiền thuê, có
  thể phát sinh tiền đền hỏng.
- **BYOC** *(Bring Your Own Car)* — khách mang xe riêng. Quán chỉ bán suất sân;
  không có tài sản nào của quán giao cho khách, nên biên bản bàn giao BYOC được
  tự xác nhận ngay lúc tạo.

Enum trong CSDL còn giá trị `MIXED` nhưng không luồng nào tạo ra được và chưa
đơn nào dùng.

---

## 2. Kiến trúc

Một khối nguyên khối phân tầng, không phải microservice.

```
React + Vite (web)  ──HTTP──▶  Express + TypeORM  ──▶  PostgreSQL 16 + pgvector
                                      │
                                      ├──▶ Redis        (khoá chống đặt trùng, chống spam đăng nhập, hàng đợi Messenger)
                                      ├──▶ VNPay / PayOS / VietQR + SePay   (thanh toán)
                                      ├──▶ Cloudinary   (ảnh biên bản, ảnh xe, ảnh quán)
                                      ├──▶ Google Gemini + NLU sidecar      (chatbot, phân tích doanh thu)
                                      ├──▶ Facebook Graph API               (kênh Messenger)
                                      └──▶ Brevo        (email giao dịch, hoá đơn PDF)
```

Backend đi theo tầng nghiêm ngặt: **route → controller → service → repository**.
Controller chỉ nhận request, validate bằng zod rồi gọi service; toàn bộ nghiệp
vụ nằm ở service.

- Backend: `rcfeild-be/` — Node 20+, TypeScript strict, Express, TypeORM
- Frontend: `rcfield-fe/` — React, TypeScript, Tailwind, React Query + Zustand, giao diện tiếng Việt

---

## 3. Dữ liệu: 70 bảng, chia theo 11 khối

Kiểm số bảng bất cứ lúc nào:

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'migrations';
```

| # | Khối | Bảng | SL |
|---|---|---|---|
| 1 | Định danh & truy cập | users, refresh_tokens, password_reset_tokens, push_tokens, staff_invite_tokens, staff_cafe_assignments, provider_profiles | 7 |
| 2 | Chi nhánh & khám phá | cafes, cafe_images, cafe_channels, cafe_holiday_overrides, holiday_dates, cafe_pricing_rules, cafe_track_configs, track_types, amenity_catalog, featured_popups, reviews | 11 |
| 3 | Đội xe | vehicles, vehicle_catalogs, vehicle_catalog_images, vehicle_maintenance_logs | 4 |
| 4 | Thực đơn | menu_categories, menu_items, menu_item_variants, menu_item_components | 4 |
| 5 | Đặt lịch & thương mại | bookings, booking_participants, booking_vehicles, promotions, customer_packages, packages | 6 |
| 6 | **Vận hành** | sessions, session_participants, session_vehicles, inspections, inspection_checklists, inspection_photos, damage_line_items, extension_proposals, fnb_orders, fnb_order_items | 10 |
| 7 | Thanh toán | payment_transactions, payment_components, payment_requests, bank_transactions, cafe_payment_settings | 5 |
| 8 | Thuê bao SaaS | subscription_plans, provider_subscriptions, feature_flags | 3 |
| 9 | Giải đấu | contests, contest_types/formats/templates/cafes, contest_registrations, contest_matches, contest_match_participants, contest_staff_assignments, contest_bans, contest_audit_logs, contest_ledger_entries, contest_fee_plans, contest_fee_orders, race_records, achievement_definitions | 16 |
| 10 | AI & hội thoại | kb_documents, kb_chunks, ai_analysis_logs | 3 |
| 11 | Xuyên suốt | notifications | 1 |

Sơ đồ chi tiết khối Vận hành: [Database Design for Operation Service](../diagrams/erd/operation-service-database-design.md).

### Quy ước dữ liệu

- **Khoá chính** là `uuid`, mặc định `gen_random_uuid()`.
- **Thời gian** là `timestamptz`. Ngoại lệ duy nhất là `cafe_channels` — bảng
  này dùng `timestamp` không kèm múi giờ. Đây là lỗi lệch chuẩn, không phải chủ ý.
- **Tên bảng** số nhiều, snake_case. Khoá ngoại theo mẫu `<entity>_id`.
- **Xoá mềm** chỉ áp cho **21/70 bảng** — những thực thể người dùng có thể thu
  hồi (chi nhánh, danh mục, thực đơn, gói, khuyến mãi, đối tác, đơn đặt). Các
  bảng ghi nhận sự kiện (biên bản, ảnh, payment component, thông báo) **không có
  `deleted_at`** và không bao giờ bị xoá.
- **Khoá duy nhất thường có điều kiện.** Ví dụ `menu_categories` cấm trùng
  `(cafe_id, lower(trim(name)))` **chỉ với bản ghi chưa xoá** — nên xoá một danh
  mục rồi tạo lại trùng tên là hợp lệ. Một số khoá đặt trên **biểu thức** chứ
  không phải cột, đọc bằng `pg_get_indexdef` mới thấy đúng.

---

## 4. Nguyên tắc số một: snapshot-first

**Không bao giờ tính tiền từ giá hiện tại.** Mọi phép tính đọc từ ảnh chụp giá
lưu trong `bookings.snapshot` (JSONB) tại thời điểm tạo đơn.

Ngoài giá, đơn còn đóng băng **danh tính xe** vào `booking_vehicles`: tên danh
mục, hạng xe, mã xe, màu, ảnh bìa. Provider đổi tên hay đổi hạng xe về sau không
làm thay đổi đơn cũ.

Cùng nguyên tắc đó áp cho `fnb_order_items` (tên món, tên biến thể, đơn giá) và
`customer_packages.package_name_snapshot`.

---

## 5. Vòng đời đơn đặt

```
PENDING ──thanh toán──▶ CONFIRMED ──check-in──▶ (phiên chơi) ──▶ COMPLETED
   │                        │                                        ▲
   │ quá 30 phút            │ huỷ / không đến                        │ hết khoản PENDING
   ▼                        ▼                                        │
CANCELLED               CANCELLED / NO_SHOW              AWAITING_PAYMENT
```

- **Cửa sổ thanh toán 30 phút** — `PAYMENT_WINDOW_MINUTES`, mặc định 30. Hết hạn
  thì cron huỷ đơn và hoàn lại lượt dùng khuyến mãi.
- **NO_SHOW** — cron đánh dấu khi quá `slot_start + 30 phút` mà **chưa có phiên
  chơi nào** được mở. Giữ toàn bộ phí sân; tiền thuê xe và F&B trả lại.
- **AWAITING_PAYMENT** — mọi phiên đã xong nhưng còn khoản `PENDING` (tiền gia
  hạn, món gọi thêm, tiền đền hỏng). Đơn chỉ sang `COMPLETED` khi không còn
  khoản nào treo.
- **Không huỷ được sau khi đã có phiên chơi.** Từ lúc nhân viên bắt đầu bàn giao,
  mọi việc xử lý qua luồng vận hành chứ không qua chính sách huỷ.

### Điều kiện nhận một đơn

| Điều kiện | Nguồn |
|---|---|
| Đặt trước ít nhất `min_booking_notice_minutes` | `cafes` |
| Không xa quá `max_advance_booking_days` (mặc định 30) | `cafes` |
| Tối đa **8 slot liền nhau** | `MAX_CONSECUTIVE_SLOTS` |
| Nằm trọn trong giờ mở cửa, tính theo **giờ Việt Nam** | `lib/vietnam-time.ts` |
| Xe không trùng lịch (`SLOT_LOCKED`, khoá phân tán qua Redis) | |
| Xe hợp loại sân nếu danh mục có khai `compatible_track_types` | `VEHICLE_TRACK_INCOMPATIBLE` |
| BYOC còn chỗ theo `cafe_track_configs.byoc_capacity`, thiếu thì lùi về `cafes.byoc_capacity` | `BYOC_CAPACITY_FULL` |
| Gói thuê bao của provider còn hiệu lực | xem §9 |

### Hệ số giá

`pricing.service.ts` gom mọi quy tắc khớp khung giờ rồi lấy **giá trị lớn nhất**,
**không nhân dồn**: ghi đè ngày lễ của quán → ngày lễ tự đặt → ngày lễ hệ thống
→ quy tắc cuối tuần → quy tắc giờ cao điểm. Không quy tắc nào khớp thì hệ số là
1.0.

Khung giờ cao điểm là **nửa đóng nửa mở**: `[giờ mở, giờ đóng)`. Slot bắt đầu
đúng giờ mở thì tính giá cao điểm; slot bắt đầu đúng giờ đóng thì không. Trước
đây so chuỗi trực tiếp giữa `'HH:MM'` và cột `time` trả về `'HH:MM:SS'` nên
khung bị dịch thành `(mở, đóng]` — quán mất phụ phí ở đúng giờ khách hay đặt
nhất. Biên này có test ở `pricing.service.test.ts`; **fixture phải dùng định
dạng `'HH:MM:SS'` như DB thật**, dùng `'HH:MM'` là test xanh giả.

---

## 6. Vận hành tại quán

```
Đặt lịch ngày ──"Nhận xe & bàn giao"──▶ Phiên chơi ──┬─▶ Biên bản bàn giao (?type=CHECK_IN)
   (hoặc quét QR đơn đặt)                            ├─▶ Đề nghị gia hạn
                                                     ├─▶ Ghi món gọi thêm
                                                     ├─▶ Đổi xe giữa ca
                                                     └─▶ Biên bản trả xe (?type=CHECK_OUT) ──▶ Quyết toán
```

Cả hai biên bản dùng **chung một màn hình**, khác nhau ở tham số `?type=`, và
**cả hai đều mở từ màn Phiên chơi** — không phải từ màn chi tiết đơn.

### Biên bản kiểm xe

- Biên bản xe thuê cần **4 đến 6 ảnh**, hệ thống **đếm số ảnh** chứ không kiểm
  góc chụp (`INVALID_INSPECTION_PHOTO_COUNT`). Chụp đủ bốn góc trước–sau–trái–phải
  là thông lệ cho bốn tấm tối thiểu.
- Ảnh BYOC quản lý theo từng người chơi, không áp quy tắc đếm này.
- Biên bản bàn giao cần **khách xác nhận**; riêng BYOC tự xác nhận vì quán không
  giao tài sản gì.
- Khách **từ chối** biên bản trả xe → phiên quay về `ACTIVE`, báo nhân viên kiểm
  lại. **Admin không tham gia**, và hệ thống **không có** tính năng khiếu nại
  tranh chấp nào.

### Tiền đền hư hỏng

```
damage_charge = Σ (damage_line_items.parts_price + labor_price)
```

Nhân viên nhập từng dòng linh kiện hỏng kèm giá; **không có hệ số nhân theo hạng
xe**. Hư hỏng đã được ghi nhận là *có sẵn* lúc nhận xe thì không bao giờ tính cho
khách.

### Giờ giấc phiên chơi

Ba ngưỡng, tất cả nằm ở `lib/session-operational-timing.ts`:

| Ngưỡng | Ý nghĩa |
|---|---|
| `planned_end_at` | Quá giờ dự kiến **không** tự thu xe, **không** tự chốt tiền. Phiên vẫn `ACTIVE`. |
| **+10 phút** | Hết hạn chốt gia hạn. Quá mốc này phải xử lý việc trả xe trước. |
| **+30 phút** | Bật cảnh báo quá giờ cho quán. |

Đề nghị gia hạn để **10 phút không trả lời** thì cron chuyển sang `EXPIRED` (chứ
không phải `REJECTED`) và phiên quay từ `EXTENDING` về `ACTIVE`.

---

## 7. Cỗ máy thanh toán

### Một lần trả trước, phần còn lại trả sau

```
Lúc xác nhận đơn (tạo với trạng thái HELD):
    slot_fee + rental_fee + fnb_preorder + contest_entry_fee − promotion_discount

Phát sinh trong/sau phiên, thu ở quyết toán:
    EXTENSION_FEE, FNB_ON_SITE, DAMAGE_CHARGE
```

`payment_components.type` có **10 giá trị**, `status` có **7**
(`PENDING → HELD → DISBURSED / REFUNDED`, cộng `PARTIALLY_REFUNDED`, `CAPTURED`,
`PENDING_REFUND`). Bản ghi không bao giờ bị xoá; thay đổi luôn là cập nhật trạng
thái tại chỗ.

### Ba mức hoàn tiền

| Trường hợp | Phí sân | Tiền thuê xe + F&B |
|---|---|---|
| **R1** Khách huỷ, còn > 24 giờ | hoàn 100% | hoàn 100% |
| **R1** Khách huỷ, còn 12–24 giờ | giữ 50% | hoàn 100% |
| **R1** Khách huỷ, còn < 12 giờ | giữ 100% | hoàn 100% |
| **R2** Quán/nhân viên huỷ | hoàn 100% | hoàn 100% |
| **R3** Khách không đến | giữ 100% | hoàn 100% |

Món F&B **đã phục vụ** thì không hoàn.

### Các cổng thanh toán

| Cổng | Dùng cho | Cách xác nhận |
|---|---|---|
| **VNPay** | Đơn đặt lịch, phí giải | Người dùng chuyển hướng, quay về `/payment/result` |
| **VietQR + SePay** | Đơn đặt lịch, quyết toán cuối ca | Webhook ngân hàng đối soát tự động |
| **PayOS** | Gói thuê bao provider, phí tổ chức giải | Webhook + trang callback |
| **DIRECT** | Trả tiền mặt tại quầy | Nhân viên xác nhận |
| **MOCK** | Môi trường thử | Tự xác nhận |

Chi nhánh **chưa được duyệt tài khoản ngân hàng** thì không hiện lựa chọn
VietQR (`cafe_payment_settings.is_verified`).

### Đối soát chuyển khoản

Một giao dịch ngân hàng chỉ khớp vào đơn khi **đủ cả ba**:

1. Nội dung chuyển khoản chứa đúng **mã đối soát** (`payment_ref_code`, lưu trên
   `payment_transactions`, **không** lưu trên `bookings`),
2. Giao dịch đích đang ở trạng thái `PENDING`,
3. Số tiền nhận **không nhỏ hơn** số tiền cần thu.

Lệch bất kỳ điều nào thì ghi vào sổ đối soát chờ người xử lý. Webhook
**idempotent** theo `(gateway, external_id)` — gửi lại không ghi có hai lần. Mỗi
đơn chỉ có **một phiên thanh toán sống**: phát mã QR mới thì mã cũ bị vô hiệu.

:::danger Bẫy đã biết trong luồng webhook
Webhook **phải** gọi `processConfirmationResult` (`payment.service.ts:879`).
Tuyệt đối không gọi `processMockConfirmation` (`:1142`) — hàm đó thiếu cả phần
kiểm số tiền lẫn phần kiểm hạn giữ chỗ.
:::

---

## 8. Giải đấu

- **Chưa trả phí thì không mở đăng ký.** Chuyển giải từ `DRAFT` sang `OPEN` bị
  chặn bằng `CONTEST_FEE_REQUIRED` (402) cho tới khi đơn phí đạt `PAID`. Trả qua
  PayOS thì `PAID` ngay; khai chuyển khoản tay thì dừng ở `PENDING_REVIEW` chờ
  admin đối soát.
- Mỗi giải chỉ có **một đơn phí đang sống**; đơn bị từ chối hoặc huỷ thì được
  tạo lại.
- **Mỗi người một lần đăng ký một giải** (`UNIQUE(contest_id, user_id)`).
- Mỗi đăng ký nhận một **mã check-in duy nhất toàn nền tảng**; check-in ghi lại
  chi nhánh nào và nhân viên nào thực hiện.
- **Sổ tài chính giải**: chỉ chủ giải ghi được khoản **thu**; nhân viên được phân
  công chỉ ghi được khoản **chi**; nhân viên ngoài giải bị từ chối hẳn.
- **Sửa kết quả không xoá lịch sử**: bản cũ chuyển `SUPERSEDED` và giữ lại.
- **Lệnh cấm** theo phạm vi một giải hoặc toàn bộ provider; mỗi phạm vi chỉ một
  lệnh đang hiệu lực; gỡ cấm ghi ai gỡ và vì sao.
- Mọi thay đổi trong giải ghi một dòng `contest_audit_logs` **trong cùng
  transaction**.
- Gói phí có `featured_days` thì tự sinh popup trang chủ khi xác nhận, nhưng
  popup ra đời ở trạng thái **tắt và chờ duyệt** — tiền đã trả vẫn phải qua admin
  duyệt nội dung.

---

## 9. Thuê bao SaaS

- **Dùng thử một lần cho mỗi provider** — `trial_used_at` đóng dấu lần đầu và
  chặn mọi lần sau.
- **Gia hạn cộng dồn**: trả trước khi hết hạn thì cộng thêm 30 ngày vào hạn cũ,
  không đặt lại từ hôm nay.
- **Hết hạn hẳn** → không nhận đơn mới nào.
- **Trong thời gian ân hạn** → vẫn nhận đơn, nhưng **chỉ những ca kết thúc trước
  khi hết ân hạn** (`PROVIDER_SUBSCRIPTION_ENDING`). Đây là chỗ nhiều tài liệu
  ghi sai thành "chặn hết".
- Thao tác quản trị (đội xe, thực đơn, khuyến mãi, gói, giải) chỉ mở khi provider
  ở trạng thái `ACTIVE` — chặn bởi middleware `requireActiveProvider`.

---

## 10. AI, hội thoại và feature flag

- Kho tri thức **cô lập tuyệt đối theo `cafe_id`**; truy hồi không bao giờ vượt
  sang chi nhánh khác.
- Tài liệu tải lên đi qua `PENDING → INDEXED` (đã tách đoạn và nhúng vector) hoặc
  `FAILED`. Vector lưu ở `kb_chunks.embedding` kiểu **`vector(3072)`** của
  pgvector — không phải `text`.
- **Mỗi chi nhánh kết nối đúng một trang Facebook.**
- **Quota AI theo tháng** cấu hình ở `feature_flags.config.monthly_quota`, đặt
  được ở phạm vi `GLOBAL` hoặc từng `CAFE`; mức tiêu thụ đếm ở
  `provider_subscriptions.ai_messages_used`. Hết lượt trả `QUOTA_EXCEEDED`.
- Feature flag **có hiệu lực ngay** khi admin bật/tắt, không cần deploy lại.

---

## 11. Xác thực và tài khoản

| Luật | Giá trị |
|---|---|
| Khoá sau đăng nhập sai liên tiếp | **5 lần → khoá 15 phút** (`ACCOUNT_LOCKED`) |
| Refresh token | Dùng **một lần**, lưu băm, hạn **7 ngày** |
| Mã đặt lại mật khẩu | **6 chữ số** qua email, xin mã mới thì xoá mã cũ, dùng một lần |
| Link mời nhân viên | Hạn **48 giờ**, dùng một lần |
| Đóng vai (impersonation) | Token **2 giờ**, mang `impersonated_by` để truy về người thật |
| Số điện thoại cá nhân | Di động Việt Nam: đầu 03/05/07/08/09, đúng 10 số (`lib/vietnam-phone.ts`) |
| Số điện thoại chi nhánh | Nhận thêm số cố định `02x` |

Khách vãng lai được ghi theo số điện thoại; khi người đó đăng ký tài khoản bằng
chính số ấy, bản ghi khách vãng lai được **nâng cấp tại chỗ** để lịch sử đi theo.

---

## 12. Quy ước API

- Mọi phản hồi bọc trong `{ success, data }`; lỗi đi qua middleware chung với
  **mã lỗi ổn định** (`AppError(message, statusCode, code)`).
- Toàn bộ request body validate bằng **zod**.
- Endpoint không công khai đều qua `authenticate` + `authorize(role)`.

Một số mã lỗi hay gặp:

| Mã | Nghĩa |
|---|---|
| `SLOT_LOCKED` | Xe đã có đơn khác trong khung giờ |
| `BYOC_CAPACITY_FULL` | Hết chỗ cho xe khách tự mang |
| `VEHICLE_TRACK_INCOMPATIBLE` | Xe không hợp loại sân |
| `PACKAGE_NOT_ENOUGH_SLOTS` | Gói không đủ lượt |
| `PROVIDER_SUBSCRIPTION_ENDING` | Ca vượt quá hạn ân hạn của gói |
| `CONTEST_FEE_REQUIRED` | Giải chưa trả phí, chưa mở đăng ký được |
| `INVALID_INSPECTION_PHOTO_COUNT` | Biên bản xe thuê không đủ 4–6 ảnh |
| `VEHICLE_IN_ACTIVE_SESSION` | Xe đang trong phiên chơi chưa kết thúc |
| `VEHICLE_RETIRED` | Xe đã ngừng khai thác, không đảo ngược được |

---

## 13. Nợ kỹ thuật và chỗ tài liệu hay sai

Phần này giá trị nhất khi tiếp nhận hệ thống. Tất cả đều đã kiểm tận nơi.

### Tính năng có giao diện nhưng không có thật

| Thứ | Thực trạng |
|---|---|
| **Điểm uy tín khách hàng** | `users.trust_score` mặc định 100, **không dòng code nào ghi vào**. Mọi user đang là 100.00. Enum lý do (`NO_SHOW`, `DAMAGE_CONFIRMED`…) còn đó nhưng bảng log điểm không tồn tại. |
| **Push notification** | Có bảng `push_tokens` và endpoint đăng ký thiết bị, nhưng **không có nơi nào gửi push** — không Firebase, không Expo. Thông báo thời gian thực đi qua WebSocket. |
| **Ví tiền** | Không tồn tại. Hoàn tiền đi ngược qua cổng đã thanh toán. |
| **Khiếu nại / tranh chấp** | Không có bảng, không có luồng admin. Chỉ có việc khách từ chối biên bản trả xe. |
| **Quản lý người dùng của Admin** | Trang chạy dữ liệu giả, không có link trong menu, backend không có endpoint. |
| **Xếp ca làm việc** | Frontend 1633 dòng gọi `/v1/provider/shifts/*`, nhưng backend đã **drop toàn bộ bảng ca làm** — mọi request 404. |

### Bảng bị viện dẫn nhưng không tồn tại

`package_usages`, `promotion_usages`, `notification_logs` — cả ba đều từng xuất
hiện trong tài liệu nghiệp vụ. Không bảng nào tồn tại.

### Ràng buộc còn thiếu trong CSDL

- `fnb_order_items.fnb_order_id` — **không có khoá ngoại**. Xoá đơn F&B để lại
  dòng món mồ côi.
- `payment_components.booking_vehicle_id` — **không có khoá ngoại**, trong khi
  đây là cột nối khoản đền bù về đúng chiếc xe.
- ~~`cafe_channels.cafe_id` là `varchar`, không khoá ngoại.~~ **Đã sửa** bằng
  `FixCafeChannelsCafeIdType1787100000000`. Trước đó cột lệch kiểu với
  `cafes.id` (`uuid`) làm mọi câu SQL thô JOIN hai bảng chết với
  `operator does not exist: uuid = character varying` — chính là lỗi 500 ở
  `checkChannelQuota`, chặn luồng nối trang Facebook trên production.
  Entity vẫn khai `type: 'uuid'` nên TypeORM không phát hiện được sự lệch này:
  **khai báo entity không phải bằng chứng về kiểu cột thật**.
- `cafes.track_types` và `cafes.amenity_ids` là **mảng uuid**, không ràng buộc
  gì — xoá một loại sân thì mảng vẫn giữ id chết.
- Nhiều trường mang tính enum lại khai bằng `varchar`, nên không chặn được giá
  trị lạ: `payment_transactions.gateway`/`status`, `contest_matches.status`,
  `race_records.*`.

### Cột trùng nghĩa

- `reviews` có **cả `comment` lẫn `note`** (code chỉ ghi `note`), và **cả
  `is_visible` lẫn `status`** — hai cách ẩn review song song, không gì bảo đảm
  đồng bộ.
- `contests.track_type` (varchar, **NOT NULL**) tồn tại song song với
  `contests.track_type_id` (khoá ngoại, **nullable**) — cột cũ đang là cột bắt
  buộc, cột chuẩn hoá thay thế nó thì không.
- `contest_match_participants` giữ cả `best_lap_ms` lẫn `best_lap_seconds`.

### Ba con số hay bị chép sai

1. Hoàn tiền: mốc là **24 giờ và 12 giờ**, và chỉ áp cho **phí sân**.
2. Không đến: ngưỡng **30 phút sau giờ bắt đầu**, và chỉ khi **chưa mở phiên nào**.
3. Ảnh biên bản: **4–6 ảnh** cho xe thuê, đếm số lượng chứ không kiểm góc.

---

## 14. Cách tự kiểm chứng

```bash
# Schema thật của một bảng
docker exec rcfeild_postgres psql -U postgres -d rcfeild_db -c '\d+ bookings'

# Ràng buộc duy nhất, kể cả loại đặt trên biểu thức
docker exec rcfeild_postgres psql -U postgres -d rcfeild_db -Atc \
  "SELECT indexdef FROM pg_indexes WHERE tablename='menu_categories' AND indexdef LIKE '%UNIQUE%';"

# Chạy kiểm thử (script tự thêm NODE_OPTIONS cần thiết cho Node 25)
cd rcfeild-be && npm test

# Kiểm kiểu, lint, định dạng
npx tsc --noEmit && npm run lint && npm run format:check
```

Tra cứu code thì dùng `mcp__codegraph__codegraph_explore` — nó trả về mã nguồn
nguyên văn kèm đường gọi và phạm vi ảnh hưởng trong một lần, nhanh hơn grep thủ công.

---

## 15. Tài liệu liên quan

| Cần gì | Đọc ở đâu |
|---|---|
| Toàn cảnh nghiệp vụ | `docs/spec/00-overview.md` |
| Thực thể và schema | `docs/spec/01-domain-model.md` |
| Máy trạng thái đơn đặt | `docs/spec/02-state-machine.md` |
| Luật thanh toán đầy đủ | `docs/spec/03-payment-engine.md` |
| Luồng nhận/trả xe | `docs/spec/04-inspection-flow.md` |
| Hợp đồng API | `docs/spec/05-api-contracts.md` |
| ERD khối Vận hành | [operation-service-database-design](../diagrams/erd/operation-service-database-design.md) |
| Ràng buộc gói thuê bao | `docs/developer/provider-subscription-enforcement.md` |
| 75 quy tắc nghiệp vụ | SRS mục 5.1 |
