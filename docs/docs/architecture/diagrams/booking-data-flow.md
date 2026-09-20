# Booking Data Flow — Tables touched per step

> Happy path đi thẳng xuống. Unhappy cases rẽ ngang sang phải.  
> Số trong ngoặc `[pc-001]` là ví dụ row ID để dễ theo dõi xuyên suốt.

---

## Mục lục

1. [Phase 1 — Tạo Booking](#phase-1--tạo-booking)
   - [Case A: RENTAL thông thường](#case-a-rental-thông-thường)
   - [Case B: BYOC (mang xe cá nhân)](#case-b-byoc-mang-xe-cá-nhân)
   - [Case C: Dùng gói đã mua (PACKAGE)](#case-c-dùng-gói-đã-mua-package)
   - [Case D: Staff tạo thủ công (walk-in)](#case-d-staff-tạo-thủ-công-walk-in)
2. [Phase 2 — Thanh toán](#phase-2--thanh-toán)
3. [Phase 3 — Check-in](#phase-3--check-in)
4. [Phase 4 — Session đang diễn ra](#phase-4--session-đang-diễn-ra)
   - [Case: Gia hạn thêm giờ](#case-gia-hạn-thêm-giờ)
   - [Case: Gọi F&B tại quán](#case-gọi-fb-tại-quán)
5. [Phase 5 — Check-out](#phase-5--check-out)
   - [Case: Không có damage](#case-không-có-damage)
   - [Case: Có damage, khách đồng ý](#case-có-damage-khách-đồng-ý)
   - [Case: Có damage, khách tranh chấp](#case-có-damage-khách-tranh-chấp)
6. [Unhappy paths](#unhappy-paths)
   - [Case: No-show (không đến)](#case-no-show-không-đến)
   - [Case: Khách huỷ trước khi thanh toán](#case-khách-huỷ-trước-khi-thanh-toán)
   - [Case: Khách huỷ sau khi đã thanh toán](#case-khách-huỷ-sau-khi-đã-thanh-toán)
7. [Giải thích bảng](#giải-thích-bảng)

---

## Phase 1 — Tạo Booking

### Case A: RENTAL thông thường

```
Customer chọn slot + xe thuê + thêm bạn + F&B preorder (tuỳ chọn)
                       │
                       ▼
bookings               status=PENDING, booking_mode=SINGLE, play_mode=RENTAL
                       slot_start/end theo chọn lựa
                       snapshot={ giá tại thời điểm đặt, bất biến mãi mãi }
                       payment_expires_at = now() + 30m

booking_participants   bp-001: user=Minh, type=BOOKER, is_primary=true
                       bp-002: user=Hùng, type=REGISTERED_USER
                       bp-003: name="Tuấn", type=WALK_IN_GUEST (chưa có tài khoản)

booking_vehicles       bv-001: vehicle=Traxxas, assigned_to=bp-001
                              hourly_rate_snapshot=150k    ← snapshot từ vehicle.hourly_rate
                              security_deposit_snapshot=800k ← snapshot từ vehicle.security_deposit
                                                              (Provider đặt dựa trên giá trị xe thực tế ~8M)
                              damage_multiplier_snapshot=1.5

fnb_orders             fo-001: type=PRE_ORDER, status=PENDING  ← nếu chọn F&B trước
fnb_order_items               item=Nước cam, qty=2, unit_price_snapshot=30k

payment_components     pc-001: type=SLOT_FEE,         amount=50k,   status=PENDING
                       pc-002: type=RENTAL_FEE,        amount=300k,  status=PENDING
                       pc-003: type=SECURITY_DEPOSIT,  amount=800k,  status=PENDING ← = security_deposit_snapshot của xe
                       pc-004: type=FNB_PREORDER,      amount=60k,   status=PENDING
```

---

### Case B: BYOC (mang xe cá nhân)

```
Customer chọn slot + khai xe cá nhân (không chọn xe quán)
                       │
                       ▼
bookings               play_mode=BYOC
                       snapshot={ slot_fee, byoc_fee (nếu có) }

booking_participants   bp-001: user=Minh, type=BOOKER, is_primary=true

booking_vehicles       ← KHÔNG tạo (không thuê xe quán)

customer_vehicles      cv-001: customer=Minh, brand=Traxxas, model=TRX-4   ← xe của Minh
                              ← đã tạo trước đó, reference tại session_vehicles

payment_components     pc-001: type=SLOT_FEE,    amount=50k,  status=PENDING
                       ← KHÔNG có RENTAL_FEE, SECURITY_DEPOSIT
```

---

### Case C: Dùng gói đã mua (PACKAGE)

```
Customer đã mua gói 10 slot trước đó
                       │
                       ▼
customer_packages      cp-001: remaining_slots=7 → 6 sau khi đặt
                               status=ACTIVE

bookings               booking_mode=PACKAGE
                       play_mode=RENTAL

package_usages         pu-001: customer_package_id=cp-001
                               booking_id=bkg-001
                               used_slots=1

payment_components     pc-001: type=SLOT_FEE, amount=0   ← gói slot cover tiền sân
                       pc-002: type=RENTAL_FEE, amount=300k, status=PENDING
                               ← vẫn tính nếu khách thuê xe và package không cover rental
                       pc-003: type=SECURITY_DEPOSIT, amount=800k, status=PENDING
                               ← vẫn thu cọc theo giá trị xe

NOTE: Phase 1 khuyến nghị package 10 slot chỉ cover SLOT_FEE.
Nếu Provider muốn gói cover cả RENTAL_FEE, phải snapshot rõ package_coverage
trên booking để PaymentEngine biết component nào amount=0.
```

---

### Case D: Staff tạo thủ công (walk-in / gọi điện)

```
Khách đến quán trực tiếp, Staff tạo booking thay
                       │
                       ▼
bookings               source=STAFF_MANUAL
                       customer_id=user-vip  ← vẫn phải có account (Staff tạo nhanh)
                       status=CONFIRMED       ← bỏ qua bước PENDING + payment gateway
                                                vì thu tiền mặt trực tiếp

payment_components     pc-001: type=SLOT_FEE,        amount=50k,  status=DISBURSED
                       pc-002: type=RENTAL_FEE,       amount=300k, status=DISBURSED
                       pc-003: type=SECURITY_DEPOSIT, amount=800k, status=HELD ← thu cọc theo giá trị xe
                       ← SLOT/RENTAL Disbursed ngay vì thu tiền mặt, không qua gateway
                       ← Deposit vẫn HELD cho đến khi checkout quyết toán

payment_transactions   ← KHÔNG tạo (không qua payment gateway)
```

---

## Phase 2 — Thanh toán cọc

> Chỉ charge **cọc** (15% giá trị xe) tại bước này.
> Slot fee, rental fee, F&B vẫn PENDING — sẽ charge tại checkout.

```
                    [Payment Gateway: VNPay / MoMo]
                               │
               ┌───────────────┴───────────────────────────────┐
               │ ✓ SUCCESS                     ✗ FAIL / TIMEOUT│
               ▼                                               ▼
payment_transactions  txn-001: type=PAYMENT               bookings       status=CANCELLED
                               amount=300k (cọc only)      ← deposit chưa charged
                               status=SUCCESS                ← không cần void/refund
                               gateway_txn_id=VNPAY...

payment_components    pc-003 SECURITY_DEPOSIT: PENDING → HELD  ← chỉ deposit bị charge
                      pc-001 SLOT_FEE:         vẫn PENDING ┐
                      pc-002 RENTAL_FEE:        vẫn PENDING ├── charge tại checkout
                      pc-004 FNB_PREORDER:      vẫn PENDING ┘

bookings              status PENDING → CONFIRMED
fnb_orders            status PENDING → CONFIRMED  (nếu có preorder)

               │ ✗ Không thanh toán cọc trong 30 phút
               ▼
bookings              status=CANCELLED
                      cancellation_reason="Payment timeout"
                      cancelled_at=now()
```

---

## Phase 3 — Check-in

```
Staff check-in khi khách đến quán
                       │
                       ▼
sessions               sess-001: status=CHECKED_IN
                                 booking_id=bkg-001
                                 actual_start_at=14:05       ← giờ thực tế, có thể trễ
                                 planned_end_at=16:00
                                 checked_in_by=staff-Nam

session_participants   sp-001: booking_participant_id=bp-001, role=DRIVER, checked_in_at=14:05
                       sp-002: booking_participant_id=bp-002, role=PLAYER, checked_in_at=14:05
                       ← bp-003 (Tuấn) không đến → KHÔNG tạo session_participant
                       ← có thể thêm người mới không có trong booking_participants

session_vehicles       sv-001: vehicle_id=Traxxas, assigned_to=sp-001
                               vehicle_source=RENTAL, status=IN_USE
                               started_at=14:05
                       ← BYOC: customer_vehicle_id=cv-001 thay vì vehicle_id

inspections            insp-001: type=CHECK_IN, session_vehicle_id=sv-001
                                 pre_existing_flag=false
                                 damage_noted=false

inspection_photos      4 rows: angle=FRONT/BACK/LEFT/RIGHT, url=cdn/...
inspection_checklists  N rows: item_key=body_scratch/tire/antenna..., status=OK

               │ Customer confirm trong 15 phút (hoặc auto-confirm)
               ▼
sessions               status CHECKED_IN → ACTIVE
```

---

## Phase 4 — Session đang diễn ra

### Case: Gia hạn thêm giờ

```
Lúc 15:45 — còn 15 phút, Staff đề xuất gia hạn
                       │
                       ▼
extension_proposals    ext-001: session_id=sess-001
                                proposed_by=staff-Nam
                                duration_minutes=30
                                fee_amount=75k
                                status=PENDING

               │ Khách approve (10 phút, không approve → auto EXPIRED)
               ├──────────────────────────────────────────────────────►
               │ ✓ APPROVED                        ✗ REJECTED / EXPIRED
               ▼                                               │
extension_proposals    status=APPROVED              extension_proposals  status=REJECTED
                       responded_by=user-Minh        sessions             không đổi
                       responded_at=15:46

sessions               planned_end_at: 16:00 → 16:30
                       status → EXTENDING

payment_components     pc-005: type=EXTENSION_FEE    ← thêm row mới
                               amount=75k
                               status=PENDING            ← charge cùng lúc checkout, không charge ngay

← KHÔNG tạo payment_transaction riêng cho extension
```

---

### Case: Gọi F&B tại quán

```
Trong lúc chơi, khách gọi thêm đồ uống
                       │
                       ▼
fnb_orders             fo-002: type=ON_SITE
                               booking_id=bkg-001
                               session_id=sess-001
                               created_by=staff-Nam
                               status=PENDING → DELIVERED

fnb_order_items        item=Cà phê sữa, qty=1, unit_price_snapshot=35k

← KHÔNG tạo payment_components (khách trả tiền mặt thẳng cho quán)
← platform KHÔNG thu phí F&B on-site
← sessions.actual_total_amount KHÔNG cộng thêm khoản này
```

---

## Phase 5 — Check-out & Thanh toán cuối cùng

> Tại bước này, customer thanh toán toàn bộ chi phí thực tế:
> - **txn-002: CAPTURE** slot + rental + F&B + extension → disbursed về Provider
> - **Cọc (deposit)**: VOID nếu không damage (hold released), CAPTURE nếu có damage
> - **Không có refund transaction** — cọc không hoàn, chỉ release hold hoặc capture cho damage.

### Case: Không có damage

```
Staff check-out cuối session
                       │
                       ▼
inspections            insp-002: type=CHECK_OUT, session_vehicle_id=sv-001
                                 damage_noted=false
                                 customer_confirmed=true
                                 customer_confirmed_at=16:35

session_vehicles       sv-001: status=RETURNED, returned_at=16:35

sessions               actual_end_at=16:35
                       actual_total_amount=485k  ← slot(50)+rental(300)+F&B(60)+ext(75)
                       status=COMPLETED
                       checked_out_by=staff-Nam

                       ← checkout_amount = 485k − 300k cọc = 185k

payment_transactions   txn-002: type=CAPTURE, amount=185k  ← chỉ charge phần còn lại sau khi trừ cọc

payment_components     pc-001 SLOT_FEE:         PENDING → DISBURSED → Provider
                       pc-002 RENTAL_FEE:        PENDING → DISBURSED → Provider
                       pc-003 SECURITY_DEPOSIT:  HELD → DISBURSED   → applied (khấu trừ vào tổng)
                       pc-004 FNB_PREORDER:      PENDING → DISBURSED → Provider
                       pc-005 EXTENSION_FEE:     PENDING → DISBURSED → Provider
                       ← Tổng Provider nhận: 485k (300k từ deposit + 185k từ checkout)

bookings               status=COMPLETED

trust_score_logs       delta=+2, reason=BOOKING_STREAK  ← nếu đủ điều kiện

reviews                ← mở khoá, khách có thể để lại đánh giá
```

---

### Case: Có damage, khách đồng ý

```
Staff phát hiện xước xe khi check-out
                       │
                       ▼
inspections            insp-002: type=CHECK_OUT
                                 damage_noted=true
                                 damage_description="Xước hông phải"
                                 damage_cost_estimate=200k

incidents              inc-001: type=RENTAL_DAMAGE
                                session_id=sess-001
                                responsible_party=CUSTOMER
                                estimated_amount=200k
                                status=RECORDED

               │ Khách xem ảnh, bấm xác nhận
               ▼
inspections            customer_confirmed=true
incidents              final_amount=200k
                       status=RESOLVED
                       resolution_note="Khách đồng ý bồi thường"
                       resolved_by=staff-Nam

payment_components     pc-006: type=DAMAGE_CHARGE, amount=300k  ← damage_cost = 200k × 1.5

sessions               actual_total_amount=785k  ← 485k chi phí + 300k damage
                       status=COMPLETED

                       ← checkout_amount = 785k − 300k cọc = 485k

payment_transactions   txn-002: type=CAPTURE, amount=485k  ← charge phần còn lại sau trừ cọc

payment_components     pc-001 SLOT_FEE:         PENDING → DISBURSED → Provider
                       pc-002 RENTAL_FEE:        PENDING → DISBURSED → Provider
                       pc-003 SECURITY_DEPOSIT:  HELD → DISBURSED   → applied (khấu trừ vào tổng)
                       pc-004 FNB_PREORDER:      PENDING → DISBURSED → Provider
                       pc-005 EXTENSION_FEE:     PENDING → DISBURSED → Provider
                       pc-006 DAMAGE_CHARGE:     PENDING → DISBURSED → Provider
                       ← Tổng Provider nhận: 785k (300k từ deposit + 485k từ checkout)

trust_score_logs       delta=-10, reason=DAMAGE_CONFIRMED  ← trừ điểm uy tín
```

---

### Case: Có damage, khách tranh chấp

```
Khách không đồng ý với kết quả damage
                       │
                       ▼
disputes               disp-001: booking_id=bkg-001
                                 opened_by=user-Minh
                                 reason="Vết xước này có sẵn từ trước"
                                 evidence_photos=["cdn/...khach-chup.jpg"]
                                 status=OPEN

sessions               status=COMPLETED  ← session vẫn kết thúc bình thường

payment_components     pc-003 SECURITY_DEPOSIT: vẫn HELD  ← chưa xử lý, chờ Admin

               │ Admin (team RCField) xem xét ảnh check-in vs check-out
               │
               ├──────────────────────┬──────────────────────────────────
               │ Favor: PROVIDER       │ Favor: CUSTOMER
               ▼                      ▼
disputes       status=RESOLVED        disputes       status=RESOLVED
               resolution_favor       resolution_favor
                 =PROVIDER              =CUSTOMER

                                      payment_components (Customer win)
  txn-002: CAPTURE (785k−300k)=485k     txn-002: CAPTURE (485k−300k)=185k
  tất cả components → DISBURSED         tất cả (không có DAMAGE_CHARGE) → DISBURSED
  Provider nhận: 785k                   Provider nhận: 485k

trust_score_logs                      trust_score_logs
  delta=-10 DAMAGE_CONFIRMED            ← không trừ điểm
                                        ← có thể +điểm nếu Admin xét đúng
```

---

## Unhappy paths

### Case: No-show (không đến)

```
Khách đặt lịch, thanh toán, nhưng không đến check-in
                       │
                       │ slot_start + 30 phút, vẫn chưa check-in
                       │ cron job chạy mỗi 5 phút
                       ▼
bookings               status=NO_SHOW

payment_transactions   txn-noshow: type=PAYMENT, amount=50k  ← charge slot_fee (phạt no-show)

payment_components     pc-001 SLOT_FEE:         PENDING → DISBURSED → Provider (phạt no-show)
                       pc-002 RENTAL_FEE:        PENDING → CANCELLED ← không charge (xe chưa dùng)
                       pc-003 SECURITY_DEPOSIT:  HELD    → VOID      ← hold released (không damage)
                       pc-004 FNB_PREORDER:      PENDING → CANCELLED ← không charge

← Không có refund transaction

trust_score_logs       delta=-15, reason=NO_SHOW  ← trừ điểm nặng

← KHÔNG tạo sessions (không check-in)
← KHÔNG tạo reviews
```

---

### Case: Khách huỷ trước khi thanh toán

```
Khách tạo booking nhưng chưa thanh toán, tự bấm huỷ
(hoặc hết 30 phút payment_expires_at)
                       │
                       ▼
bookings               status=CANCELLED
                       cancelled_by=user-Minh (hoặc system nếu timeout)
                       cancelled_at=now()
                       cancellation_reason="Customer cancelled" / "Payment timeout"

payment_components     status=PENDING → CANCELLED
                       ← deposit chưa charged → không cần void

payment_transactions   ← KHÔNG tạo

trust_score_logs       ← KHÔNG ảnh hưởng (huỷ trước thanh toán = bình thường)
```

---

### Case: Khách huỷ sau khi đã thanh toán

```
Khách đã CONFIRMED, muốn huỷ trước giờ chơi
                       │
                       ▼  áp refund policy (xem spec/03-payment-engine.md)

bookings               status=CANCELLED
                       cancelled_by=user-Minh

               Huỷ > 24h trước:              Huỷ < 12h trước:
               ─────────────────             ────────────────────
payment_components     SLOT_FEE: CANCELLED   SLOT_FEE:   charge (phạt)
                                             txn: PAYMENT slot_fee → DISBURSED Provider
                       RENTAL: CANCELLED     RENTAL:     CANCELLED
                       DEPOSIT: VOID         DEPOSIT:    VOID (hold released)
                         (hold released)
                       FNB: CANCELLED        FNB:        CANCELLED

← Không có refund transaction   ← Không có refund transaction
```

---

## Giải thích bảng

### Booking & Planning

| Bảng | Ý nghĩa |
|---|---|
| `bookings` | Hợp đồng gốc — snapshot giá tại thời điểm đặt, bất biến. Không chứa dữ liệu vận hành thực tế. Chỉ `status` thay đổi theo vòng đời. |
| `booking_participants` | Danh sách người dự kiến khai khi đặt lịch. Có thể khác thực tế khi check-in. |
| `booking_vehicles` | Xe thuê dự kiến (chỉ RENTAL). Snapshot giá tại thời điểm đặt. |

### Payment

| Bảng | Ý nghĩa |
|---|---|
| `payment_components` | **Ledger bất biến** — mỗi khoản tiền là 1 row độc lập với status riêng. Không bao giờ sửa `amount`, chỉ thêm row mới (gia hạn, damage). Dùng để tính doanh thu. |
| `payment_transactions` | Log raw từ gateway — lưu request/response gốc để audit & reconcile. Tách biệt với ledger. |

### Session & Thực tế

| Bảng | Ý nghĩa |
|---|---|
| `sessions` | Nhật ký thực tế — chỉ tạo khi Staff check-in. Lưu giờ thực tế, gia hạn, tổng tiền thực. |
| `session_participants` | Người thực sự có mặt — có thể thiếu người so với booking, hoặc thêm người mới. |
| `session_vehicles` | Xe thực tế dùng — hỗ trợ cả RENTAL (`vehicle_id`) và BYOC (`customer_vehicle_id`). |

### Inspection & Evidence

| Bảng | Ý nghĩa |
|---|---|
| `inspections` | Biên bản kiểm tra xe tại check-in và check-out. Là bằng chứng pháp lý khi tranh chấp. |
| `inspection_photos` | Mỗi góc chụp (FRONT/BACK/LEFT/RIGHT) là 1 row — so sánh trước/sau dễ dàng. |
| `inspection_checklists` | Từng hạng mục kiểm tra (xước, nứt, thiếu phụ kiện...) — mỗi item 1 row. |

### Extension & F&B

| Bảng | Ý nghĩa |
|---|---|
| `extension_proposals` | Đề xuất gia hạn — Staff gửi, Customer approve trong 10 phút. Auto EXPIRED nếu không phản hồi. |
| `fnb_orders` | F&B preorder (gộp thanh toán) hoặc on-site (tiền mặt tại quán, ngoài platform). |
| `fnb_order_items` | Từng món — snapshot tên/giá tại thời điểm order. |

### Incident & Dispute

| Bảng | Ý nghĩa |
|---|---|
| `incidents` | Log sự cố vận hành — hư hỏng, va chạm, mất phụ kiện. Ghi `responsible_party` và `final_amount`. |
| `disputes` | Tranh chấp chính thức khi khách không đồng ý damage. Max 1 dispute/booking, Admin xét xử. |

### Audit & Trust

| Bảng | Ý nghĩa |
|---|---|
| `trust_score_logs` | Lịch sử điểm uy tín — no-show/damage trừ điểm, booking streak cộng điểm. Ảnh hưởng quyền thuê xe tier RESTRICTED. |
| `reviews` | Chỉ mở khoá khi booking COMPLETED. Provider không thể xoá, chỉ ẩn nếu vi phạm. |

### Package / Subscription

| Bảng | Ý nghĩa |
|---|---|
| `packages` | Gói slot chơi (VD: 10 slot giá 1.2M) — Provider tạo per cafe. |
| `customer_packages` | Gói đã mua của từng khách — theo dõi `remaining_slots`. |
| `package_usages` | Mỗi lần dùng gói = 1 row liên kết `customer_package` ↔ `booking`. |
| `subscriptions` | Đặt lịch định kỳ (VD: thứ 7 hàng tuần 14:00) — system tự tạo booking mỗi tuần. |

---

## Ký hiệu

| Ký hiệu | Ý nghĩa |
|---|---|
| `✓` | Happy path |
| `✗` | Unhappy / edge case |
| `···` | Optional step |
| `→` | Status chuyển sang |
| `HELD / DISBURSED / REFUNDED` | Trạng thái `payment_components` |
| `CHECKED_IN / ACTIVE / COMPLETED` | Trạng thái `sessions` |
