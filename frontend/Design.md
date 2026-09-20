# RCField / RCFieal — Product Design Specification for Stitch

**Last updated:** 2026-05-19  
**Design target:** Web app + mobile-first customer/staff flows  
**Purpose:** File này là nguồn duy nhất để Stitch hoặc AI UI/UX generator đọc, hiểu nghiệp vụ, tạo sitemap, screen, workflow, component và prototype hợp lý cho hệ thống booking sân/cafe xe RC.

---

## 0. One-line Product Vision

RCField là nền tảng đặt lịch và vận hành cafe/sân chơi xe RC, hỗ trợ đặt chỗ, thuê xe, BYOC, check-in/check-out bằng bằng chứng ảnh, thanh toán theo ledger, gia hạn phiên chơi, xử lý hư hỏng/tranh chấp, F&B, gói chơi, subscription, contest và quản trị đội xe.

Thiết kế UI/UX phải làm rõ ba lớp nghiệp vụ:

1. **Booking = kế hoạch đặt lịch dự kiến.**
2. **Session = phiên chơi thực tế tại quán.**
3. **Inspection = bằng chứng số tại lúc bàn giao và trả xe.**

Không được thiết kế UI làm người dùng hiểu nhầm rằng booking chính là phiên chơi đang diễn ra.

---

## 1. Product Context

### 1.1 Bối cảnh

Các cafe/sân chơi xe RC thường đang vận hành thủ công qua Zalo, điện thoại, sổ tay hoặc Excel. Điều này tạo ra nhiều vấn đề:

| Vấn đề | Hậu quả |
|---|---|
| Đặt lịch qua Zalo/điện thoại | Double-booking, bỏ sót booking, khó kiểm tra lịch trống |
| Không có bằng chứng bàn giao xe | Tranh chấp hư hỏng, khó tính phí damage |
| Quản lý đội xe bằng sổ tay | Xe hỏng vẫn được cho thuê, không kiểm soát bảo trì |
| Tính tiền thủ công | Sai refund, sai deposit, thất thoát doanh thu |
| Không có session thực tế | Không theo dõi khách đến trễ, về sớm, đổi xe, thêm người |
| Không có flow xử lý incident/dispute | Staff/Admin xử lý cảm tính, thiếu evidence |

### 1.2 Giải pháp

Xây dựng hệ thống web để:

- Customer tìm quán, xem sân/xe/gói, đặt lịch, thanh toán, check-in/out confirmation, khiếu nại damage, đánh giá.
- Staff vận hành tại quán bằng mobile-first UI: check-in, chụp ảnh inspection, gán xe/người thực tế, bắt đầu phiên, đề xuất gia hạn, check-out, ghi damage/incident, tạo order F&B.
- Provider quản lý cafe, fleet, staff, menu, package, promotion, subscription, contest, lịch đóng cửa, doanh thu, maintenance.
- Admin quản trị nền tảng, cafe approval, user, dispute, feature flags, audit/trust score.

### 1.3 Design Principles

1. **Operational-first, không chỉ đẹp:** mọi màn hình chính phải hỗ trợ nhân viên thao tác nhanh tại quán.
2. **State-driven UI:** badge, CTA, warning, timeline phải bám sát state machine.
3. **Evidence-first:** inspection ảnh + checklist là trung tâm của mọi flow damage/dispute.
4. **Mobile-first cho Customer và Staff:** booking, check-in/out, confirm damage phải dùng tốt trên điện thoại.
5. **Dashboard-first cho Provider/Admin:** dữ liệu dày nhưng phải gom thành card, filter, table, timeline.
6. **Snapshot transparency:** customer phải hiểu mình đang trả slot fee, rental fee, deposit, F&B, extension, damage.
7. **No direct status editing UX:** UI không có nút “đổi status” thô. Chỉ có action nghiệp vụ như Confirm payment, Start check-in, Submit inspection, Start checkout.
8. **Unhappy cases visible:** late, no-show, damage, dispute, timeout, vehicle unavailable, payment failed phải có màn hình/trạng thái rõ.

---

## 2. Actors and Navigation Model

### 2.1 Actors

| Actor | Mô tả | Device priority | Primary jobs |
|---|---|---|---|
| Customer | Người đặt lịch/chơi xe RC | Mobile-first web | Tìm cafe, đặt lịch, thanh toán, xác nhận inspection, phản hồi extension/damage, review |
| Staff | Nhân viên quán | Mobile-first web/tablet | Check-in/out, inspection, gán người/xe thực tế, đề xuất extension, ghi incident/F&B |
| Provider | Chủ quán/cafe | Desktop web + tablet | Quản lý chi nhánh, fleet, giá, staff, F&B, package, subscription, contest, doanh thu |
| Admin | Quản trị nền tảng | Desktop web | Duyệt cafe, xử lý dispute, audit, feature flags, trust score |

### 2.2 Suggested App Shells

#### Customer app shell

Bottom navigation mobile:

- Home
- Explore
- Bookings
- Packages
- Profile

Desktop top navigation:

- Explore cafes
- My bookings
- My packages
- Contests
- Notifications
- Profile

#### Staff app shell

Bottom navigation mobile:

- Today
- Check-in
- Active
- Orders
- Incidents

Staff cần UI ít chữ, nút to, camera flow rõ ràng.

#### Provider app shell

Sidebar desktop:

- Overview
- Calendar / Slots
- Bookings
- Sessions live
- Fleet
- Maintenance
- Staff
- F&B Menu
- Packages
- Subscriptions
- Contests
- Promotions
- Reviews
- Revenue
- Settings

#### Admin app shell

Sidebar desktop:

- Platform overview
- Users
- Cafes approval
- Bookings monitor
- Disputes
- Incidents
- Trust score audit
- Feature flags
- System config

---

## 3. Core Domain Mental Model for UI

### 3.1 Booking vs Session

Design phải luôn phân biệt:

| Concept | Meaning | UI representation |
|---|---|---|
| Booking | Đơn đặt lịch dự kiến, có slot_start/slot_end, payment, planned participants/vehicles | Booking card, itinerary, payment breakdown, planned info |
| Session | Phiên chơi thực tế tạo lúc check-in, có actual_start/end, actual participants/vehicles, inspections | Live session card, operation timeline, check-in/out workflow |
| Inspection | Evidence gắn với session/session_vehicle | Photo grid, checklist, compare view, confirmation panel |
| PaymentComponent | Ledger từng loại tiền | Billing breakdown, component status chips |

Booking có thể có 0..N sessions. Một booking `CONFIRMED` vẫn có thể có session `ACTIVE`; không được tự đổi booking thành ACTIVE.

### 3.2 Planned vs Actual

UI nên chia các tab hoặc section:

- **Planned:** thông tin khách đặt trước, slot, xe thuê dự kiến, người chơi dự kiến, F&B preorder.
- **Actual:** người thực tế có mặt, xe thực tế dùng, xe đổi giữa chừng, giờ bắt đầu/kết thúc thật, extension, incident.

Trong màn hình booking detail cho Staff/Provider, nên có visual label:

- `Planned booking`
- `Actual sessions`
- `Evidence & settlement`

---

## 4. State Machines as UX Rules

### 4.1 Booking State Machine

Booking chỉ quản lý đơn đặt lịch dự kiến.

```text
PENDING
  -> CONFIRMED   [payment confirmed]
  -> CANCELLED   [payment timeout/customer cancels]

CONFIRMED
  -> COMPLETED   [all sessions completed]
  -> CANCELLED   [customer/provider cancels before session]
  -> NO_SHOW     [slot_start + grace window, no session created]
```

| Status | Meaning | Customer UI | Staff/Provider UI |
|---|---|---|---|
| PENDING | Đã tạo, chờ thanh toán | Payment countdown, Pay now, Cancel | Booking appears as unpaid/locked slot |
| CONFIRMED | Đã thanh toán, chờ check-in hoặc đang có session | Show QR/check-in code, arrival instructions | CTA: Start check-in; if session exists show live session |
| CANCELLED | Bị huỷ | Refund policy/result | Reason, refund components |
| NO_SHOW | Quá hạn check-in, không có session | No-show notice, refund/deposit info | Auto no-show audit, release resources |
| COMPLETED | Tất cả sessions completed & settled | Receipt, review CTA | Settlement summary, evidence archive |

Rules:

- Chỉ tạo session khi booking `CONFIRMED`.
- Khi session đầu tiên được check-in, booking vẫn `CONFIRMED`.
- Khi tất cả sessions `COMPLETED`, booking chuyển `COMPLETED`.
- Nếu quá hạn check-in mà không có session, booking chuyển `NO_SHOW`.
- Mọi transition phải qua service layer; UI chỉ gọi action nghiệp vụ.

### 4.2 Session State Machine

```text
CHECKED_IN
  -> ACTIVE      [session starts / vehicles assigned]
  -> CANCELLED   [cancel before start]

ACTIVE
  -> EXTENDING      [staff proposes extension]
  -> CHECKING_OUT   [staff starts checkout]

EXTENDING
  -> ACTIVE         [customer approves/rejects/timeout]

CHECKING_OUT
  -> COMPLETED      [customer confirms or auto-confirms]

CANCELLED, COMPLETED are terminal.
```

| Status | Meaning | UI treatment |
|---|---|---|
| CHECKED_IN | Staff đã tạo session, đang hoàn tất inspection đầu vào | Stepper: identify participants → assign vehicles → photos → checklist → customer confirm |
| ACTIVE | Phiên đang chơi | Live timer, planned end, extension CTA, checkout CTA |
| EXTENDING | Chờ khách phản hồi gia hạn | Countdown 10 phút, approve/reject status, fee cap warning |
| CHECKING_OUT | Staff đang kiểm tra trả xe | Photo compare, checklist diff, damage/no damage decision |
| COMPLETED | Session settled | Receipt, evidence archive, vehicle returned available |
| CANCELLED | Hủy trước khi bắt đầu | Reason, audit |

### 4.3 Timeout UX

| Scope | State | Timeout | UI requirement |
|---|---|---|---|
| Booking | PENDING | 30 phút | Payment countdown; after timeout show auto-cancel |
| Booking | CONFIRMED no session | slot_start + 30 phút | Late arrival warning; staff sees risk of NO_SHOW |
| Session | CHECKED_IN | 15 phút customer không confirm inspection | Staff sees pending confirmation; auto-confirm label after timeout |
| Session | EXTENDING | 10 phút no response | Customer countdown; auto-reject if silent |
| Session | CHECKING_OUT no damage | 2 giờ | Customer confirm checkout; auto-confirm label |
| Session | CHECKING_OUT damage flagged | 24 giờ | Customer evidence review; confirm/dispute; auto-confirm damage warning |

---

## 5. Core Entities for UI

### 5.1 Booking entity fields that UI should expose

- Booking ID / short code
- Customer info
- Cafe info
- Booking mode: SINGLE, PACKAGE, SUBSCRIPTION
- Play mode: RENTAL, BYOC, MIXED
- Source: APP, STAFF_CREATED, SUBSCRIPTION_GENERATED
- Track type
- Status
- Slot start/end, slot count
- Payment expires at
- Snapshot: price/policy at booking time
- Promotion/discount
- Cancellation info
- Planned participants
- Planned rental vehicles
- Pre-order F&B
- Sessions under this booking
- Payment components

### 5.2 Session entity fields that UI should expose

- Session ID / sequence number under booking
- Status
- Checked-in by staff
- Actual start/end
- Planned end
- Actual participants
- Actual vehicles: rental or BYOC
- Inspections: check-in/check-out
- Extension proposals
- Incidents/disputes
- F&B on-site orders
- Settlement/payment components

### 5.3 Inspection fields that UI should expose

- Inspection type: CHECK_IN / CHECK_OUT
- Session vehicle
- Photos: FRONT, BACK, LEFT, RIGHT required
- Checklist items
- Pre-existing damage flag
- Customer confirmation status/time
- Damage flag, damage description, estimated cost
- Auto-confirm status/time/reason

---

## 6. Global Visual Language

### 6.1 Look and feel

Design style: modern operational SaaS + playful RC racing energy.

- Visual keywords: fast, precise, trustworthy, evidence-based, premium hobby community.
- Use clean cards, strong status chips, timeline, stepper, maps, photo evidence grids, mobile camera-first UI.
- Avoid childish toy-like design. RC car cafe is hobby + sport + asset rental; tone should be energetic but reliable.

### 6.2 Suggested design tokens

Stitch can choose exact colors, but maintain semantic system:

| Semantic | Usage |
|---|---|
| Primary | Booking CTA, active navigation, key action |
| Success | Confirmed, completed, available, no damage |
| Warning | Pending payment, timeout soon, extension pending, maintenance due |
| Danger | Damage, dispute, cancel, unavailable vehicle |
| Info | BYOC, package, subscription, contest |
| Neutral | Draft, disabled, archived |

### 6.3 Typography and spacing

- Clear hierarchy: page title, section title, card title, metadata.
- Mobile staff screens need big touch targets and minimal paragraphs.
- Use badges and icons instead of long explanations where possible.
- Use stepper for multi-step flows.
- Use sticky bottom action bar on mobile.

### 6.4 Component library direction

Generated UI should use:

- shadcn-style components: Card, Button, Badge, Tabs, Dialog, Sheet, Drawer, Table, DataTable, Calendar, Popover, Command, Select, Input, Textarea, Switch, Alert, Toast, Progress, Stepper-like custom component.
- Framer Motion interactions: page transition, card hover, stepper progression, confirmation modal entrance, timeline reveal.
- Mobile-first responsive layout.

---

## 7. Sitemap

## 7.1 Public / unauthenticated

1. Landing page
2. Explore cafes
3. Cafe detail
4. Login
5. Register
6. Forgot password
7. Public contest listing

## 7.2 Customer pages

1. Customer Home
2. Explore cafes / search results
3. Cafe detail
4. Booking wizard
5. Payment page
6. Booking detail
7. Live session detail
8. Inspection confirmation page
9. Damage evidence review page
10. Extension response page
11. My bookings
12. My packages
13. BYOC vehicle registry
14. Subscriptions
15. Contests
16. Notifications
17. Profile/settings
18. Review page

## 7.3 Staff pages

1. Staff Today dashboard
2. Booking queue
3. Booking detail for operation
4. Check-in wizard
5. Session active control
6. Extension proposal modal/page
7. Check-out wizard
8. Damage report page
9. Incident creation/resolution page
10. F&B on-site order page
11. Vehicle quick status page
12. Notifications

## 7.4 Provider pages

1. Provider overview dashboard
2. Cafe management
3. Calendar / slot management
4. Booking management
5. Session live board
6. Fleet management
7. Vehicle detail
8. Maintenance logs
9. Staff management
10. F&B menu
11. Packages
12. Subscriptions
13. Contests
14. Promotions
15. Reviews
16. Revenue/settlement dashboard
17. Cafe closures/announcements
18. Settings

## 7.5 Admin pages

1. Platform dashboard
2. User management
3. Cafe approval/moderation
4. Booking/session monitor
5. Disputes dashboard
6. Incident policy audit
7. Trust score audit
8. Feature flags
9. System config

---

## 8. Customer Experience Details

### 8.1 Customer Home

Purpose: giúp khách nhanh chóng tìm nơi chơi, tiếp tục booking đang diễn ra, xem gói/contest.

Sections:

- Greeting + location selector.
- Search bar: cafe name, district, track type.
- Current active booking/session card.
- Recommended cafes.
- Popular packages.
- Upcoming contests.
- Notifications: inspection confirm, extension request, damage review.

Important cards:

- `Payment pending` card with countdown.
- `Arrive soon` card with slot time and QR/check-in code.
- `Session active` card with live timer.
- `Action required` card for inspection/damage/extension.

### 8.2 Explore Cafes

Filters:

- District/city
- Track type
- Available today
- Supports BYOC
- Has rental vehicles
- Price range
- Rating
- Open now
- Packages/contest available

Cafe card fields:

- Cover image
- Cafe name
- Rating/reviews
- Address/district
- Track types
- Starting slot fee
- BYOC support badge
- Available slots today
- Fleet preview

### 8.3 Cafe Detail

Tabs:

1. Overview
2. Book slot
3. Fleet
4. Menu
5. Packages
6. Contests
7. Reviews
8. Policy

Overview:

- Hero gallery
- Location/address/map preview
- Operating hours
- Track types
- Rules/policies summary
- Announcements/closures

Fleet tab:

- Vehicle cards: name, tier, hourly rate, deposit, availability, compatible track types.
- Vehicle detail sheet: image gallery, deposit, damage multiplier, maintenance/availability hint.

Policy tab:

- Cancellation policy
- No-show policy
- Deposit/damage policy
- BYOC safety policy
- Inspection requirement

### 8.4 Booking Wizard

Design as a multi-step flow with progress indicator. Use clear summary sidebar on desktop and sticky summary bottom sheet on mobile.

Recommended steps:

#### Step 1 — Select cafe/track/time

Inputs:

- Date
- Time slot
- Duration/slot_count
- Track type
- Play mode: RENTAL / BYOC / MIXED

Validation:

- Cafe open hours
- Cafe closures
- Max concurrent bookings
- BYOC capacity
- Track compatibility

#### Step 2 — Participants

Inputs:

- Primary responsible person
- Add planned participants
- Guest name/phone optional
- Participant type

UX:

- Explain planned participants can differ from actual participants at check-in.
- Staff can update actual participants later.

#### Step 3 — Vehicles / BYOC

For RENTAL:

- Choose one or multiple rental vehicles.
- Show hourly_rate, security_deposit, damage_multiplier.
- Assign vehicle to participant optionally.

For BYOC:

- Choose saved customer vehicle or add new.
- Show safety checklist preview.

For MIXED:

- Split UI into rental vehicles and BYOC vehicles.

#### Step 4 — F&B pre-order

- Optional menu selection.
- Show that order will be held and prepared by cafe.
- Quantity controls.

#### Step 5 — Package / Promotion

- Select customer package if available.
- Apply promotion code.
- Show discount line item.

#### Step 6 — Review & Pay

Show immutable booking snapshot:

- Slot fee
- Rental fee per vehicle
- Security deposit per vehicle
- F&B preorder
- Discount
- Total to pay/hold
- Cancellation policy summary
- Damage policy summary

Primary CTA:

- Pay now

Secondary:

- Save/cancel

### 8.5 Payment Page

States:

- Awaiting payment with 30-minute countdown.
- Redirect/QR/payment gateway.
- Payment confirmed.
- Payment failed.
- Payment expired → booking cancelled.

UI must show:

- Booking summary
- Payment components
- Security deposit explanation
- `payment_expires_at` countdown
- Support/help link

### 8.6 My Bookings

Tabs or filters:

- Upcoming
- Action required
- Active
- Completed
- Cancelled/No-show

Booking card:

- Cafe name
- Slot time
- Booking status chip
- Play mode
- Payment status
- Action required badge
- Primary CTA based on state

CTA mapping:

| Booking/session state | Primary CTA |
|---|---|
| PENDING | Pay now |
| CONFIRMED before slot | View check-in info |
| CONFIRMED + pending inspection | Confirm inspection |
| Session ACTIVE | View live session |
| Session EXTENDING | Respond to extension |
| CHECKING_OUT no damage | Confirm checkout |
| CHECKING_OUT damage | Review damage evidence |
| COMPLETED | View receipt / Review |
| CANCELLED/NO_SHOW | View refund result |

### 8.7 Booking Detail

Sections:

1. Status timeline
2. Cafe and slot info
3. Planned participants
4. Planned vehicles / BYOC info
5. Sessions list
6. Payment breakdown
7. F&B orders
8. Policy snapshot
9. Support/actions

State timeline example:

- Created
- Payment pending/confirmed
- Check-in window
- Session 1 active/completed
- Settlement completed

### 8.8 Customer Inspection Confirmation

Used after staff submits check-in or check-out inspection.

Layout:

- Header: `Please review vehicle condition`
- Session/vehicle info
- Photo grid: FRONT, BACK, LEFT, RIGHT
- Checklist summary
- Staff notes
- For check-in: pre-existing damage warning if flagged
- Confirmation checkbox: `I have reviewed the evidence`
- CTA: Confirm
- Secondary: Report issue / disagree
- Countdown: 15 min for check-in, 2h or 24h for checkout depending damage.

### 8.9 Damage Evidence Review

Purpose: customer sees damage claim and can confirm or dispute.

Sections:

- Damage summary: description, estimated cost, multiplier, final charge.
- Compare view: check-in vs check-out photos side-by-side.
- Checklist diff: baseline vs current.
- Deposit impact: deposit held, damage charge, refund remainder.
- Actions:
  - Confirm damage charge
  - Dispute / request admin review
  - Add note/evidence
- Countdown: 24h auto-confirm warning.

### 8.10 Extension Response

Sections:

- Staff proposal: extra time, fee, new planned end.
- Fee cap warning if near limit.
- Current session timer.
- Actions:
  - Approve
  - Reject
- Countdown: 10 minutes auto-reject.

### 8.11 BYOC Vehicle Registry

Purpose: manage customer's own RC cars.

Fields:

- Brand
- Model
- Serial number
- Description
- Notes
- Optional photos in future

UI:

- Saved vehicle cards
- Add/edit vehicle drawer
- Safety policy reminder

### 8.12 Customer Review Page

After booking completed:

- Rating
- Text review
- Tags: track quality, staff support, vehicle quality, F&B, cleanliness
- Upload optional photo in future

---

## 9. Staff Experience Details

Staff UI is the most critical operational UI. It must be mobile-first, fast, safe, and state-driven.

### 9.1 Staff Today Dashboard

Sections:

- Current cafe selector if staff assigned to multiple cafes.
- Today’s timeline: upcoming confirmed bookings, active sessions, checkouts pending.
- Alerts:
  - Payment pending near slot
  - Customer late
  - Inspection waiting for customer confirmation
  - Extension pending response
  - Damage review pending
  - Vehicle maintenance/unavailable
- Quick actions:
  - Scan booking QR / search code
  - Start check-in
  - Active sessions
  - New F&B order

Booking row/card:

- Time
- Customer
- Mode: RENTAL/BYOC/MIXED
- Booking status
- Planned vehicles count
- Participants count
- CTA based on state

### 9.2 Booking Queue

Filters:

- Today
- Upcoming
- Late arrival
- Ready for check-in
- Active
- Checking out
- Completed

Search:

- Booking code
- Customer phone/name
- Cafe/track

### 9.3 Staff Booking Detail

Staff version must expose both planned and actual.

Tabs:

1. Overview
2. Planned participants/vehicles
3. Sessions
4. Payment
5. Evidence
6. F&B
7. Incidents

Primary actions:

- Start check-in if booking CONFIRMED and no conflicting active session.
- Cancel before start if allowed.
- View active session.
- Mark no-show only via allowed service action if timeout rules allow, or show auto-no-show result.

### 9.4 Check-in Wizard

Triggered from booking `CONFIRMED`.

Important: action creates a new Session with status `CHECKED_IN`.

Recommended steps:

#### Step 1 — Verify booking

Show:

- Customer identity
- Slot time
- Booking mode/play mode
- Planned participants
- Planned rental vehicles
- Payment confirmed badge
- Policy warnings

CTA: Start check-in

#### Step 2 — Actual participants

- Confirm planned participants who arrived.
- Add walk-in/extra participant.
- Mark primary responsible.
- Note late arrival if needed.

#### Step 3 — Assign actual vehicles

For RENTAL:

- Show planned vehicles.
- Staff selects actual vehicle from fleet.
- Vehicle status changes to IN_USE only when session starts/vehicle assigned.
- Allow vehicle swap if planned vehicle unavailable, with reason.

For BYOC:

- Select customer vehicle or add quick BYOC info.
- Show safety checklist.

For MIXED:

- Support both rental and BYOC in one session.

#### Step 4 — Check-in photos

For each session vehicle:

- Required photo slots: FRONT, BACK, LEFT, RIGHT.
- Each photo card has status: missing/uploaded.
- Disable continue until all 4 uploaded.
- Cloudinary upload progress.

For BYOC also capture facility/track condition if required.

#### Step 5 — Checklist

For RENTAL checklist:

- scratches: required string, default `none`
- cracks: required string, default `none`
- missing_parts: required string, default `none`
- notes: required string, default `none`
- pre_existing_flag if there is existing damage

For BYOC safety checklist:

- battery_secured: boolean
- no_sharp_protrusions: boolean
- weight_compliant: boolean
- notes: required string

#### Step 6 — Customer confirmation

- Show QR/link/push sent to customer.
- Staff sees countdown 15 minutes.
- Status: waiting customer confirm / confirmed / auto-confirmed.
- After confirmed or auto-confirmed, CTA: Start session.

#### Step 7 — Start session

- Transition `CHECKED_IN -> ACTIVE`.
- Show live session timer.

### 9.5 Active Session Control

Layout:

- Large live timer: actual_start_at, planned_end_at, overtime warning.
- Participants count.
- Actual vehicles cards.
- Payment summary: held components, extension total.
- Quick actions:
  - Propose extension
  - Add F&B order
  - Report incident
  - Swap vehicle
  - Start checkout

Vehicle card:

- Vehicle/customer vehicle name
- Driver/participant
- Status
- Check-in evidence link
- Swap button with reason

### 9.6 Extension Proposal

Fields:

- Extra minutes/slots
- Extension fee preview
- Current accumulated extension fee
- Security deposit cap: max 50%
- New planned end time
- Note

Validation:

- Cannot propose if cap exceeded.
- Cannot propose if session not ACTIVE.
- Customer has 10 minutes to respond.

After sending:

- Session status `EXTENDING`.
- Staff sees pending countdown.
- If approved/rejected/timeout: session returns `ACTIVE`.

### 9.7 Check-out Wizard

Triggered from session `ACTIVE`.

Step 1 — Start checkout:

- Transition `ACTIVE -> CHECKING_OUT`.
- Show active vehicles.

Step 2 — Check-out photos:

- For each vehicle, capture FRONT/BACK/LEFT/RIGHT.
- Use same angles as check-in.
- Disable continue until complete.

Step 3 — Checklist:

- Same fields as check-in.
- Required strings; empty means `none`.

Step 4 — Compare evidence:

- Side-by-side check-in vs check-out photos.
- Checklist diff highlights new scratches/cracks/missing parts.
- Staff manually reviews; MVP does not rely on AI auto-detect.

Step 5 — Damage decision:

Two branches:

#### Branch A — No damage

- Staff selects `No new damage`.
- Push customer confirmation.
- Customer timeout 2h auto-confirm.
- After confirm/auto-confirm: complete session and settle.

#### Branch B — Damage flagged

- Staff enters description.
- Staff enters base_damage_cost.
- System calculates damage_charge = base_damage_cost × damage_multiplier.
- Show deposit impact.
- Push customer evidence review.
- Customer timeout 24h auto-confirm damage.
- If customer disputes: create incident/dispute.
- Session only completes after damage confirmed or incident/dispute resolved/waived.

Step 6 — Complete session

- Transition `CHECKING_OUT -> COMPLETED`.
- Call PaymentEngine.settle(sessionId).
- Vehicle status back to AVAILABLE for rental.
- If all sessions completed, booking becomes COMPLETED.

### 9.8 Incident Creation / Policy Resolution

Incident is Phase 1 core, policy-based resolution.

Staff/Admin UI fields:

- Incident type: DAMAGE, COLLISION, SAFETY, CUSTOMER_COMPLAINT, OTHER.
- Description.
- Related session/vehicle/participant.
- Evidence links: inspection photos/checklist.
- Responsible party.
- Estimated amount.
- Final amount.
- Resolution note.
- Status: OPEN, UNDER_REVIEW, RESOLVED, WAIVED.

UX:

- Staff can create incident during active session or checkout.
- Admin/authorized staff can resolve according to policy.
- If official dispute is needed, link to disputes table/workflow.

### 9.9 Staff F&B On-site Order

Use during active session.

- Select active session.
- Add menu items.
- Quantity and notes.
- Confirm order.
- Track status: PENDING, CONFIRMED, PREPARING, SERVED, CANCELLED.
- Show whether charge goes to session/booking.

---

## 10. Provider Experience Details

### 10.1 Provider Overview Dashboard

Cards:

- Today bookings
- Active sessions
- Revenue today/week/month
- Pending checkouts
- Damage claims pending
- Vehicles available/in use/maintenance
- Reviews average
- Package/subscription activity

Charts:

- Revenue trend
- Booking volume
- Utilization by vehicle/track
- Damage/incident count

Tables:

- Upcoming bookings
- Active sessions
- Maintenance due
- Recent incidents

### 10.2 Calendar / Slot Management

Views:

- Day timeline
- Week calendar
- Resource view by track/cafe

Features:

- Show confirmed/pending/blocked slots.
- Cafe closures.
- Max concurrent bookings.
- BYOC capacity.
- Special announcements.

### 10.3 Booking Management

Data table columns:

- Booking code
- Customer
- Cafe
- Slot time
- Mode
- Status
- Payment status
- Sessions count
- Total amount
- Action required

Filters:

- Date range
- Status
- Play mode
- Payment state
- Has dispute/incident
- Source

### 10.4 Session Live Board

Kanban columns:

- Checked in
- Active
- Extending
- Checking out
- Completed today

Session card:

- Customer
- Booking code
- Timer
- Vehicles count
- Staff assigned
- Alerts: damage, timeout, pending confirm

### 10.5 Fleet Management

Vehicle table/card grid:

- Image
- Name
- Tier
- Status: AVAILABLE, IN_USE, MAINTENANCE, RETIRED
- Hourly rate
- Deposit
- Damage multiplier
- Compatible tracks
- Last maintenance
- Current session if in use

Actions:

- Add/edit vehicle
- Upload images
- Set maintenance
- Retire
- View usage history
- View damage/incident history

### 10.6 Vehicle Detail

Tabs:

- Overview
- Images
- Pricing & deposit
- Availability/usage
- Maintenance logs
- Incidents/damage history

### 10.7 Maintenance Logs

Fields:

- Type: SCHEDULED, REPAIR, INSPECTION
- Description
- Cost
- Performed by
- Performed at
- Next scheduled at
- Related session if any

UX:

- Maintenance due alerts.
- Convert damage incident to maintenance log.

### 10.8 Staff Management

- List staff assigned to cafe.
- Assign/remove staff.
- Show assigned_by, assigned_at, ended_at.
- Permissions are role-based.

### 10.9 F&B Menu Management

- Menu item CRUD.
- Availability toggle.
- Price.
- Category.
- Image.
- Staff can update item status if allowed.

### 10.10 Packages

Provider creates packages:

- Package name
- Number of sessions/slots or credit value
- Validity period
- Price
- Rules/limitations

Provider sees:

- Purchased count
- Usage history
- Active customer packages

### 10.11 Subscriptions

Purpose: recurring play schedule that generates bookings.

UI:

- Create subscription schedule.
- Customer/cafe/track/time.
- Frequency.
- Generated bookings list.
- Pause/cancel subscription.

### 10.12 Contests

UI:

- Contest listing/management.
- Registration count.
- Rental/BYOC vehicle requirements.
- Participants.
- Schedule.

### 10.13 Promotions

UI:

- Code
- Discount type/value
- Validity
- Usage limit
- Applicable cafe/package/booking mode
- Promotion usage audit

### 10.14 Reviews

- Review list.
- Rating breakdown.
- Reply to review if needed.
- Filter by cafe/date/rating.

### 10.15 Revenue / Settlement Dashboard

Must reflect payment engine.

Sections:

- Gross held amount
- Disbursed to provider
- Refunded to customer
- Platform fee
- Damage charges
- Deposits held/refunded
- Settlement by session

Payment component table:

- Component type: SLOT_FEE, RENTAL_FEE, SECURITY_DEPOSIT, FB_PREORDER, EXTENSION_FEE, DAMAGE_CHARGE
- Status: PENDING, HELD, DISBURSED, REFUNDED, WAIVED, FAILED
- Booking ID
- Session ID if applicable
- Amount
- Created at

### 10.16 Cafe Closures & Announcements

Closures:

- Date
- Start/end time
- Reason
- Affect bookings warning

Announcements:

- Banner title/content
- Active period
- Target cafe
- Display on cafe detail and booking wizard

---

## 11. Admin Experience Details

### 11.1 Platform Dashboard

Cards:

- Total users
- Active providers/cafes
- Bookings today
- GMV/revenue
- Disputes open
- Incidents open
- Feature flags active

### 11.2 User Management

Columns:

- User
- Role
- Trust score
- Active status
- Created at
- Related bookings/incidents

Actions:

- Activate/deactivate
- View trust score log
- View bookings

### 11.3 Cafe Approval

Cafe status:

- PENDING
- ACTIVE
- SUSPENDED

UI:

- Review cafe profile, images, operating hours, policies.
- Approve/suspend.
- Admin note.

### 11.4 Booking/Session Monitor

Purpose: admin can inspect system state but not perform operational actions unless policy allows.

- Search booking/session.
- See state timelines.
- View payment components.
- View evidence.
- View incident/dispute links.

### 11.5 Dispute Dashboard

Phase 1 has basic disputes table; advanced multi-party workflow is Phase 2.

Dispute UI:

- Dispute status.
- Booking/session/customer/provider.
- Evidence bundle from inspections.
- Damage charge/payment impact.
- Notes from customer/staff/provider.
- Admin decision.
- Resolution result: RESOLVED, WAIVED, CHARGE_CONFIRMED, REFUND_ADJUSTED.

### 11.6 Trust Score Audit

- User trust score current.
- Logs by booking/session/incident.
- Reason.
- Delta.
- Actor/system source.

### 11.7 Feature Flags

Feature flags include config for Phase 2 readiness.

Examples:

- AI damage detection
- AI recommendation
- Dynamic pricing
- Advanced dispute workflow
- Tenant/SaaS mode
- Native mobile features

UI:

- Flag name
- Enabled
- Scope
- Config JSON editor
- Audit fields

---

## 12. Payment UX Specification

### 12.1 Payment principles for UI

- Never show money as one vague total only.
- Always show component breakdown.
- Deposit must be visually separate from fees.
- Damage charge must explain formula and evidence.
- Settlement happens per session, not per booking.
- Refund policy depends on who cancels and when.

### 12.2 Components and lifecycle

When booking is confirmed:

- SLOT_FEE held.
- RENTAL_FEE held per rental vehicle.
- SECURITY_DEPOSIT held per rental vehicle.
- FB_PREORDER held if pre-order exists.

When extension approved:

- EXTENSION_FEE held and linked to session.
- Total extension fee cannot exceed 50% of security deposit.

When checkout has damage:

- DAMAGE_CHARGE pending then held after customer confirms/auto-confirms.

When session completed:

- SLOT_FEE disbursed to provider.
- RENTAL_FEE disbursed to provider.
- EXTENSION_FEE disbursed to provider.
- SECURITY_DEPOSIT refunded to customer minus damage.
- DAMAGE_CHARGE disbursed to provider if any.
- Platform fee = 15% on total disbursed to provider.

### 12.3 Refund policy UI

Customer cancellation:

| Timing | Slot fee refund | Rental fee refund | Deposit refund |
|---|---:|---:|---:|
| > 24h before slot | 100% | 100% | 100% |
| 12–24h before slot | 50% | 100% | 100% |
| < 12h before slot | 0% | 100% | 100% |
| After check-in / early checkout | Pro-rata remaining slot fee | 0% | After damage check |

Provider cancellation:

- 100% refund all components.
- No platform fee.

No-show:

- Slot fee: no refund.
- Rental fee: 100% refund.
- Deposit: 100% refund.

### 12.4 Billing component card design

Each component row:

- Type icon
- Component name
- Amount
- Status chip
- Booking/session link
- Explanation tooltip

Suggested grouping:

- Fees paid to provider
- Deposits held/refunded
- Add-ons/F&B
- Adjustments/damage/refunds

---

## 13. Inspection UX Specification

### 13.1 Inspection principle

Inspection creates digital evidence at asset handover. Without valid inspection, provider loses right to charge damage.

UI must make evidence quality obvious:

- 4 required photo angles.
- Checklist completeness.
- Customer confirmation or auto-confirm audit.
- Baseline vs current comparison.

### 13.2 Check-in flow summary

RENTAL mode:

1. Staff selects booking and starts check-in.
2. System creates session with `CHECKED_IN`.
3. Staff assigns rental vehicles.
4. Staff captures FRONT/BACK/LEFT/RIGHT photos for each vehicle.
5. Staff fills checklist.
6. Staff flags pre-existing damage if any.
7. Customer receives confirmation request.
8. Customer confirms or timeout auto-confirms after 15 minutes.
9. Session transitions to `ACTIVE`.

BYOC mode:

- No rental fleet vehicle is taken.
- Staff captures customer vehicle condition.
- Staff captures facility/track condition if relevant.
- Staff completes BYOC safety checklist.

### 13.3 Check-out flow summary

1. Staff starts checkout from active session.
2. Session transitions `ACTIVE -> CHECKING_OUT`.
3. Staff captures same 4 photo angles.
4. Staff fills checkout checklist.
5. System/UI shows compare view.
6. Staff marks damage or no damage.
7. Customer confirms or disputes.
8. Session completes after confirmation/resolution.
9. Settlement runs.

### 13.4 Photo capture UI requirements

- Four fixed slots: FRONT, BACK, LEFT, RIGHT.
- Each slot has thumbnail, retake, upload progress.
- Use camera-first capture on mobile.
- Do not allow submit while any slot missing.
- For multiple vehicles, use vehicle tabs or accordion.

### 13.5 Checklist UI requirements

- Required fields cannot be null.
- Empty visible value should be `none`.
- Show completion progress.
- Highlight changed fields between check-in and check-out.

### 13.6 Evidence archive

Booking/session detail should keep evidence accessible:

- Check-in photos
- Check-out photos
- Checklist
- Confirmation timestamps
- Auto-confirm audit
- Incident/dispute link

---

## 14. Unhappy Cases and Required UX

### 14.1 Payment timeout

Scenario:

- Customer created booking but did not pay within 30 minutes.

UX:

- Countdown before timeout.
- After timeout: show booking cancelled, slot released, create new booking CTA.
- Staff/provider sees slot available again.

### 14.2 Customer late / no-show

Scenario:

- Booking is CONFIRMED but no session created by slot_start + 30 minutes.

UX:

- Before grace ends: warning badge `Late check-in risk`.
- After grace: booking becomes NO_SHOW.
- Customer sees refund result: slot fee lost, rental/deposit refunded.
- Provider sees no-show audit.

### 14.3 Planned vehicle unavailable at check-in

Scenario:

- Vehicle selected during booking is now maintenance/unavailable.

UX:

- Staff check-in shows `Planned vehicle unavailable` warning.
- Staff can select substitute compatible vehicle.
- Must enter swap reason.
- Customer sees actual vehicle in session evidence.

### 14.4 Customer refuses check-in condition

Scenario:

- Customer disagrees with check-in inspection.

UX:

- Customer taps `Report issue`.
- Staff sees issue before session starts.
- Staff can retake photo/update checklist or cancel session before start.
- Keep audit log.

### 14.5 Customer does not confirm check-in

Scenario:

- Customer ignores check-in confirmation for 15 minutes.

UX:

- Customer sees countdown.
- Staff sees waiting state.
- After timeout: auto-confirm badge and audit note.
- Session can start.

### 14.6 Extension request ignored

Scenario:

- Staff proposes extension, customer does not respond in 10 minutes.

UX:

- Customer sees countdown and approve/reject.
- Staff sees pending.
- Timeout auto-rejects and session returns ACTIVE.

### 14.7 Extension exceeds deposit cap

Scenario:

- Total extension fee would exceed 50% security deposit.

UX:

- Disable submit extension.
- Show exact cap and current accumulated extension fee.
- Suggest checkout or create new booking.

### 14.8 New damage found at checkout

Scenario:

- Staff flags damage.

UX:

- Mandatory evidence compare.
- Damage formula visible.
- Customer can confirm or dispute.
- 24h auto-confirm warning.
- Session not completed until confirmed/resolved.

### 14.9 Provider missing required inspection evidence

Scenario:

- Missing photo/checklist.

UX:

- Disable damage charge submission.
- Show `Provider cannot charge damage without complete evidence`.
- Allow incident note but no damage charge.

### 14.10 BYOC causes facility damage

Scenario:

- Customer's own car damages track/barrier.

UX:

- Use BYOC check-in facility photos as baseline.
- Staff creates incident.
- Customer sees evidence and estimated facility damage charge.
- Admin/staff resolves according to policy.

### 14.11 Multi-session booking

Scenario:

- Booking has multiple real sessions under one booking.

UX:

- Booking detail must show sessions list with separate status, time, evidence, settlement.
- Payment settlement shown per session.
- Booking completed only when all sessions completed.

### 14.12 Customer checks out early

Scenario:

- Session ends before planned end.

UX:

- Staff starts checkout.
- Show pro-rata slot fee refund formula where applicable.
- Rental fee not refunded after check-in.
- Deposit after damage check.

### 14.13 Damage charge greater than deposit

Scenario:

- Damage charge > security deposit.

UX:

- Show deposit fully consumed.
- Show extra charge request/manual follow-up outside MVP.
- Mark as needs manual action.

### 14.14 Dispute opened

Scenario:

- Customer disputes damage.

UX:

- Session stays unresolved/checking out or settlement pending.
- Dispute detail page shows evidence bundle.
- Admin decision panel.
- Customer/staff/provider see current dispute status.

### 14.15 Staff assigned wrong cafe

Scenario:

- Staff tries to check-in booking of cafe they are not assigned to.

UX:

- Block action.
- Show permission error.
- Suggest switching cafe or contacting provider/admin.

---

## 15. Page-by-page Screen Checklist for Stitch

Generate polished screens for these flows first.

### 15.1 Customer core screens

1. Landing / Home
2. Explore cafes
3. Cafe detail with tabs
4. Booking wizard step 1: time/mode
5. Booking wizard step 2: participants
6. Booking wizard step 3: rental/BYOC vehicles
7. Booking wizard step 4: F&B preorder
8. Booking wizard step 5: review/payment breakdown
9. Payment pending/confirmed
10. My bookings list
11. Booking detail with sessions
12. Inspection confirmation
13. Extension response
14. Damage evidence review
15. Completed receipt/review

### 15.2 Staff core screens

1. Staff today dashboard
2. Booking queue
3. Staff booking detail
4. Check-in wizard: verify booking
5. Check-in wizard: participants/vehicles
6. Check-in wizard: photo capture
7. Check-in wizard: checklist/customer confirm
8. Active session control
9. Extension proposal
10. Check-out wizard: photo capture
11. Check-out wizard: compare evidence
12. Damage report
13. Incident resolution
14. F&B on-site order

### 15.3 Provider core screens

1. Provider dashboard
2. Calendar/slot management
3. Booking table
4. Session live board
5. Fleet management
6. Vehicle detail + maintenance
7. Staff management
8. F&B menu management
9. Package management
10. Subscription management
11. Contest management
12. Promotion management
13. Revenue/settlement dashboard
14. Cafe settings/closures/announcements

### 15.4 Admin core screens

1. Admin dashboard
2. Cafe approval
3. Users management
4. Dispute dashboard/detail
5. Trust score audit
6. Feature flags

---

## 16. Critical UI Components

### 16.1 StatusBadge

Supports booking status:

- PENDING
- CONFIRMED
- CANCELLED
- NO_SHOW
- COMPLETED

Supports session status:

- CHECKED_IN
- ACTIVE
- EXTENDING
- CHECKING_OUT
- COMPLETED
- CANCELLED

Status badges should include icon, color, and short text.

### 16.2 BookingCard

Fields:

- Cafe name/image
- Slot time
- Status badge
- Play mode badge
- Payment status
- Primary action
- Action required flag

### 16.3 SessionCard

Fields:

- Session sequence
- Timer/time range
- Session status
- Actual vehicles count
- Participants count
- Staff name
- Alert badges

### 16.4 PaymentBreakdown

Groups:

- Slot fee
- Rental fee per vehicle
- Security deposit per vehicle
- F&B
- Extension
- Damage
- Discount/refund

### 16.5 EvidencePhotoGrid

- Four required angle cards.
- Upload/retake state.
- Compare mode: check-in vs check-out.

### 16.6 InspectionChecklist

- Required fields.
- Completion indicator.
- Diff mode.

### 16.7 Timeline

Booking timeline and session timeline.

Events:

- Booking created
- Payment confirmed
- Check-in started
- Customer confirmed inspection
- Session started
- Extension proposed/approved/rejected
- Checkout started
- Damage flagged
- Dispute opened/resolved
- Session completed
- Settlement completed

### 16.8 ActionRequiredBanner

Used for:

- Payment pending
- Inspection confirmation needed
- Extension response needed
- Damage review needed
- Dispute update
- Timeout warning

### 16.9 MobileStickyActionBar

Used for customer/staff flows:

- Pay now
- Confirm inspection
- Approve/reject extension
- Submit photos
- Start session
- Start checkout
- Submit damage report

---

## 17. Data Tables and Filters

### 17.1 Booking table filters

- Date range
- Cafe
- Booking status
- Payment status
- Play mode
- Source
- Has session
- Has incident/dispute

### 17.2 Session table filters

- Date range
- Cafe
- Session status
- Staff
- Vehicle
- Has extension
- Has damage
- Settlement status

### 17.3 Vehicle table filters

- Cafe
- Status
- Tier
- Track compatibility
- Maintenance due
- In use

### 17.4 Incident/dispute filters

- Status
- Date range
- Cafe
- Responsible party
- Amount range
- Needs admin action

---

## 18. Role-based Permissions in UI

| Action | Customer | Staff | Provider | Admin |
|---|---:|---:|---:|---:|
| Create booking | Yes | Optional assisted | No | No |
| Cancel own booking | Yes | No | Yes for cafe booking | Admin override if needed |
| Start check-in | No | Yes | Optional if provider acts as staff | No |
| Submit inspection | No | Yes | Optional | No |
| Confirm inspection | Yes | No | No | No |
| Start session | No | Yes | Optional | No |
| Propose extension | No | Yes | Optional | No |
| Approve extension | Yes | No | No | No |
| Start checkout | No | Yes | Optional | No |
| Confirm damage | Yes | No | No | No |
| Resolve incident | No | Staff/Admin depending policy | Provider/Staff depending policy | Yes |
| Resolve dispute | No | No | No | Yes |
| Manage fleet | No | Limited | Yes | No |
| Manage feature flags | No | No | No | Yes |

---

## 19. Notification UX

Notification types:

- Payment deadline
- Booking confirmed
- Check-in confirmation needed
- Session started
- Extension proposal
- Checkout confirmation needed
- Damage evidence review
- Dispute update
- Booking completed
- Review request
- Cafe announcement/closure

Notification card fields:

- Type icon
- Title
- Short message
- Related booking/session
- Time
- Primary CTA
- Read/unread state

---

## 20. Empty, Loading, Error States

### 20.1 Empty states

- No bookings: show explore cafe CTA.
- No active sessions: show today queue.
- No vehicles: show add vehicle CTA.
- No menu items: show add menu item CTA.
- No disputes: show calm success illustration/icon.

### 20.2 Loading states

- Use skeleton cards for lists.
- Use upload progress for photos.
- Use spinner only inside button when action is submitting.

### 20.3 Error states

Important errors need friendly explanations:

- Payment expired.
- Slot no longer available.
- Vehicle unavailable.
- Staff not assigned to cafe.
- Missing required inspection photos.
- Extension exceeds cap.
- Cannot charge damage due to incomplete evidence.
- Transition not allowed from current state.

---

## 21. AI/Stitch Generation Prompt

Use the following prompt in Stitch or another AI UI generator.

```text
Design a modern, responsive web application for RCField, a booking and operations platform for RC car cafes/tracks.

The app has four roles: Customer, Staff, Provider, Admin.
The most important concept is that Booking and Session are different:
- Booking is a planned reservation with slot_start, slot_end, payment, planned participants, planned rental vehicles, and status PENDING/CONFIRMED/CANCELLED/NO_SHOW/COMPLETED.
- Session is the real play session created at check-in with actual participants, actual vehicles, inspection evidence, actual_start/end, extension, checkout, damage and settlement, with status CHECKED_IN/ACTIVE/EXTENDING/CHECKING_OUT/COMPLETED/CANCELLED.

Design must be state-driven, operational, mobile-first for Customer and Staff, dashboard-first for Provider and Admin.
Use shadcn-style components, clean cards, badges, tables, tabs, drawers, dialogs, timeline, stepper, photo grids, payment breakdown, and Framer Motion-style transitions.
Visual style: modern SaaS + energetic RC racing hobby, trustworthy, evidence-based, premium but not childish.

Core customer flow:
1. Explore cafes with filters: district, track type, open now, BYOC support, rental vehicles, price, rating.
2. Cafe detail with overview, booking, fleet, menu, packages, contests, reviews and policy tabs.
3. Booking wizard: select time/track/play mode, add participants, choose rental vehicles or BYOC vehicles, optional F&B preorder, apply package/promotion, review payment breakdown, pay.
4. Payment pending page with 30-minute countdown.
5. My bookings list with action-required cards.
6. Booking detail showing booking timeline, planned info, sessions list, payment components and evidence archive.
7. Inspection confirmation screen with four required photos (FRONT/BACK/LEFT/RIGHT), checklist and confirm/report issue CTA.
8. Extension response screen with 10-minute countdown, approve/reject buttons and fee cap explanation.
9. Damage evidence review with check-in vs check-out photo comparison, checklist diff, damage formula, deposit impact and confirm/dispute CTA.
10. Completed receipt and review screen.

Core staff flow:
1. Staff Today dashboard with booking queue, active sessions, late/no-show warnings, pending inspection confirmations, extension pending, damage review pending.
2. Booking detail for operations showing planned vs actual info.
3. Check-in wizard: verify booking, confirm actual participants, assign actual vehicles, capture 4 photos per vehicle, fill checklist, send customer confirmation, then start session.
4. Active session control with live timer, actual vehicles, participants, propose extension, add F&B, report incident, swap vehicle, start checkout.
5. Extension proposal form with extra time, fee, new planned end and max extension fee = 50% of security deposit.
6. Check-out wizard: capture 4 photos, fill checklist, compare check-in vs check-out, choose no damage or damage flagged.
7. Damage report form with base damage cost, multiplier, final damage charge, deposit impact, customer notification.
8. Incident policy resolution screen with evidence bundle, responsible party, final amount and resolution note.
9. On-site F&B order screen for active sessions.

Core provider flow:
1. Provider dashboard with today bookings, active sessions, revenue, pending checkouts, vehicles available/in-use/maintenance, damage claims.
2. Calendar/slot management with confirmed/pending/blocked slots, cafe closures and BYOC capacity.
3. Booking table with filters and action-required flags.
4. Session live board as kanban columns: Checked in, Active, Extending, Checking out, Completed.
5. Fleet management and vehicle detail with pricing, deposit, damage multiplier, status, maintenance logs, usage history.
6. Staff management, F&B menu, packages, subscriptions, contests, promotions, reviews, revenue/settlement dashboard.
7. Revenue dashboard must show payment components: SLOT_FEE, RENTAL_FEE, SECURITY_DEPOSIT, FB_PREORDER, EXTENSION_FEE, DAMAGE_CHARGE, with status and settlement by session.

Core admin flow:
1. Admin dashboard with users, cafes, bookings, disputes, incidents and GMV.
2. Cafe approval/moderation.
3. User management with trust score.
4. Dispute dashboard and detail page showing evidence bundle, damage charge, customer/staff/provider notes and admin decision.
5. Trust score audit and feature flags.

Critical UX rules:
- Do not expose direct status edit controls. Use business actions only: Pay, Start check-in, Submit inspection, Start session, Propose extension, Start checkout, Confirm damage, Resolve dispute.
- Missing inspection photos/checklist blocks damage charge.
- Four photo angles are required for inspections: FRONT, BACK, LEFT, RIGHT.
- Booking remains CONFIRMED while sessions are active; it becomes COMPLETED only when all sessions are completed and settled.
- If confirmed booking has no session after slot_start + 30 minutes, mark NO_SHOW.
- Session checkout with no damage auto-confirms after 2 hours; with damage auto-confirms after 24 hours.
- Customer can dispute damage, creating incident/dispute flow.
- Payment must always show component breakdown and deposit separately from fees.

Generate screens with responsive layouts, realistic data, status badges, action-required banners, timelines, steppers, card grids, data tables, mobile sticky action bars and polished empty/loading/error states.
```

---

## 22. Recommended Prototype Flow Order

When building the prototype, create in this order:

1. Customer explore → cafe detail → booking wizard → payment.
2. Staff today → check-in wizard → active session → checkout wizard.
3. Customer inspection confirm → extension response → damage review.
4. Provider dashboard → session live board → fleet → revenue.
5. Admin dispute detail.

This order validates the most important system idea: planned booking becomes one or many actual sessions, and every financial/damage decision is backed by inspection evidence.

---

## 23. Final Design Acceptance Criteria

A generated UI is acceptable only if:

- It clearly separates Booking and Session.
- Staff can complete check-in/out on mobile.
- Customer understands fees vs deposits vs damage.
- Damage/dispute UI always displays evidence.
- Provider can monitor live operations.
- Admin can resolve disputes with full context.
- State badges and CTAs match the state machines.
- Timeout and unhappy cases have visible UX.
- Planned vs actual data is not mixed incorrectly.
- The design can scale to packages, subscriptions, contests, F&B, maintenance, trust score and future AI/SaaS feature flags.

