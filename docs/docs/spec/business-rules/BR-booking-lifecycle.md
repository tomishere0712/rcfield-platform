# BR-Booking Lifecycle — Luong nghiep vu booking end-to-end

**Last updated**: 2026-06-04  
**Status**: Draft for business review  
**Owner**: Product/Backend/Operations

> Tai lieu nay dong vai tro "business operating rule" cho toan bo luong booking:
> dat gio, thue xe, check-in bang ma, vao san choi, order F&B tai quan,
> gia han gio choi, check-out, damage, settlement.
>
> Tai lieu nay khong thay the cac rule domain hien co. No noi cac domain lai thanh
> mot luong van hanh lien tuc de FE/BE/QA/Operations cung doc duoc.

---

## 1. Source of truth

| Nguon | Noi dung dung de suy luan |
|---|---|
| `docs/spec/00-overview.md` | Phase 1 scope, Booking/Session separation, actors |
| `docs/spec/01-domain-model.md` | Entity, enum, quan he Booking - Session - Payment - F&B |
| `docs/spec/02-state-machine.md` | BookingStatus, SessionStatus, timeout |
| `docs/spec/03-payment-engine.md` | Component-based payment, checkout, damage (KHONG con deposit) |
| `docs/spec/04-inspection-flow.md` | Check-in/check-out inspection, evidence, customer confirm |
| `docs/spec/06-database.md` | Package, customer_package schema (bang package_usages va subscriptions da bi xoa) |
| `docs/spec/business-rules/BR-booking.md` | Slot, availability, cancellation, no-show |
| `docs/spec/business-rules/BR-fleet.md` | Vehicle status, tier, track compatibility |
| `docs/spec/business-rules/BR-fnb.md` | F&B pre-order va on-site |
| `docs/spec/business-rules/BR-extension.md` | Gia han slot trong session |
| `docs/architecture/01-booking-session.md` | Planned vs actual architecture |

---

## 2. Nguyen tac thiet ke nghiep vu

**BR-BL-001 — Booking la ke hoach, Session la thuc te**  
IF: Customer tao don dat lich  
THEN: He thong tao `Booking` de giu ke hoach: cafe, slot, mode, participants du kien, rental vehicles du kien, gia snapshot.  
NOTE: Khong xem Booking la "dang choi". Khach chi thuc su vao san khi Staff check-in va tao `Session`.

**BR-BL-002 — Khong bao gio luu xe thuc te truc tiep tren Booking**  
IF: Booking co thue xe cua quan  
THEN: Xe du kien nam trong `booking_vehicles`.  
IF: Khach mang xe rieng  
THEN: Xe BYOC chi duoc chot khi check-in qua `session_vehicles.customer_vehicle_id`.

**BR-BL-003 — Check-in phai qua Staff**  
IF: Booking da `CONFIRMED` va customer den quan  
THEN: Staff quet ma/nhap ma booking, kiem tra booking hop le, tao `Session(status=CHECKED_IN)`, ghi nhan nguoi/xe thuc te, thuc hien inspection dau vao.  
NOTE: Customer khong tu chuyen booking sang ACTIVE.

**BR-BL-004 — Evidence la dieu kien de tinh damage**  
IF: Provider muon tinh `DAMAGE_CHARGE`  
THEN: Phai co inspection check-in va check-out hop le: co anh va checklist, baseline duoc customer xac nhan. Khong co co che tu dong xac nhan.  
NOTE: Thieu evidence hop le thi Provider mat co so tinh damage.

**BR-BL-005 — Payment settlement theo Session**  
IF: Session hoan tat check-out  
THEN: `PaymentEngine.settle(sessionId)` xu ly component cua phien do.  
NOTE: Booking chi chuyen `COMPLETED` khi tat ca sessions cua booking da `COMPLETED`.

---

## 3. Phan tach cac luong chinh

### 3.1 Ba booking modes can tach rieng

RCField co 3 cach dat lich, nhung sau khi booking da `CONFIRMED` thi luong
van hanh tai quan van giong nhau: Staff check-in, tao Session, inspection,
vao san, co the order F&B/gia han, check-out va settlement.

| Booking mode | Ten nghiep vu | Ai tao booking | Cach tinh tien slot | Khi nao het quyen dung |
|---|---|---|---|---|
| `SINGLE` | Dat binh thuong | Customer/Staff tao tung don | Tra theo tung booking | Don do completed/cancelled/no-show |
| `PACKAGE` | Dat bang goi slot da mua | Customer chon ngay/gio moi lan dung goi | Tru `remaining_slots` cua `customer_packages` | Khi remaining_slots = 0, het han, hoac goi bi cancelled |
| `SUBSCRIPTION` | Dat theo lich co dinh | System sinh booking tu `subscriptions.frequency_rule` | Tuy goi thoa thuan: charge tung ky hoac tao booking confirmed theo policy | Khi subscription paused/cancelled/expired hoac den `ends_at` |

```mermaid
flowchart TD
    A([Customer muon choi RC]) --> B{Chon booking_mode}
    B -->|SINGLE| C[Dat tung lan]
    B -->|PACKAGE| D[Dung goi slot da mua]
    B -->|SUBSCRIPTION| E[Lich choi co dinh]

    C --> C1[Chon cafe, track, slot, play_mode]
    C1 --> C2[Lock availability]
    C2 --> C3[Booking PENDING]
    C3 --> C4["Payment confirm -> CONFIRMED"]

    D --> D1[Chon customer_package ACTIVE]
    D1 --> D2["Check remaining_slots >= booking.slot_count"]
    D2 --> D3[Lock availability]
    D3 --> D4[Tru remaining_slots cua customer_package]
    D4 --> D5[Booking PENDING cho thanh toan]

    E --> E1[Customer tao subscription]
    E1 --> E2[System generate booking theo frequency_rule]
    E2 --> E3[Check availability truoc tung occurrence]
    E3 --> E4[Booking CONFIRMED/PENDING hoac NEEDS_ACTION]

    C4 --> Z[Check-in/session flow]
    D5 --> Z
    E4 --> Z
```

**BR-BL-006 — Booking mode khong thay doi session protocol**  
IF: Booking da duoc xac nhan du dieu kien vao san  
THEN: `SINGLE`, `PACKAGE`, `SUBSCRIPTION` deu di qua cung luong Staff check-in -> Session -> inspection -> active -> checkout.

**BR-BL-007 — Availability luon la bat buoc**  
IF: Customer dung package hoac lich dinh ky  
THEN: He thong van phai check slot, rental vehicle, BYOC capacity, cafe closure va operating hours nhu booking binh thuong.  
NOTE: Mua goi/lap lich truoc khong co nghia la duoc chen vao slot da full.

**BR-BL-008 — Snapshot phai ghi booking mode source**  
IF: Tao booking  
THEN: `booking.snapshot` phai ghi `booking_mode`, gia tai thoi diem tao booking, package/subscription policy neu co, va cac fee khong duoc cover boi goi.

**BR-BL-009 — Payment va entitlement la hai lop rieng**  
IF: Customer co quyen dung goi hoac lich co dinh  
THEN: Quyen dat lich chi xac dinh "co duoc tao booking khong"; rental fee, F&B, extension, damage van tinh theo policy rieng.

---

### 3.2 Luong A — Dat binh thuong (`booking_mode = SINGLE`)

Day la luong can uu tien trong Phase 1 vi gom du booking, rental fleet,
inspection, session va settlement.

```mermaid
flowchart TD
    A([Customer chon cafe]) --> B[Chon track type]
    B --> C[Chon slot_start va slot_count]
    C --> D[Chon rental vehicles]
    D --> E{Xe va slot available?}
    E -->|Khong| E1[Tu choi SLOT_CONFLICT]
    E -->|Co| F[Tao Booking PENDING]
    F --> G[Tao booking_participants va booking_vehicles]
    G --> H[Tao payment components tu snapshot]
    H --> I{Thanh toan truoc payment_expires_at?}
    I -->|Fail/timeout| I1[Booking CANCELLED, release slot]
    I -->|Success| J[Booking CONFIRMED]
    J --> K[Customer den quan]
    K --> L[Staff quet ma booking]
    L --> M[Tao Session CHECKED_IN]
    M --> N[Gan session_participants va session_vehicles]
    N --> O[Inspection CHECK_IN]
    O --> P{Customer confirm baseline?}
    P -->|Customer confirm| Q[Session ACTIVE]
    Q --> R[Customer vao san choi]
    R --> S{Trong khi choi}
    S -->|Order F&B| T[F&B ON_SITE]
    S -->|Gia han| U[Extension proposal]
    S -->|Het gio| V[Check-out]
    T --> S
    U --> S
    V --> W[Inspection CHECK_OUT]
    W --> X{Damage moi?}
    X -->|Khong| Y[Staff hoan tat check-out]
    X -->|Co| Z[Customer confirm hoac phan doi]
    Y --> AA[Settle session]
    Z --> AA
    AA --> AB[Session COMPLETED]
    AB --> AC{Tat ca sessions done?}
    AC -->|Co| AD[Booking COMPLETED]
    AC -->|Chua| AE[Booking van CONFIRMED]
```

**BR-BL-010 — Dieu kien tao Booking rental**  
IF: Customer chon xe rental  
THEN: Moi xe phai `AVAILABLE`, khong overlap voi booking `PENDING/CONFIRMED`, va compatible voi `track_type` da chon.

**BR-BL-011 — Thanh toan truoc khi den quan**  
IF: Booking vua tao  
THEN: Booking o `PENDING`, slot bi lock toi `payment_expires_at`, payment phai thanh cong de chuyen `CONFIRMED`.  
NOTE: Khach tra truoc MOT lan (slot + rental + F&B preorder + le phi giai). Phi gia han, F&B tai quan va damage thu them o checkout.

**BR-BL-012 — QR/code check-in**  
IF: Customer den quan  
THEN: Staff quet QR hoac nhap booking code. System chi cho check-in khi:
- Booking thuoc cafe cua Staff.
- Booking `status = CONFIRMED`.
- Thoi gian hien tai nam trong cua so check-in cho phep.
- Chua co session dang `CHECKED_IN`, `ACTIVE`, `EXTENDING`, `CHECKING_OUT` cho cung booking neu chinh sach chi cho mot session dong thoi.

**BR-BL-013 — Tao Session khi check-in**  
IF: Staff check-in thanh cong  
THEN: System tao `sessions(status=CHECKED_IN)`, copy planned participants sang actual participants neu co mat, tao `session_vehicles` tu xe rental thuc te va doi `vehicle.status -> IN_USE`.

**BR-BL-014 — Xe thuc te co the khac xe du kien**  
IF: Xe du kien hong, dang bao tri, hoac Staff doi xe cho khach  
THEN: `session_vehicles.vehicle_id` co the khac `booking_vehicles.vehicle_id`, nhung phai ghi note/audit va xe thay the phai `AVAILABLE`.

**BR-BL-015 — Vao san chi sau khi baseline duoc confirm**  
IF: Check-in inspection da du anh/checklist va customer confirm hoac qua timeout 15 phut  
THEN: Session chuyen `ACTIVE`, customer duoc vao san choi.

---

### 3.3 Luong B — Dung goi slot da mua (`booking_mode = PACKAGE`)

Goi slot la san pham Provider tao theo tung chi nhanh. Vi du: Cafe A ban goi
10 slot, gia 1,200,000 VND, han dung 60 ngay, ap dung cho `RENTAL` va `BYOC`.
Customer mua goi truoc, sau do moi lan dat lich se tru slot tu goi.

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant App as Web App
    participant API as API
    participant DB as DB
    participant Pay as Payment Gateway

    C->>App: Chon goi 10 slot cua Cafe A
    App->>API: POST /packages/:id/purchase
    API->>DB: Validate package ACTIVE, cafe ACTIVE
    API->>Pay: Tao payment PACKAGE_PURCHASE
    Pay-->>API: Payment success
    API->>DB: INSERT customer_packages(remaining_slots=10)
    API-->>App: Goi da active

    C->>App: Dung goi dat lich 2 slot luc 10:00-12:00
    App->>API: POST /bookings booking_mode=PACKAGE
    API->>DB: Lock customer_package row
    API->>DB: Check remaining_slots >= 2, not expired
    API->>DB: Check slot/vehicle/BYOC availability
    API->>DB: INSERT bookings(PENDING)
    API->>DB: customer_packages.remaining_slots 10 -> 8
    API->>Pay: Thu truoc slot_fee + rental_fee + fnb_preorder
    Pay-->>API: Payment success
    API-->>App: Booking confirmed, remaining_slots=8
```

**BR-BL-020 — Provider tao package theo chi nhanh**  
IF: Provider tao goi slot  
THEN: `packages.cafe_id` bat buoc thuoc chi nhanh do; customer chi dung goi tai chi nhanh da mua.  
NOTE: Phase 1 khong nen cho goi dung cross-branch vi se lam phuc tap doanh thu va capacity.

**BR-BL-021 — CustomerPackage la quyen su dung slot**  
IF: Customer mua package thanh cong  
THEN: Tao `customer_packages` voi `remaining_slots = packages.slot_count`, `expires_at = purchased_at + valid_days`, `status = ACTIVE`.

**BR-BL-022 — Dung package tru theo slot_count cua booking**  
IF: Customer dung package de dat lich  
THEN: `used_slots = booking.slot_count`; he thong tru `customer_packages.remaining_slots -= used_slots`.

**BR-BL-023 — Khong du slot trong goi thi tu choi booking**  
IF: `remaining_slots < booking.slot_count`  
THEN: Tu choi tao booking voi loi `PACKAGE_NOT_ENOUGH_SLOTS`.

**BR-BL-024 — Het slot thi goi DEPLETED**  
IF: Sau khi tru slot, `remaining_slots = 0`  
THEN: `customer_packages.status -> DEPLETED`; customer khong dung goi nay de dat booking moi.

**BR-BL-025 — Goi het han thi khong duoc dung**  
IF: `now() > customer_packages.expires_at`  
THEN: `customer_packages.status -> EXPIRED`; khong cho tao booking PACKAGE moi.

**BR-BL-026 — PackageUsage la audit bat buoc**  
IF: `booking.booking_mode = PACKAGE`  
THEN: Ghi nhan lan dung goi. LUU Y: bang `package_usages` da bi xoa khoi DB; hien tai chi tru `customer_packages.remaining_slots`.  
NOTE: Khong chi update remaining_slots, vi can audit tung lan khach da dung goi.

**BR-BL-027 — Rollback slot goi khi booking khong thanh cong**  
IF: Booking PACKAGE fail payment, bi cancel truoc check-in theo policy duoc hoan slot, hoac system rollback transaction  
THEN: Phai hoan lai `remaining_slots`.  
NOTE: Khong con bang `package_usages` de mark void; viec hoan slot ghi truc tiep tren `customer_packages`.

**BR-BL-028 — Package cover fee can snapshot ro**  
IF: Package cover `SLOT_FEE` hoac cover them `RENTAL_FEE`  
THEN: `booking.snapshot.package_coverage` phai ghi ro component nao duoc cover.  
NOTE: De giam scope, khuyen nghi Phase 1: goi 10 slot cover `SLOT_FEE`; rental/F&B/extension/damage tinh rieng. Neu mentor muon goi cover ca rental, can them policy ro tren package snapshot.

**Vi du PACKAGE 10 slot**

```text
Package: 10 slot, gia 1,200,000, valid 60 ngay
CustomerPackage: remaining_slots = 10

Lan 1: dat 10:00-12:00, slot_count=2
  used_slots = 2
  remaining_slots: 10 -> 8

Lan 2: dat 14:00-17:00, slot_count=3
  used_slots = 3
  remaining_slots: 8 -> 5

Lan 3: dat 09:00-14:00, slot_count=5
  used_slots = 5
  remaining_slots: 5 -> 0
  customer_package.status = DEPLETED
```

---

### 3.4 Luong C — Dat theo lich co dinh (`booking_mode = SUBSCRIPTION`)

Lich co dinh la "customer muon choi theo chu ky", vi du moi Thu Bay 14:00-16:00
trong 8 tuan tai Cafe A. `Subscription` khong phai booking; no la rule sinh booking.

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant App as Web App
    participant API as API
    participant DB as DB
    participant Job as Scheduler Job
    participant Staff as Staff App

    C->>App: Chon lich co dinh Thu Bay 14:00-16:00 trong 8 tuan
    App->>API: POST /subscriptions
    API->>DB: Validate cafe, play_mode, track_type, frequency_rule
    API->>DB: Check first occurrence availability
    API->>DB: INSERT subscriptions(status=ACTIVE)
    API-->>App: Subscription active

    Job->>DB: Moi ngay quet subscriptions ACTIVE
    Job->>DB: Tinh occurrence tiep theo theo frequency_rule
    Job->>DB: Check cafe closure, operating hours, slot/vehicle/BYOC availability
    alt Available
        Job->>DB: INSERT booking(source=SYSTEM_SUBSCRIPTION, booking_mode=SUBSCRIPTION, subscription_id)
        Job->>DB: Booking CONFIRMED or PENDING payment theo policy
        Job-->>C: Notify booking generated
        Job-->>Staff: Booking xuat hien trong lich chi nhanh
    else Conflict or cafe closed
        Job->>DB: Khong tao booking, ghi notification/action required
        Job-->>C: De nghi chon slot thay the
    end
```

**BR-BL-030 — Subscription la rule sinh booking**  
IF: Customer tao lich co dinh  
THEN: Tao row `subscriptions`; khong dung row nay de check-in. Moi lan choi phai co mot `booking` rieng duoc sinh tu subscription.

**BR-BL-031 — Booking sinh tu subscription phai co subscription_id**  
IF: Booking duoc sinh boi lich co dinh  
THEN: `booking.booking_mode = SUBSCRIPTION`, `booking.source = SYSTEM_SUBSCRIPTION`, va `booking.subscription_id` bat buoc co gia tri.

**BR-BL-032 — Scheduler phai check availability tung lan sinh booking**  
IF: Scheduler sap sinh occurrence moi  
THEN: Phai check cafe open, cafe_closures, slot boundary, rental vehicle availability, BYOC capacity va track type.  
NOTE: Chi check luc tao subscription la chua du, vi tuong lai co the co booking khac, xe maintenance, hoac ngay dong cua.

**BR-BL-033 — Conflict khong duoc tu dong chen lich**  
IF: Occurrence bi conflict  
THEN: Khong tao booking `CONFIRMED`; he thong tao notification/action required de customer/staff chon slot khac.  
NOTE: Tranh viec lich co dinh lam double-booking.

**BR-BL-034 — Subscription cancellation khong xoa booking da sinh**  
IF: Customer cancel/pause subscription  
THEN: Khong sinh booking moi trong tuong lai; booking da sinh van theo cancellation/no-show rule rieng.

**BR-BL-035 — Subscription payment policy can chot**  
IF: Subscription co thu phi truoc theo ky  
THEN: Snapshot phai ghi ky thanh toan va booking sinh ra co the `CONFIRMED` neu ky da paid.  
IF: Subscription chi la lich giu cho khach quen  
THEN: Moi booking sinh ra co the `PENDING` va customer thanh toan trong payment window.  
NOTE: Khuyen nghi cho team 4 nguoi: Phase 1 de subscription la lich co dinh sinh booking `PENDING/CONFIRMED` theo mock policy, khong lam billing recurring phuc tap.

**BR-BL-036 — Fixed schedule khong thay the package**  
IF: Customer vua co package vua muon lich co dinh  
THEN: Can chot policy: subscription occurrence co the tru package neu customer chon `customer_package_id`, hoac chi dung SINGLE payment.  
NOTE: De giam scope, Phase 1 nen tach: PACKAGE la dat thu cong bang so slot; SUBSCRIPTION la lich co dinh, payment theo tung booking.

**Vi du SUBSCRIPTION lich co dinh**

```text
Subscription: Cafe A, Thu Bay hang tuan, 14:00-16:00, slot_count=2, 8 tuan

Tuan 1: slot available
  -> tao Booking SUBSCRIPTION BK-001, slot_count=2, status=CONFIRMED/PENDING

Tuan 2: xe rental du kien dang MAINTENANCE
  -> khong auto-confirm
  -> notify Customer/Staff: chon xe khac hoac slot khac

Tuan 3: cafe co cafe_closure
  -> khong tao booking
  -> notify customer ve ngay nghi
```

---

### 3.5 Luong D — Booking co F&B pre-order

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant App as Web App
    participant API as API
    participant DB as DB
    participant Staff as Staff

    C->>App: Chon slot, xe, F&B pre-order
    App->>API: POST /bookings kem fnb_items
    API->>DB: Tao Booking PENDING + FnbOrder PRE_ORDER
    API->>DB: Tao PaymentComponent FNB_PREORDER
    C->>API: Thanh toan booking
    API->>DB: Booking CONFIRMED
    Staff->>API: Check-in booking
    API->>DB: Tao Session CHECKED_IN
    Staff->>API: Confirm da chuan bi pre-order
    API->>DB: FnbOrder CONFIRMED/PREPARING/DELIVERED theo van hanh
```

**BR-BL-040 — F&B pre-order gan Booking**  
IF: Customer dat mon truoc khi den  
THEN: `FnbOrder(type=PRE_ORDER)` gan voi `booking_id`, co the tao cung Booking.  
NOTE: Pre-order la mot phan cua ke hoach dat lich.

**BR-BL-041 — Staff xac nhan pre-order tai check-in**  
IF: Booking co F&B pre-order  
THEN: Man hinh check-in cua Staff phai hien danh sach mon de xac nhan chuan bi/giao cho customer.

**BR-BL-042 — Platform fee tren F&B**  
IF: Thanh toan co F&B  
THEN: Platform fee = 0% tren F&B theo `BR-FnB`; payment engine can tach component de audit ro.

---

### 3.6 Luong E — Order F&B trong luc dang choi

```mermaid
sequenceDiagram
    autonumber
    participant C as Customer
    participant Staff as Staff
    participant API as API
    participant DB as DB

    C->>Staff: Goi them do an/do uong
    Staff->>API: Tao FnbOrder ON_SITE cho session dang ACTIVE
    API->>DB: INSERT fnb_orders(booking_id, session_id, type=ON_SITE)
    API->>DB: INSERT fnb_order_items voi price snapshot
    Staff->>C: Giao mon
    C->>Staff: Thanh toan truc tiep cho quan
    Staff->>API: Cap nhat order DELIVERED/CANCELLED
```

**BR-BL-050 — On-site F&B chi tao trong Session hop le**  
IF: Customer order tai quan  
THEN: Session phai dang `ACTIVE` hoac theo chinh sach van hanh cho phep trong `CHECKING_OUT`.  
NOTE: Khong tao on-site order cho booking chua check-in.

**BR-BL-051 — On-site F&B khong qua payment gateway platform**  
IF: F&B la `ON_SITE`  
THEN: Customer thanh toan truc tiep cho Provider; platform chi ghi order/audit, khong thu ho va khong tinh platform fee.

---

### 3.7 Luong F — Gia han gio choi

```mermaid
sequenceDiagram
    autonumber
    participant Staff as Staff
    participant API as API
    participant DB as DB
    participant C as Customer

    Staff->>API: De xuat gia han session ACTIVE
    API->>DB: Check session ACTIVE va extension fee cap
    alt Hop le
        API->>DB: Session ACTIVE -> EXTENDING
        API->>DB: Tao ExtensionProposal PENDING
        API-->>C: Notify approve/reject
        alt Customer approve
            C->>API: Approve
            API->>DB: Tao PaymentComponent EXTENSION_FEE
            API->>DB: Cap nhat planned_end_at
            API->>DB: Session EXTENDING -> ACTIVE
        else Reject hoac timeout 10 phut
            API->>DB: Proposal REJECTED/EXPIRED
            API->>DB: Session EXTENDING -> ACTIVE
        end
    else Khong hop le
        API-->>Staff: EXTENSION_NOT_ALLOWED
    end
```

**BR-BL-060 — Chi gia han khi Session ACTIVE**  
IF: Session khong phai `ACTIVE`  
THEN: Staff khong duoc tao extension proposal.

**BR-BL-061 — Customer quyet dinh gia han**  
IF: Staff de xuat gia han  
THEN: Customer approve/reject; neu im lang 10 phut thi auto-reject va session quay lai `ACTIVE`.

**BR-BL-062 — Extension fee cap**  
IF: (quy tac cu — da bo) Tong extension fee vuot 50% security deposit  
NOTE: Khong con tran phi gia han; xem BR-EX-004.  
THEN: Tu choi gia han.

**BR-BL-063 — Extension tinh vao checkout**  
IF: Extension duoc approve  
THEN: Tao `PaymentComponent(type=EXTENSION_FEE)` va tinh vao settlement khi check-out.  
NOTE: Can chot lai voi team BE: `BR-extension.md` ghi HELD, `03-payment-engine.md` ghi PENDING. De dong bo payment engine, tai lieu nay de xuat `PENDING` cho extension fee cho den checkout.

---

### 3.8 Luong G — BYOC va MIXED

**BR-BL-070 — BYOC khong co rental fee**  
IF: Booking `play_mode = BYOC`  
THEN: Khong tao `booking_vehicles`, khong co rental fee cho fleet vehicle.  
NOTE: Van co slot fee va co the co F&B/pre-order/package/promotion.

**BR-BL-071 — BYOC capacity check khi booking**  
IF: Customer dat BYOC  
THEN: He thong check `cafe.byoc_capacity` theo slot va track type cua cafe.

**BR-BL-072 — BYOC vehicle chot khi check-in**  
IF: Customer den quan voi xe ca nhan  
THEN: Staff chon/tao `customer_vehicle`, tao `session_vehicle(vehicle_source=BYOC)`, thuc hien inspection check-in cho xe BYOC va facility baseline neu can.

**BR-BL-073 — MIXED tach rental va BYOC**  

> ⛔ **QUY TAC KHONG CON HIEU LUC.** `play_mode` chi nhan `RENTAL` hoac `BYOC`;
> cot `session_vehicles.customer_vehicle_id` da bi xoa. Nhom vua thue vua mang
> xe rieng phai tach thanh hai booking.

---

## 4. State machine tong hop

```mermaid
stateDiagram-v2
    [*] --> PENDING: create booking
    PENDING --> CONFIRMED: payment confirmed
    PENDING --> CANCELLED: payment timeout/customer cancel
    CONFIRMED --> NO_SHOW: slot_start + 30m, no session
    CONFIRMED --> CANCELLED: cancel before active session
    CONFIRMED --> COMPLETED: all sessions completed
    CANCELLED --> [*]
    NO_SHOW --> [*]
    COMPLETED --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> CHECKED_IN: staff check-in booking
    CHECKED_IN --> ACTIVE: check-in inspection confirmed
    CHECKED_IN --> CANCELLED: cancel before start
    ACTIVE --> EXTENDING: staff proposes extension
    EXTENDING --> ACTIVE: approve/reject/timeout
    ACTIVE --> CHECKING_OUT: staff starts checkout
    CHECKING_OUT --> COMPLETED: checkout confirmed/settled
    CANCELLED --> [*]
    COMPLETED --> [*]
```

---

## 5. Check-in bang QR/code

**BR-BL-080 — QR/code chi la dinh danh, khong phai quyen vao san**  
IF: Customer dua QR/code  
THEN: Staff scan de tim booking, nhung he thong van phai validate status, cafe, time window, payment va risk flags.

**BR-BL-081 — Time window check-in**  
IF: Current time < slot_start tru mot khoang early check-in cho phep  
THEN: Khong cho start session, hoac can manager override.  
IF: Current time > slot_start + 30 phut va chua co session  
THEN: Booking bi xu ly `NO_SHOW`.

**BR-BL-082 — Staff phai thuoc cafe**  
IF: Staff khong duoc assign vao cafe cua booking  
THEN: Khong duoc check-in/check-out booking do.

**BR-BL-083 — Planned vs actual participants**  
IF: Nguoi den thuc te khac danh sach dat truoc  
THEN: Staff cap nhat `session_participants`; khong sua nguoc `booking_participants` tru khi co luong edit booking rieng.

---

## 6. Check-out, damage va settlement

**BR-BL-090 — Check-out bat dau tu Session ACTIVE**  
IF: Customer het gio hoac muon dung som  
THEN: Staff chuyen session `ACTIVE -> CHECKING_OUT` va thuc hien inspection check-out.

**BR-BL-091 — Khong damage**  
IF: Check-out inspection khong co damage moi  
THEN: Staff hoan tat check-out; settlement tinh slot/rental/extension/F&B va hoan tat session. Khong co auto-confirm.

**BR-BL-092 — Co damage**  
IF: Staff danh dau damage moi  
THEN: Staff nhap mo ta, estimate cost; he thong tinh `damage_charge = tong (parts_price + labor_price)` cua damage_line_items; customer confirm hoac phan doi.  
NOTE: Khong co timeout tu dong chot tien hu hong.

**BR-BL-093 — Phan doi damage**  
IF: Customer khong dong y damage  
THEN: He thong tao incident/dispute tuy muc do; khoan damage giu o trang thai PENDING cho den khi resolved/waived.

**BR-BL-094 — Vehicle release**  
IF: Session completed va rental vehicle khong can maintenance  
THEN: `vehicle.status -> AVAILABLE`.  
IF: Damage can xu ly  
THEN: Staff/Provider co the dua xe sang `MAINTENANCE`.

---

## 7. Timeout va ket qua nghiep vu

| Trang thai | Dieu kien | Timeout | Ket qua |
|---|---|---:|---|
| Booking `PENDING` | Chua thanh toan | 30 phut | `CANCELLED`, release slot |
| Booking `CONFIRMED` | Khong co session | `slot_start + 30 phut` | `NO_SHOW` |
| Session `CHECKED_IN` | Customer chua confirm inspection | 15 phut | Auto-confirm, `ACTIVE` |
| Session `EXTENDING` | Customer chua phan hoi | 10 phut | Auto-reject, `ACTIVE` |
| Session `CHECKING_OUT` | Khong damage | 2 gio | Auto-confirm checkout |
| Session `CHECKING_OUT` | Co damage flagged | 24 gio | Auto-confirm damage charge |

---

## 8. API surface de FE/BE can map

| Nhom | Endpoint tham chieu | Actor | Ghi chu |
|---|---|---|---|
| Create booking | `POST /bookings` | Customer/Staff | Tao booking PENDING, lock slot |
| Purchase package | `POST /packages/:id/purchase` | Customer | Mua goi slot, tao `customer_packages` |
| Use package booking | `POST /bookings` voi `booking_mode=PACKAGE` | Customer/Staff | Tru `remaining_slots` |
| Create fixed schedule | `POST /subscriptions` | Customer/Staff | Tao lich co dinh, chua phai booking |
| Generate subscription bookings | Internal scheduler | System | Tao booking theo `frequency_rule` |
| Confirm payment | `POST /bookings/:id/payment/confirm` | Customer/System | Booking CONFIRMED |
| Cancel booking | `POST /bookings/:id/cancel` | Customer/Provider/Staff | Chi truoc active session |
| Staff check-in | `POST /bookings/:id/sessions/check-in` | Staff | Tao Session CHECKED_IN |
| Check-in inspection | `POST /sessions/:id/inspections/check-in` | Staff | Anh + checklist |
| Extension | `POST /sessions/:id/extensions` | Staff | Tao proposal |
| Extension response | `POST /extensions/:id/respond` | Customer | Approve/reject |
| On-site F&B | `POST /sessions/:id/fnb-orders` | Staff | Pay direct to provider |
| Check-out | `POST /sessions/:id/check-out` | Staff | ACTIVE -> CHECKING_OUT |
| Check-out inspection | `POST /sessions/:id/inspections/check-out` | Staff | Anh + checklist |
| Incident | `POST /sessions/:id/incidents` | Staff/System | Damage/dispute trigger |
| Settle | Internal `PaymentEngine.settle(sessionId)` | System | Khi checkout done |

---

## 9. Data checklist per phase

| Phase | Must create/update |
|---|---|
| Booking create | `bookings`, `booking_participants`, `booking_vehicles` neu rental, `fnb_orders` neu pre-order, `payment_components`, Redis slot lock |
| Package purchase | `packages` da ACTIVE, `payment_components(PACKAGE_PURCHASE)`, `payment_transactions`, `customer_packages` |
| Package booking | Lock `customer_packages`, tao `bookings(booking_mode=PACKAGE)`, tru `remaining_slots` |
| Subscription create | `subscriptions(status=ACTIVE)`, snapshot `frequency_rule`, notify customer |
| Subscription generate | Scheduler tao `bookings(booking_mode=SUBSCRIPTION, source=SYSTEM_SUBSCRIPTION, subscription_id)` neu available |
| Payment confirm | `payment_transactions`, `payment_components.status`, `bookings.status=CONFIRMED` |
| Check-in | `sessions`, `session_participants`, `session_vehicles`, `vehicles.status=IN_USE` voi rental |
| Check-in inspection | `inspections`, `inspection_photos`, `inspection_checklists`, customer confirmation |
| Active play | `extension_proposals`, `payment_components(EXTENSION_FEE)`, `fnb_orders(ON_SITE)` |
| Check-out | `inspections`, `inspection_photos`, `inspection_checklists`, `incidents/disputes` neu co |
| Settlement | `payment_transactions`, component statuses, vehicle release, session completed, booking completed neu all sessions done |

---

## 10. Open decisions can chot

| Decision | De xuat |
|---|---|
| Early check-in window | Cho phep scan/check-in tu `slot_start - 15 phut`; neu som hon can manager override |
| Multiple active sessions per booking | Phase 1 nen chi cho 1 session active/checking_out moi booking de giam conflict |
| Extension component status | Dung `PENDING` den checkout de dong bo `03-payment-engine.md` |
| Package coverage | Phase 1 nen cover `SLOT_FEE` only; neu cover rental thi can package policy/snapshot ro |
| Package cancellation refund | Can chot khi nao hoan slot vao `remaining_slots`: cancel som, provider cancel, payment fail |
| Subscription payment | Phase 1 nen tranh recurring billing that; moi booking sinh ra thanh toan/confirm theo mock policy |
| Subscription conflict | Khi occurrence bi conflict, khong auto-confirm; notify customer/staff chon slot thay the |
| On-site F&B trong checkout | Van ghi audit vao session, nhung khong dua vao platform settlement vi customer tra truc tiep |
| Damage dispute threshold | Damage nho xu ly `incident`; tranh chap chinh thuc hoac customer phan doi thi tao `dispute` |

---

## 11. Reference diagrams

- `docs/diagrams/sequence/sequence-flow-booking-operations.md`
- `docs/diagrams/sequence/sequence-flow-booking-lifecycle.md`
- `docs/architecture/diagrams/booking-lifecycle-flow.md`
