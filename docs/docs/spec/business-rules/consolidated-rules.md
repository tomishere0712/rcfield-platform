# Consolidated Business Rules — RCField

**Last updated**: 2026-07-07
**Status**: Active

> Tài liệu này tổng hợp toàn bộ 244 quy tắc nghiệp vụ (`BR-*`) của nền tảng RCField từ các tệp tin đặc tả khác nhau nhằm phục vụ tra cứu tập trung.

---

## Danh sách các phân loại

- [5.1.1 Booking & Slot Capacity Rules (`BR-BK`)](#511-booking-slot-capacity-rules)
- [5.1.2 Booking Lifecycle Operating Rules (`BR-BL`)](#512-booking-lifecycle-operating-rules)
- [5.1.3 Fleet & Vehicle Status Rules (`BR-FL`)](#513-fleet-vehicle-status-rules)
- [5.1.4 Food & Beverage (F&B) Rules (`BR-FB`)](#514-food-beverage-f-b-rules)
- [5.1.5 Check-in & Check-out Handover Inspection Rules (`BR-IN`)](#515-check-in-check-out-handover-inspection-rules)
- [5.1.6 Session Extension Rules (`BR-EX`)](#516-session-extension-rules)
- [5.1.7 Component-based Payment Engine Rules (`BR-PM`)](#517-component-based-payment-engine-rules)
- [5.1.8 Promotion & Voucher Rules (`BR-PR`)](#518-promotion-voucher-rules)
- [5.1.9 Dispute & Incident Log Rules (`BR-IR/DI`)](#519-dispute-incident-log-rules)
- [5.1.10 Branch Revenue & Provider Payout Rules (`BR-RP`)](#5110-branch-revenue-provider-payout-rules)
- [5.1.11 Contest & Tournament Rules (`BR-CT`)](#5111-contest-tournament-rules)
- [5.1.12 Universal Racing Network Rules (`BR-RN`)](#5112-universal-racing-network-rules)

---

### 5.1.1 Booking & Slot Capacity Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-BK-000-A** | — Fixed slots Hệ thống generate sẵn các khung giờ theo `cafe.slot_duration_minutes`: ``` slot_duration = 60 phút → slots: 09:00, 10:00, 11:00, ..., 21:00 slot_duration = 90 phút → slots: 09:00, 10:30, 12:00, ..., 19:30 ``` Customer chỉ được chọn `slot_start` trùng với boundary đó — không tự nhập giờ tự do. |
| **BR-BK-000-B** | — Multi-slot booking Customer chọn giờ bắt đầu + số tiếng (1h / 2h / 3h / 4h): ``` slot_start = 10:00, slot_count = 2 → slot_end = 12:00 ``` Hệ thống check tất cả N slots liên tiếp đều available trước khi cho đặt. |
| **BR-BK-000-C** | — Availability check RENTAL IF: Customer muốn đặt xe X cho sân T trong khung giờ T THEN: Xe X available khi: 1. `vehicle.status = AVAILABLE` 2. Không có `booking_vehicles` nào của xe X thuộc booking `PENDING` hoặc `CONFIRMED` overlap khung giờ T 3. `vehicle.compatible_track_types` rỗng **HOẶC** chứa `booking.track_type` customer chọn |
| **BR-BK-000-D** | — Availability check BYOC IF: Customer muốn đặt BYOC trong khung giờ T THEN: BYOC available khi: 1. Số BYOC booking trong khung giờ T có `status NOT IN ('CANCELLED')` < `cafe.byoc_capacity` 2. `booking.track_type` phải thuộc `cafe.track_types` (sân đó phải tồn tại tại chi nhánh) NOTE: Hệ thống KHÔNG kiểm tra xe của customer có phù hợp sân không — customer tự chịu trách nhiệm |
| **BR-BK-000-E** | — Nhiều khách cùng slot Nhiều customer có thể book cùng 1 khung giờ nếu mỗi người đặt xe khác nhau (RENTAL) hoặc còn chỗ BYOC: ``` Slot 10:00–11:00: Khách A → xe Traxxas Slash   ✅ Khách B → xe Arrma Kraton    ✅ (xe khác, không conflict) Khách C → BYOC               ✅ (nếu byoc_capacity chưa đầy) Khách D → xe Traxxas Slash   ❌ (xe đã bị A đặt) ``` |
| **BR-BK-000-F** | — Track type selection Customer chọn loại sân (`DRIFT` / `CIRCUIT` / `OFFROAD`) trước khi chọn xe: |
| **BR-BK-000-G** | — Multi-vehicle booking (RENTAL) IF: Customer muốn thuê nhiều xe trong 1 booking (2+ RENTAL vehicles) THEN: Tất cả xe đều phải available trong cùng khung giờ. Mỗi xe tạo 1 row trong `booking_vehicles`. NOTE: Mỗi xe có `rental_fee` riêng. NOTE: `play_mode` chỉ nhận RENTAL hoặc BYOC; giá trị MIXED còn trong enum DB nhưng code không tạo được. |
| **BR-BK-000-H** | — Guest participants (không có app) IF: Customer booking cho người khác không có app THEN: Tạo `booking_participant` với `participant_type = WALK_IN_GUEST`, điền tên + SĐT. NOTE: Người đặt chính (`is_primary_responsible = true`) vẫn chịu trách nhiệm tài chính. |
| **BR-BK-000-I** | ⛔ **KHÔNG CÒN HIỆU LỰC** — `play_mode` chỉ nhận RENTAL hoặc BYOC; giá trị MIXED không tạo được. Cột `session_vehicles.customer_vehicle_id` đã bị xoá. Nhóm vừa thuê vừa mang xe riêng phải tách thành hai booking. - Sân phải thuộc `cafe.track_types` - RENTAL: hệ thống chỉ hiển thị xe có `compatible_track_types` rỗng hoặc chứa sân đã chọn - BYOC: hiển thị tất cả sân của cafe, customer tự quyết định |
| **BR-BK-001** | — Snapshot giá tại thời điểm tạo IF: Customer tạo booking THEN: System snapshot toàn bộ giá (slot_fee_rate, rental_fee, damage_multiplier, platform_fee_pct) vào `booking.snapshot` NOTE: `platform_fee_pct` luôn bằng 0; `security_deposit_snapshot` còn cột nhưng luôn bằng 0 NOTE: Mọi tính toán tiền SAU ĐÓ đều dùng snapshot — không dùng giá hiện tại của Cafe/Vehicle |
| **BR-BK-002** | — Play mode IF: Customer chọn xe từ fleet của quán THEN: `play_mode = RENTAL`, tạo một hoặc nhiều row trong `booking_vehicles` IF: Customer mang xe cá nhân THEN: `play_mode = BYOC`; chốt xe thực tế ở `session_vehicles` |
| **BR-BK-003** | — Cafe phải ACTIVE IF: Cafe có `status ≠ ACTIVE` THEN: Không cho phép tạo booking tại cafe đó |
| **BR-BK-004** | — Không được đặt trùng slot IF: Xe đã có booking PENDING hoặc CONFIRMED trong khung giờ đó THEN: Từ chối booking mới cho xe đó trong cùng khung giờ |
| **BR-BK-005** | — Booking channels Customer có thể tạo booking qua 3 kênh: - App trực tiếp (Customer tự đặt) - Shareable link (Provider/Staff tạo link → Customer bấm vào đặt) - Staff tạo thủ công (walk-in hoặc gọi điện) |
| **BR-BK-006** | — Slot lock bằng Redis trước khi tạo booking IF: Customer xác nhận đặt lịch THEN: Hệ thống thực hiện theo thứ tự: 1. SET NX Redis key cho slot (RENTAL) hoặc INCR counter (BYOC) — TTL 1800s 2. Nếu Redis báo slot đang bị giữ → từ chối ngay, KHÔNG tạo booking 3. Nếu Redis thành công → tạo booking (status = PENDING) trong DB |
| **BR-BK-006-B** | — Window thanh toán IF: Booking ở status = PENDING THEN: Customer phải hoàn thành thanh toán trước `payment_expires_at` — mặc định 30 phút, đổi được qua `PAYMENT_WINDOW_MINUTES` IF: Thanh toán thành công THEN: `booking.status = CONFIRMED`, DEL Redis key IF: Hết 30 phút chưa thanh toán THEN: Redis key hết TTL tự giải phóng slot. Cron cập nhật status = CANCELLED + rollback promo. |
| **BR-BK-007** | — F&B pre-order gộp vào 1 lần thanh toán IF: Customer chọn F&B pre-order khi đặt lịch THEN: Tổng thanh toán = booking fee + F&B pre-order fee (1 transaction duy nhất) |
| **BR-BK-008** | — Customer huỷ trước 24h IF: Customer huỷ và thời điểm huỷ > 24h trước `slot_start` THEN: Hoàn 100% SLOT_FEE + 100% RENTAL_FEE + 100% F&B pre-order |
| **BR-BK-009** | — Customer huỷ 12–24h trước giờ chơi IF: Customer huỷ và thời điểm huỷ trong khoảng 12–24h trước `slot_start` THEN: Hoàn 50% SLOT_FEE + 100% RENTAL_FEE + 100% F&B pre-order |
| **BR-BK-010** | — Customer huỷ dưới 12h trước giờ chơi IF: Customer huỷ và thời điểm huỷ < 12h trước `slot_start` THEN: Hoàn 0% SLOT_FEE + 100% RENTAL_FEE + 100% F&B pre-order |
| **BR-BK-011** | — Provider/Staff huỷ booking IF: Provider hoặc Staff huỷ booking (bất kỳ thời điểm nào) THEN: Hoàn 100% tất cả components. Platform KHÔNG thu phí |
| **BR-BK-012** | — Huỷ sau khi đã check-in IF: Booking đã có session thực tế đang `ACTIVE`, `CHECKING_OUT` hoặc `COMPLETED` THEN: Không thể huỷ booking; xử lý bằng check-out, payment settlement và incident policy nếu có sự cố |
| **BR-BK-013** | — Timeout no-show IF: Booking đang CONFIRMED và Staff không check-in trong vòng 30 phút sau `slot_start` THEN: Auto-cancel - SLOT_FEE: hoàn 0% (phí huỷ muộn) - RENTAL_FEE: hoàn 100% - F&B pre-order: hoàn 100% |
| **BR-BK-014** | — Eligibility BYOC IF: Customer chọn BYOC THEN: Không cần điều kiện đặc biệt về trust_score |
| **BR-BK-015** | — Eligibility RENTAL xe STANDARD IF: Customer muốn thuê xe STANDARD THEN: Cho phép tất cả customer (không phụ thuộc trust_score) |
| **BR-BK-016** | — Eligibility RENTAL xe PREMIUM IF: Customer muốn thuê xe PREMIUM THEN: Cần đủ điều kiện (điều kiện cụ thể TBD — trust_score hoặc lịch sử booking) |
| **BR-BK-017** | — Eligibility RENTAL xe RESTRICTED IF: Customer muốn thuê xe RESTRICTED THEN: Hạn chế, cần xét duyệt (trust_score cao, điều kiện cụ thể TBD) |


### 5.1.2 Booking Lifecycle Operating Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-BL-001** | [Booking la ke hoach, Session la thuc te]  IF: Customer tao don dat lich THEN: He thong tao `Booking` de giu ke hoach: cafe, slot, mode, participants du kien, rental vehicles du kien, gia snapshot. NOTE: Khong xem Booking la "dang choi". Khach chi thuc su vao san khi Staff check-in va tao `Session`. |
| **BR-BL-002** | [Khong bao gio luu xe thuc te truc tiep tren Booking]  IF: Booking co thue xe cua quan THEN: Xe du kien nam trong `booking_vehicles`. IF: Khach mang xe rieng THEN: Xe BYOC chi duoc chot khi check-in qua `session_vehicles.customer_vehicle_id`. |
| **BR-BL-003** | [Check-in phai qua Staff]  IF: Booking da `CONFIRMED` va customer den quan THEN: Staff quet ma/nhap ma booking, kiem tra booking hop le, tao `Session(status=CHECKED_IN)`, ghi nhan nguoi/xe thuc te, thuc hien inspection dau vao. NOTE: Customer khong tu chuyen booking sang ACTIVE. |
| **BR-BL-004** | [Evidence la dieu kien de tinh damage]  IF: Provider muon tinh `DAMAGE_CHARGE` THEN: Phai co inspection check-in va check-out hop le: co anh va checklist, baseline duoc customer xac nhan (khong co auto-confirm). NOTE: Thieu evidence hop le thi Provider mat co so tinh damage. |
| **BR-BL-005** | [Payment settlement theo Session]  IF: Session hoan tat check-out THEN: `PaymentEngine.settle(sessionId)` xu ly component cua phien do. NOTE: Booking chi chuyen `COMPLETED` khi tat ca sessions cua booking da `COMPLETED`. |
| **BR-BL-006** | [Booking mode khong thay doi session protocol]  IF: Booking da duoc xac nhan du dieu kien vao san THEN: `SINGLE`, `PACKAGE`, `SUBSCRIPTION` deu di qua cung luong Staff check-in -> Session -> inspection -> active -> checkout. |
| **BR-BL-007** | [Availability luon la bat buoc]  IF: Customer dung package hoac lich dinh ky THEN: He thong van phai check slot, rental vehicle, BYOC capacity, cafe closure va operating hours nhu booking binh thuong. NOTE: Mua goi/lap lich truoc khong co nghia la duoc chen vao slot da full. |
| **BR-BL-008** | [Snapshot phai ghi booking mode source]  IF: Tao booking THEN: `booking.snapshot` phai ghi `booking_mode`, gia tai thoi diem tao booking, package/subscription policy neu co, va cac fee khong duoc cover boi goi. |
| **BR-BL-009** | [Payment va entitlement la hai lop rieng]  IF: Customer co quyen dung goi hoac lich co dinh THEN: Quyen dat lich chi xac dinh "co duoc tao booking khong"; deposit, rental fee, F&B, extension, damage van tinh theo policy rieng. |
| **BR-BL-010** | [Dieu kien tao Booking rental]  IF: Customer chon xe rental THEN: Moi xe phai `AVAILABLE`, khong overlap voi booking `PENDING/CONFIRMED`, va compatible voi `track_type` da chon. |
| **BR-BL-011** | [Thanh toan truoc khi den quan]  IF: Booking vua tao THEN: Booking o `PENDING`, slot bi lock toi da 30 phut, payment phai thanh cong de chuyen `CONFIRMED`. NOTE: Spec payment hien tai dung luong 2 buoc: giu/charge deposit khi confirm, cac fee con lai tinh vao checkout. |
| **BR-BL-012** | [QR/code check-in]  IF: Customer den quan THEN: Staff quet QR hoac nhap booking code. System chi cho check-in khi: - Booking thuoc cafe cua Staff. - Booking `status = CONFIRMED`. - Thoi gian hien tai nam trong cua so check-in cho phep. - Chua co session dang `CHECKED_IN`, `ACTIVE`, `EXTENDING`, `CHECKING_OUT` cho cung booking neu chinh sach chi cho mot session dong thoi. |
| **BR-BL-013** | [Tao Session khi check-in]  IF: Staff check-in thanh cong THEN: System tao `sessions(status=CHECKED_IN)`, copy planned participants sang actual participants neu co mat, tao `session_vehicles` tu xe rental thuc te va doi `vehicle.status -> IN_USE`. |
| **BR-BL-014** | [Xe thuc te co the khac xe du kien]  IF: Xe du kien hong, dang bao tri, hoac Staff doi xe cho khach THEN: `session_vehicles.vehicle_id` co the khac `booking_vehicles.vehicle_id`, nhung phai ghi note/audit va xe thay the phai `AVAILABLE`. |
| **BR-BL-015** | [Vao san chi sau khi baseline duoc confirm]  IF: Check-in inspection da du anh/checklist va customer confirm hoac qua timeout 15 phut THEN: Session chuyen `ACTIVE`, customer duoc vao san choi. |
| **BR-BL-020** | [Provider tao package theo chi nhanh]  IF: Provider tao goi slot THEN: `packages.cafe_id` bat buoc thuoc chi nhanh do; customer chi dung goi tai chi nhanh da mua. NOTE: Phase 1 khong nen cho goi dung cross-branch vi se lam phuc tap doanh thu va capacity. |
| **BR-BL-021** | [CustomerPackage la quyen su dung slot]  IF: Customer mua package thanh cong THEN: Tao `customer_packages` voi `remaining_slots = packages.slot_count`, `expires_at = purchased_at + valid_days`, `status = ACTIVE`. |
| **BR-BL-022** | [Dung package tru theo slot_count cua booking]  IF: Customer dung package de dat lich THEN: `used_slots = booking.slot_count`; he thong tru `customer_packages.remaining_slots -= used_slots`. |
| **BR-BL-023** | [Khong du slot trong goi thi tu choi booking]  IF: `remaining_slots < booking.slot_count` THEN: Tu choi tao booking voi loi `PACKAGE_NOT_ENOUGH_SLOTS`. |
| **BR-BL-024** | [Het slot thi goi DEPLETED]  IF: Sau khi tru slot, `remaining_slots = 0` THEN: `customer_packages.status -> DEPLETED`; customer khong dung goi nay de dat booking moi. |
| **BR-BL-025** | [Goi het han thi khong duoc dung]  IF: `now() > customer_packages.expires_at` THEN: `customer_packages.status -> EXPIRED`; khong cho tao booking PACKAGE moi. |
| **BR-BL-026** | [PackageUsage la audit bat buoc]  IF: `booking.booking_mode = PACKAGE` THEN: Phai co mot row `package_usages` lien ket `customer_package_id` va `booking_id`. NOTE: Khong chi update remaining_slots, vi can audit tung lan khach da dung goi. |
| **BR-BL-027** | [Rollback slot goi khi booking khong thanh cong]  IF: Booking PACKAGE fail payment deposit, bi cancel truoc check-in theo policy duoc hoan slot, hoac system rollback transaction THEN: Phai hoan lai `remaining_slots` va mark `package_usages` cancelled/void bang audit note. NOTE: Phase 1 neu chua co status tren `package_usages`, can ghi note hoac tao adjustment usage am trong service. |
| **BR-BL-028** | [Package cover fee can snapshot ro]  IF: Package cover `SLOT_FEE` hoac cover them `RENTAL_FEE` THEN: `booking.snapshot.package_coverage` phai ghi ro component nao duoc cover. NOTE: De giam scope, khuyen nghi Phase 1: goi 10 slot cover `SLOT_FEE`; rental/deposit/F&B/extension/damage tinh rieng. Neu mentor muon goi cover ca rental, can them policy ro tren package snapshot. |
| **BR-BL-030** | [Subscription la rule sinh booking]  IF: Customer tao lich co dinh THEN: Tao row `subscriptions`; khong dung row nay de check-in. Moi lan choi phai co mot `booking` rieng duoc sinh tu subscription. |
| **BR-BL-031** | [Booking sinh tu subscription phai co subscription_id]  IF: Booking duoc sinh boi lich co dinh THEN: `booking.booking_mode = SUBSCRIPTION`, `booking.source = SYSTEM_SUBSCRIPTION`, va `booking.subscription_id` bat buoc co gia tri. |
| **BR-BL-032** | [Scheduler phai check availability tung lan sinh booking]  IF: Scheduler sap sinh occurrence moi THEN: Phai check cafe open, cafe_closures, slot boundary, rental vehicle availability, BYOC capacity va track type. NOTE: Chi check luc tao subscription la chua du, vi tuong lai co the co booking khac, xe maintenance, hoac ngay dong cua. |
| **BR-BL-033** | [Conflict khong duoc tu dong chen lich]  IF: Occurrence bi conflict THEN: Khong tao booking `CONFIRMED`; he thong tao notification/action required de customer/staff chon slot khac. NOTE: Tranh viec lich co dinh lam double-booking. |
| **BR-BL-034** | [Subscription cancellation khong xoa booking da sinh]  IF: Customer cancel/pause subscription THEN: Khong sinh booking moi trong tuong lai; booking da sinh van theo cancellation/no-show rule rieng. |
| **BR-BL-035** | [Subscription payment policy can chot]  IF: Subscription co thu phi truoc theo ky THEN: Snapshot phai ghi ky thanh toan va booking sinh ra co the `CONFIRMED` neu ky da paid. IF: Subscription chi la lich giu cho khach quen THEN: Moi booking sinh ra co the `PENDING` va customer thanh toan trong payment window. NOTE: Khuyen nghi cho team 4 nguoi: Phase 1 de subscription la lich co dinh sinh booking `PENDING/CONFIRMED` theo mock policy, khong lam billing recurring phuc tap. |
| **BR-BL-036** | [Fixed schedule khong thay the package]  IF: Customer vua co package vua muon lich co dinh THEN: Can chot policy: subscription occurrence co the tru package neu customer chon `customer_package_id`, hoac chi dung SINGLE payment. NOTE: De giam scope, Phase 1 nen tach: PACKAGE la dat thu cong bang so slot; SUBSCRIPTION la lich co dinh, payment theo tung booking. |
| **BR-BL-040** | [F&B pre-order gan Booking]  IF: Customer dat mon truoc khi den THEN: `FnbOrder(type=PRE_ORDER)` gan voi `booking_id`, co the tao cung Booking. NOTE: Pre-order la mot phan cua ke hoach dat lich. |
| **BR-BL-041** | [Staff xac nhan pre-order tai check-in]  IF: Booking co F&B pre-order THEN: Man hinh check-in cua Staff phai hien danh sach mon de xac nhan chuan bi/giao cho customer. |
| **BR-BL-042** | [Platform fee tren F&B]  IF: Thanh toan co F&B THEN: Platform fee = 0% tren F&B theo `BR-FnB`; payment engine can tach component de audit ro. |
| **BR-BL-050** | [On-site F&B chi tao trong Session hop le]  IF: Customer order tai quan THEN: Session phai dang `ACTIVE` hoac theo chinh sach van hanh cho phep trong `CHECKING_OUT`. NOTE: Khong tao on-site order cho booking chua check-in. |
| **BR-BL-051** | [On-site F&B khong qua payment gateway platform]  IF: F&B la `ON_SITE` THEN: Customer thanh toan truc tiep cho Provider; platform chi ghi order/audit, khong thu ho va khong tinh platform fee. |
| **BR-BL-060** | [Chi gia han khi Session ACTIVE]  IF: Session khong phai `ACTIVE` THEN: Staff khong duoc tao extension proposal. |
| **BR-BL-061** | [Customer quyet dinh gia han]  IF: Staff de xuat gia han THEN: Customer approve/reject; neu im lang 10 phut thi auto-reject va session quay lai `ACTIVE`. |
| **BR-BL-062** | [Extension fee cap]  IF: Tong extension fee sau khi them lan moi > 50% tong security deposit cua session THEN: Tu choi gia han. |
| **BR-BL-063** | [Extension tinh vao checkout]  IF: Extension duoc approve THEN: Tao `PaymentComponent(type=EXTENSION_FEE)` va tinh vao settlement khi check-out. NOTE: Can chot lai voi team BE: `BR-extension.md` ghi HELD, `03-payment-engine.md` ghi PENDING. De dong bo payment engine, tai lieu nay de xuat `PENDING` cho extension fee cho den checkout. |
| **BR-BL-070** | [BYOC khong co rental fee/deposit xe quan]  IF: Booking `play_mode = BYOC` THEN: Khong tao `booking_vehicles`, khong co rental fee/security deposit cho fleet vehicle. NOTE: Van co slot fee va co the co F&B/pre-order/package/promotion. |
| **BR-BL-071** | [BYOC capacity check khi booking]  IF: Customer dat BYOC THEN: He thong check `cafe.byoc_capacity` theo slot va track type cua cafe. |
| **BR-BL-072** | [BYOC vehicle chot khi check-in]  IF: Customer den quan voi xe ca nhan THEN: Staff chon/tao `customer_vehicle`, tao `session_vehicle(vehicle_source=BYOC)`, thuc hien inspection check-in cho xe BYOC va facility baseline neu can. |
| **BR-BL-073** | ⛔ **KHONG CON HIEU LUC** — `play_mode` chi nhan RENTAL hoac BYOC; cot `session_vehicles.customer_vehicle_id` da bi xoa cung bang `customer_vehicles`. |
| **BR-BL-080** | [QR/code chi la dinh danh, khong phai quyen vao san]  IF: Customer dua QR/code THEN: Staff scan de tim booking, nhung he thong van phai validate status, cafe, time window, payment va risk flags. |
| **BR-BL-081** | [Time window check-in]  IF: Current time < slot_start tru mot khoang early check-in cho phep THEN: Khong cho start session, hoac can manager override. IF: Current time > slot_start + 30 phut va chua co session THEN: Booking bi xu ly `NO_SHOW`. |
| **BR-BL-082** | [Staff phai thuoc cafe]  IF: Staff khong duoc assign vao cafe cua booking THEN: Khong duoc check-in/check-out booking do. |
| **BR-BL-083** | [Planned vs actual participants]  IF: Nguoi den thuc te khac danh sach dat truoc THEN: Staff cap nhat `session_participants`; khong sua nguoc `booking_participants` tru khi co luong edit booking rieng. |
| **BR-BL-090** | [Check-out bat dau tu Session ACTIVE]  IF: Customer het gio hoac muon dung som THEN: Staff chuyen session `ACTIVE -> CHECKING_OUT` va thuc hien inspection check-out. |
| **BR-BL-091** | [Khong damage]  IF: Check-out inspection khong co damage moi THEN: Staff hoan tat check-out; settlement tinh slot/rental/extension/F&B va hoan tat session. Khong co auto-confirm. |
| **BR-BL-092** | [Co damage]  IF: Staff danh dau damage moi THEN: Staff nhap mo ta, estimate cost; he thong tinh `damage_charge = tong (parts_price + labor_price)` cua damage_line_items; customer confirm hoac phan doi. NOTE: Khong co timeout tu dong chot tien hu hong. |
| **BR-BL-093** | [Phan doi damage]  IF: Customer khong dong y damage THEN: He thong tao incident/dispute tuy muc do; deposit/payment hold giu theo policy cho den khi resolved/waived. |
| **BR-BL-094** | [Vehicle release]  IF: Session completed va rental vehicle khong can maintenance THEN: `vehicle.status -> AVAILABLE`. IF: Damage can xu ly THEN: Staff/Provider co the dua xe sang `MAINTENANCE`. |


### 5.1.3 Fleet & Vehicle Status Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-FL-001** | — Phân loại tier Ba tier cho xe trong fleet, theo thứ tự tăng dần về giá trị và rủi ro: |
| **BR-FL-002** | — Giá thuê theo từng chi nhánh IF: Provider cấu hình xe cho 1 chi nhánh THEN: `hourly_rate` là config riêng của chi nhánh đó. `vehicle_catalogs.security_deposit` còn cột nhưng không vào công thức nào — hệ thống đã bỏ cọc. |
| **BR-FL-003** | — Xe chỉ cho thuê khi AVAILABLE IF: `vehicle.status ≠ AVAILABLE` THEN: Không thể tạo booking RENTAL cho xe đó |
| **BR-FL-004** | — Xe chuyển sang IN_USE khi check-in (session) IF: Staff check-in thành công → tạo session THEN: Với mỗi session_vehicle có `vehicle_source = 'RENTAL'`, `vehicle.status → IN_USE` |
| **BR-FL-005** | — Xe trở về AVAILABLE sau check-out (session) IF: Session COMPLETED (hoặc CANCELLED sau khi đã IN_USE) THEN: Với mỗi session_vehicle có `vehicle_source = 'RENTAL'`, `vehicle.status → AVAILABLE` |
| **BR-FL-006** | — Xe MAINTENANCE không cho thuê IF: Provider/Staff đánh dấu xe cần bảo trì (`status = MAINTENANCE`) THEN: Không thể tạo booking mới cho xe đó cho đến khi status trở về AVAILABLE |
| **BR-FL-007** | — Xe RETIRED IF: `vehicle.status = RETIRED` THEN: Không thể tạo booking. Không thể chuyển về AVAILABLE. Chỉ dùng cho lưu trữ lịch sử. |
| **BR-FL-008** | — Fleet thuộc về chi nhánh Mỗi xe (`Vehicle`) thuộc về đúng 1 `Cafe` (chi nhánh). Xe không thể chia sẻ giữa các chi nhánh. |
| **BR-FL-009** | — Staff chỉ thao tác trong phạm vi vận hành được phép IF: Staff không thuộc phạm vi vận hành cafe X theo account/provider policy Phase 1 THEN: Staff không thể check-in/check-out xe của cafe X NOTE: Bảng `staff_cafe_assignments` chi tiết chuyển sang Phase 2. |
| **BR-FL-010** | — Xe RENTAL gắn với sân cụ thể IF: `vehicle.compatible_track_types` không rỗng (VD: `['DRIFT']`) THEN: Xe đó chỉ available để book khi customer chọn đúng track type đó NOTE: Dùng cho xe chuyên dụng — xe drift chỉ ra sân DRIFT, không dùng sân CIRCUIT hay OFFROAD |
| **BR-FL-011** | — Xe RENTAL dùng được mọi sân IF: `vehicle.compatible_track_types` rỗng (`[]`) THEN: Xe đó available cho tất cả track type mà chi nhánh có |
| **BR-FL-012** | — BYOC không bị giới hạn track IF: `bookings.play_mode = BYOC` hoặc `MIXED` có xe BYOC THEN: Customer chọn bất kỳ sân nào của chi nhánh — hệ thống không kiểm tra tính tương thích NOTE: Customer tự chịu trách nhiệm về xe cá nhân có phù hợp sân không |


### 5.1.4 Food & Beverage (F&B) Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-FB-001** | — Pre-order khi tạo booking IF: Customer tạo booking THEN: Customer có thể chọn F&B pre-order từ menu của chi nhánh (optional) |
| **BR-FB-002** | — Pre-order gộp 1 lần thanh toán IF: Customer có chọn F&B pre-order THEN: Tổng thanh toán = booking fee + F&B pre-order fee → 1 transaction qua payment gateway NOTE: Không yêu cầu Customer thanh toán 2 lần riêng biệt |
| **BR-FB-003** | — Staff confirm pre-order khi check-in IF: Check-in bắt đầu và booking có F&B pre-order THEN: Staff xác nhận đã chuẩn bị xong F&B pre-order cho Customer |
| **BR-FB-004** | — Menu theo từng chi nhánh Mỗi chi nhánh (Cafe) có menu F&B riêng. Customer chỉ thấy menu của chi nhánh mình đặt lịch. |
| **BR-FB-005** | — Staff ghi order tại quán IF: Customer muốn gọi thêm đồ trong khi chơi THEN: Staff ghi order vào app (FbOrder record) |
| **BR-FB-006** | — Thanh toán trực tiếp cho quán IF: F&B on-site THEN: Customer thanh toán trực tiếp cho Provider (tiền mặt hoặc chuyển khoản) NOTE: Platform KHÔNG làm trung gian, KHÔNG thu tiền F&B on-site |
| **BR-FB-007** | — Platform không thu phí F&B Platform fee = 0% trên toàn bộ F&B (cả pre-order và on-site) |
| **BR-FB-008** | — Provider quản lý menu Provider (hoặc Staff được uỷ quyền) có thể thêm/sửa/xoá item trong menu F&B của từng chi nhánh |
| **BR-FB-009** | — Item có thể bật/tắt Provider có thể tạm ẩn item khi hết hàng mà không cần xoá khỏi menu |


### 5.1.5 Check-in & Check-out Handover Inspection Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-IN-001** | — Ảnh theo bốn góc (quy ước, CHƯA cưỡng chế). Schema hiện tại `photos: z.array(...).max(6).optional()` — tối đa 6 ảnh, không bắt buộc ảnh nào. Thiếu góc vẫn submit được. |
| **BR-IN-002** | — Checklist: các trường `scratches`, `cracks`, `missing_parts`, `notes` được thiết kế để điền đủ, nhưng tầng schema chưa bắt buộc. |
| **BR-IN-003** | — Pre_existing_flag chỉ có giá trị khi Cả 3 điều kiện phải đúng: 1. 4 ảnh đầy đủ 2. Checklist đầy đủ 3. Customer đã confirm inspection |
| **BR-IN-004** | — Chỉ 1 check-in per session Mỗi session chỉ được có đúng 1 `Inspection` loại `CHECK_IN` |
| **BR-IN-005** | — Staff phải thuộc chi nhánh IF: Staff không được assign vào chi nhánh của session đó (`staff_cafe_assignments`) THEN: Không thể thực hiện check-in |
| **BR-IN-006** | — RENTAL check-in: lấy xe từ fleet IF: `play_mode = RENTAL` hoặc session vehicle có `vehicle_source = RENTAL` THEN: Staff lấy xe → `vehicle.status → IN_USE` → chụp 4 góc xe → checklist |
| **BR-IN-007** | — BYOC check-in: xe của Customer IF: `play_mode = BYOC` hoặc session vehicle có `vehicle_source = BYOC` THEN: Staff chụp 4 góc xe của Customer + ảnh cơ sở vật chất (track, barriers) Checklist an toàn: `battery_secured`, `no_sharp_protrusions`, `weight_compliant`, `notes` |
| **BR-IN-008** | — Customer confirm check-in IF: Inspection CHECK_IN được tạo THEN: Push notification đến Customer → Customer xem ảnh + checklist → confirm Không có timeout. Chưa xác nhận thì inspection cứ chờ — hệ thống không tự xác nhận thay khách. |
| **BR-IN-009** | — Session chuyển ACTIVE sau check-in IF: Customer confirm check-in THEN: `session.status → ACTIVE` |
| **BR-IN-010** | — Check-out bắt đầu từ ACTIVE IF: Staff bắt đầu check-out THEN: `session.status → CHECKING_OUT` ngay lập tức |
| **BR-IN-011** | — Chụp cùng 4 góc như check-in Staff chụp lại 4 góc (FRONT, BACK, LEFT, RIGHT) để so sánh với ảnh check-in |
| **BR-IN-012** | — Staff đánh dấu damage Hệ thống KHÔNG so sánh tự động; staff tự đối chiếu hai bản ghi rồi chọn: - "Không có damage" → notify Customer confirm check-out - "Có damage mới" → nhập mô tả + ước tính damage_cost → notify Customer |
| **BR-IN-013** | — Customer xác nhận không có damage. Không có timeout tự động; session chuyển COMPLETED khi staff hoàn tất check-out. |
| **BR-IN-014** | — Customer nhận damage notification Không có timeout tự động chốt tiền hư hỏng. IF: Customer xác nhận → COMPLETED IF: Customer từ chối → có 2 hướng xử lý: - Tạo `incidents` (incident policy-based): Staff/Admin áp rule, ghi `responsible_party` + `resolution_note` - Mở `disputes` (tranh chấp chính thức): Admin xét xử dựa trên digital evidence từ inspection |
| **BR-IN-015** | — Cloudinary folder convention ``` inspections/{session_id}/{session_vehicle_id}/{check_in\|check_out}/{front\|back\|left\|right} ``` Upload lên Cloudinary → lấy URL về lưu vào `inspection_photos.url`; checklist lưu ở `inspection_checklists`. |
| **BR-IN-016** | — Retention - Tối thiểu 90 ngày sau booking COMPLETED - Nếu có incident: giữ đến 30 ngày sau incident RESOLVED/WAIVED - Nếu có dispute: giữ đến 30 ngày sau dispute RESOLVED |


### 5.1.6 Session Extension Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-EX-001** | — Chỉ gia hạn khi session ACTIVE IF: `session.status ≠ ACTIVE` THEN: Không thể đề xuất gia hạn NOTE: Đặc biệt — không cho phép gia hạn khi đang ở CHECKING_OUT |
| **BR-EX-002** | — Staff đề xuất, Customer quyết định IF: Staff bấm "Đề xuất gia hạn" THEN: `session.status → EXTENDING` + Push notification đến Customer Customer chọn: Approve → gia hạn \| Reject → tiếp tục session bình thường |
| **BR-EX-003** | — Gần hết giờ → notify IF: Còn X phút trước `session.planned_end_at` (thời gian cụ thể TBD) |
| **BR-EX-004** | — Không có trần phí gia hạn. Quy tắc cũ `max_extension_fee = security_deposit × 50%` không còn hiệu lực: đã bỏ cọc và mã nguồn không có đoạn kiểm tra trần nào. |
| **BR-EX-004** | — Nhiều lần gia hạn Cho phép gia hạn nhiều lần trong 1 session, với điều kiện tổng phí không vượt cap (BR-EX-005) |
| **BR-EX-005** | — Từ chối khi vượt cap IF: `tổng extension_fee tích lũy + extension_fee_mới > max_extension_fee` THEN: Từ chối extension proposal. Notify Customer đã đạt giới hạn gia hạn. |
| **BR-EX-005** | — Slot_end cập nhật IF: Extension được approve THEN: `session.planned_end_at` cập nhật theo thời gian gia hạn mới |
| **BR-EX-007** | — Extension fee là post-paid IF: Extension được approve THEN: Tạo `EXTENSION_FEE` component (HELD). Khoản này trừ vào `SECURITY_DEPOSIT` khi settle. |


### 5.1.7 Component-based Payment Engine Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-PM-001** | — Snapshot-first Mọi tính toán tiền đều đọc từ `booking.snapshot` — KHÔNG dùng giá hiện tại của Cafe hoặc Vehicle |
| **BR-PM-002** | — Immutable ledger Không được update `amount` của PaymentComponent đã tạo. Nếu cần điều chỉnh → tạo component mới |
| **BR-PM-003** | — Component isolation Mỗi PaymentComponent có vòng đời độc lập (PENDING → HELD → DISBURSED / REFUNDED) |
| **BR-PM-004** | — Components khi booking CONFIRMED IF: Booking chuyển sang CONFIRMED (thanh toán thành công) THEN: Tạo các components sau: - `SLOT_FEE` (HELD) — luôn tạo - `RENTAL_FEE` (HELD) — tạo cho mỗi xe thuê trong `booking_vehicles` - `SECURITY_DEPOSIT` (HELD) — tạo cho mỗi xe thuê trong `booking_vehicles` |
| **BR-PM-004** | [a] — FB_PREORDER component IF: Booking có F&B pre-order THEN: Tạo `FB_PREORDER` (HELD) component, gộp vào 1 lần thanh toán |
| **BR-PM-005** | — Extension fee component IF: Extension được approve (theo session) THEN: Tạo `EXTENSION_FEE` (PENDING), liên kết `session_id`, thu ở checkout. Không có trần cộng dồn. |
| **BR-PM-006** | — Damage charge component IF: Check-out có damage và staff ghi nhận hạng mục hư hỏng THEN: Tạo `DAMAGE_CHARGE`, thu ở checkout |
| **BR-PM-007** | — Disburse về Provider (khi session COMPLETED) Khi session COMPLETED, disburse các components sau về Provider cho session đó: - `SLOT_FEE` (toàn bộ hoặc pro-rata nếu early checkout) - `RENTAL_FEE` (từng xe) - `EXTENSION_FEE` - `DAMAGE_CHARGE` (nếu có) |
| **BR-PM-008** | — Hoàn deposit về Customer (khi session COMPLETED) Khi session COMPLETED: - Nếu không có damage: hoàn 100% `SECURITY_DEPOSIT` về Customer - Nếu có damage: hoàn phần còn lại sau khi trừ `DAMAGE_CHARGE` |
| **BR-PM-009** | — Platform fee ``` platform_fee = 0 ``` Nền tảng không thu phần trăm trên bất kỳ khoản nào của booking. `platform_fee_pct` đặt cứng bằng 0 trong payment.service.ts. Doanh thu nền tảng là phí thuê bao SaaS và phí tổ chức giải. |
| **BR-PM-010** | — R1: Customer huỷ (theo thời điểm) |
| **BR-PM-011** | — R2: Provider huỷ IF: Provider huỷ booking THEN: Hoàn 100% tất cả components. Platform KHÔNG thu phí. |
| **BR-PM-012** | — R3: Timeout / No-show IF: Customer no-show (không check-in trong 30 phút sau slot_start) THEN: - SLOT_FEE: hoàn 0% - RENTAL_FEE: hoàn 100% - F&B pre-order: hoàn 100% |
| **BR-PM-013** | — Công thức tính damage ``` damage_charge = base_damage_cost × vehicle.damage_multiplier ``` |
| **BR-PM-014** | — Không bù trừ vào cọc. Không có cọc để trừ; toàn bộ `damage_charge` là khoản thu thêm ở checkout. |
| **BR-PM-015** | — (đã gộp vào BR-PM-014: không còn cọc để so sánh) |
| **BR-PM-016** | — Pre-existing damage không tính IF: Hư hỏng đã được flag ở check-in (`pre_existing_flag = true`) VÀ customer đã confirm THEN: KHÔNG tính `damage_charge` cho hư hỏng đó |
| **BR-PM-017** | — F&B pre-order: gộp 1 transaction IF: Customer đặt F&B pre-order khi booking THEN: Thanh toán F&B pre-order gộp cùng booking fee vào 1 lần qua gateway |
| **BR-PM-018** | — F&B on-site: ngoài platform IF: Staff ghi F&B order tại quán THEN: Customer trả thẳng Provider (tiền mặt hoặc chuyển khoản). Platform không xử lý khoản này. |


### 5.1.8 Promotion & Voucher Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-PR-001** | — Scope của mã giảm giá Mỗi promotion có `cafe_id`: |
| **BR-PR-002** | — Ai được tạo mã |
| **BR-PR-003** | — Thứ tự validate (fail nhanh — dừng ngay lỗi đầu tiên) |
| **BR-PR-004** | — Công thức tính giảm giá |
| **BR-PR-005** | — Những gì KHÔNG được discount. Mã giảm giá chỉ áp lên `slot_fee` và `rental_fee`; không áp lên F&B, lệ phí giải, phí gia hạn hay tiền hư hỏng. |
| **BR-PR-006** | — Thời điểm lock usage Mã được lock tại thời điểm tạo booking (status = PENDING): |
| **BR-PR-007** | — Rollback khi booking bị huỷ trước khi thanh toán IF: Booking bị auto-cancel do hết 30 phút payment window (status PENDING → CANCELLED) THEN: Cron job xử lý (không dùng Redis — promo rollback là DB operation): ``` UPDATE promotions SET uses_count = uses_count - 1 WHERE id = :promoId; DELETE FROM promotion_usages WHERE booking_id = :bookingId; ``` NOTE: Redis TTL chỉ giải phóng slot (availability). Promo rollback do cron đảm nhiệm sau đó. |
| **BR-PR-008** | — 1 booking chỉ dùng 1 mã `promotion_usages.booking_id` có UNIQUE constraint — không thể áp 2 mã cho 1 booking. |
| **BR-PR-009** | — Platform fee tính trên số tiền sau discount |
| **BR-PR-010** | — Promo phải được ghi vào snapshot tại thời điểm tạo booking |
| **BR-PR-011** | — Hoàn tiền tính trên `total_charge`, không phải `subtotal` |


### 5.1.9 Dispute & Incident Log Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-DI-001** | — Ai có thể mở dispute - Customer: mở dispute khi không đồng ý với damage charge tại check-out - Customer hoặc Staff: mở dispute bất kỳ lúc nào session đang ACTIVE (sự cố trong khi chơi) |
| **BR-DI-002** | — Không thể mở dispute sau COMPLETED IF: `booking.status = COMPLETED` THEN: Không thể mở dispute — window đã đóng. |
| **BR-DI-003** | — Chỉ 1 dispute per booking Mỗi booking chỉ có tối đa 1 `disputes` record. |
| **BR-DI-004** | — Evidence là inspection Check-in photos + checklist = baseline. Check-out photos + checklist = current state. Admin so sánh để phán quyết. |
| **BR-DI-005** | — Provider mất quyền tính damage nếu thiếu evidence IF: Staff không hoàn thành inspection protocol (thiếu ảnh hoặc checklist) THEN: Provider mất quyền tính `DAMAGE_CHARGE`. |
| **BR-DI-006** | — Pre-existing damage được bảo vệ IF: Hư hỏng đã ghi nhận ở check-in (`pre_existing_flag = true`) VÀ customer đã confirm THEN: Admin KHÔNG tính khoản đó là damage mới khi xét dispute. |
| **BR-DI-007** | — Chỉ Admin xét xử IF: Dispute đang `OPEN` hoặc `UNDER_REVIEW` THEN: Chỉ ADMIN (team RCField) có quyền resolve, ghi `resolution`, `resolution_favor`, `resolved_by`, `resolved_at`. |
| **BR-IR-001** | — Incident là log sự cố vận hành IF: Có hư hỏng, va chạm, mất phụ kiện hoặc sự cố trong session THEN: Tạo `incidents` gắn với `session_id`. |
| **BR-IR-002** | — Evidence dùng inspection IF: Incident liên quan damage THEN: Evidence chính là `inspections`, `inspection_photos`, `inspection_checklists`. |
| **BR-IR-003** | — Không đủ evidence thì không tính phí IF: Thiếu check-in hoặc check-out inspection hợp lệ THEN: Không tạo `DAMAGE_CHARGE`, hoặc set `incidents.status = WAIVED`. |
| **BR-IR-004** | — Rental damage IF: Damage mới trên xe thuê được xác nhận bằng inspection THEN: `responsible_party = CUSTOMER`, `final_amount = min(estimated_amount × damage_multiplier, deposit_cap_policy)`. |
| **BR-IR-005** | — BYOC damage IF: Xe BYOC bị hư hại THEN: Staff/Admin ghi nhận incident; chỉ charge customer nếu evidence cho thấy customer gây thiệt hại cho tài sản quán hoặc xe thuê. |
| **BR-IR-006** | — Staff/facility fault IF: Evidence cho thấy lỗi do staff hoặc cơ sở vật chất THEN: `responsible_party = PROVIDER` hoặc `STAFF`, `final_amount = 0` với customer. |
| **BR-IR-007** | — Shared/unknown responsibility IF: Không đủ bằng chứng phân trách nhiệm rõ ràng THEN: `responsible_party = UNKNOWN` hoặc `SHARED`, `final_amount` do Admin/Staff quyết định. |
| **BR-IR-008** | — Incident hoàn tất khi có đủ: `status = RESOLVED / WAIVED` + `responsible_party` + `final_amount` + `resolution_note` + `resolved_by` + `resolved_at`. |
| **BR-IR-009** | — Payment adjustment không sửa ledger cũ IF: Resolution cần thu phí THEN: Tạo payment component mới (`DAMAGE_CHARGE`) thay vì sửa component cũ. |


### 5.1.10 Branch Revenue & Provider Payout Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-RP-001** | [Không tạo Customer wallet]  IF: Customer thanh toán booking THEN: Tiền đi qua gateway/payment transaction, không cộng vào ví customer. NOTE: Refund hiển thị là refund transaction hoặc refund record, không phải nạp tiền vào ví. |
| **BR-RP-002** | [Không tạo Provider wallet rút tiền]  IF: Provider có doanh thu THEN: Hệ thống hiển thị doanh thu và khoản phải payout, không tạo balance có thể rút như ví. NOTE: "Provider balance" dễ bị hiểu là ví điện tử/tiền lưu trữ, tăng rủi ro pháp lý và audit. |
| **BR-RP-003** | [Chỉ làm ledger kế toán nội bộ]  IF: Cần minh bạch dòng tiền THEN: Dùng `payment_components`, `payment_transactions`, `settlement_batches` đề xuất, và report. NOTE: Ledger là lịch sử tính toán/audit, không phải tài khoản tiền điện tử. |
| **BR-RP-010** | [Mọi giao dịch phải truy vết được]  IF: Có payment/refund/payout/commission THEN: Phải truy vết được theo `booking_id`, `session_id`, `cafe_id`, `provider_id`, `customer_id`, `component_type`, `transaction_id`. |
| **BR-RP-011** | [Hoa hồng phải hiển thị trước khi settle]  IF: Session sắp settle THEN: Provider/Admin phải xem được gross amount, platform fee, net payout, refund, damage, F&B excluded. |
| **BR-RP-012** | [F&B on-site là dòng tiền ngoài platform]  IF: Customer gọi món tại quán và trả tiền mặt/chuyển khoản trực tiếp THEN: Hệ thống chỉ ghi nhận doanh thu vận hành của chi nhánh, không tính platform fee và không payout. |
| **BR-RP-020** | [Doanh thu thuộc chi nhánh phát sinh đơn]  IF: Booking thuộc `cafe_id = Cafe A` THEN: Tất cả doanh thu slot/rental/F&B/pre-order/extension/damage của booking/session đó được gắn về Cafe A. NOTE: Provider xem tổng chuỗi, nhưng mỗi chi nhánh phải có P&L riêng. |
| **BR-RP-021** | [Provider là owner tổng hợp]  IF: Provider có nhiều cafe THEN: Dashboard provider hiển thị: - Tổng doanh thu toàn provider. - Breakdown theo từng cafe. - Breakdown theo component: slot, rental, extension, damage, F&B. - Commission platform. - Net payout. |
| **BR-RP-022** | [Staff chỉ xem phạm vi chi nhánh]  IF: Staff thuộc Cafe A THEN: Staff chỉ xem booking/session/order của Cafe A; không xem doanh thu Cafe B. |
| **BR-RP-030** | [Customer receipt theo component]  IF: Booking/session completed THEN: Customer receipt phải hiển thị từng component, không chỉ tổng tiền. |
| **BR-RP-031** | [Staff view ưu tiên vận hành]  IF: User role là Staff THEN: UI ưu tiên check-in/out, order, inspection; doanh thu chỉ ở mức ca/ngày của chi nhánh nếu provider cấp quyền. |
| **BR-RP-032** | [Provider drill-down từ tổng về đơn]  IF: Provider thấy doanh thu ngày/tháng THEN: Provider phải drill-down được: Provider total -> Cafe -> Booking -> Session -> PaymentComponent. |
| **BR-RP-040** | [Provider phải cấu hình payout profile]  IF: Provider muốn nhận payout THEN: Provider cần cấu hình payout profile trước khi được mark `ACTIVE` hoặc trước booking đầu tiên. |
| **BR-RP-041** | [Branch payout override là optional]  IF: Provider muốn mỗi chi nhánh nhận tiền vào tài khoản riêng THEN: Cho phép `cafe_payout_profile` override profile provider. NOTE: Phase 1 có thể chưa cần bảng riêng, chỉ cần revenue report theo cafe và payout về provider-level bank. |
| **BR-RP-042** | [Không payout khi còn dispute nghiêm trọng]  IF: Session có dispute/damage chưa resolved THEN: Khoản liên quan giữ ở trạng thái `PENDING_SETTLEMENT` hoặc `ON_HOLD` trong report. |
| **BR-RP-050** | [Settlement report theo chu kỳ]  IF: Đến cuối ngày hoặc cuối tuần THEN: Hệ thống gom các session đã completed thành settlement report theo provider/cafe. |
| **BR-RP-051** | [Payout amount]  ``` gross_revenue = SLOT_FEE + RENTAL_FEE + EXTENSION_FEE + DAMAGE_CHARGE + FNB_PREORDER + FNB_ON_SITE + CONTEST_ENTRY_FEE platform_fee = 0 net_payout = gross_revenue - refunds - provider_penalties ``` |
| **BR-RP-052** | [Payout status]  Mỗi payout/report nên có status: |


### 5.1.11 Contest & Tournament Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-CT-001** | [Contest không phải booking thường]  IF: Provider tổ chức một giải RC THEN: Tạo `Contest`, `ContestCafe`, `ContestRegistration`, `ContestMatch` thay vì tạo booking giả. |
| **BR-CT-002** | [Một contest phase này là một hạng mục]  IF: Provider muốn tách Beginner/Open/BYOC/Rental Spec trong cùng event THEN: Tạo nhiều contest riêng hoặc đưa multi-class vào backlog. |
| **BR-CT-003** | [Config linh hoạt nằm trong `contests.config`]  IF: Format, rule, prize, leaderboard cần thay đổi theo từng giải THEN: Dùng JSON config, không tạo bảng riêng trừ khi có workflow thật sự cần. |
| **BR-CT-010** | [Provider owner là người sở hữu contest]  IF: User thao tác contest core THEN: `contest.provider_id` phải bằng user id, trừ endpoint staff event-day được phép. |
| **BR-CT-011** | [Staff không xem full provider registration list]  IF: Staff vận hành event-day THEN: Staff dùng lookup bằng check-in code và chỉ thao tác tại cafe staff được assign. |
| **BR-CT-012** | [Staff chỉ thao tác ở cafe tham gia contest]  IF: Staff check-in hoặc nhập result THEN: Staff phải thuộc một cafe trong `contest_cafes`. |
| **BR-CT-013** | [Contest không tự động cross-provider] IF: Provider tạo contest THEN: `participating_cafe_ids` chỉ được chứa cafe ACTIVE thuộc Provider đó. Contest toàn platform phải đi qua Universal Racing Network/Admin orchestration ở phase sau. |
| **BR-CT-020** | [OPEN cần config đủ]  IF: Provider gọi open THEN: Contest phải có cafe tham gia, time range hợp lệ, capacity > 0, registration window, vehicle_rule/config tối thiểu. |
| **BR-CT-021** | [CLOSE khóa registration]  IF: Contest chuyển `OPEN -> CLOSED` THEN: Không nhận registration mới. |
| **BR-CT-022** | [Generate schedule chỉ sau close]  IF: Provider/Staff generate matches THEN: Contest phải ở `CLOSED` hoặc `RUNNING`. |
| **BR-CT-030** | [Chỉ đăng ký khi OPEN]  IF: Contest không ở `OPEN` hoặc ngoài registration window THEN: Reject registration. |
| **BR-CT-031** | [Capacity tính registration active]  IF: Capacity đã full THEN: Reject registration trong phase này. Waitlist là backlog. |
| **BR-CT-032** | [Một user một registration]  IF: User đã có registration chưa cancelled trong contest THEN: Reject duplicate. |
| **BR-CT-033** | [Vehicle source phải theo rule]  IF: Contest `vehicle_rule.vehicle_policy = RENTAL_ONLY` THEN: Reject BYOC. Tương tự cho `BYOC_ONLY`. |
| **BR-CT-034** | [Check-in chỉ cho CONFIRMED]  IF: Registration không ở `CONFIRMED` THEN: Reject check-in. |
| **BR-CT-035** | [Cancel cần reason khi Provider/Staff cancel]  IF: Provider hủy registration THEN: Bắt buộc reason để audit. |
| **BR-CT-040** | [Drivers per match là config]  IF: Provider generate schedule THEN: `drivers_per_match` quyết định số participant tối đa mỗi match, không hard-code 2 người. |
| **BR-CT-041** | [Registration hợp lệ để đưa vào match]  IF: Registration status không phải `CONFIRMED` hoặc `CHECKED_IN` THEN: Không được đưa vào match. |
| **BR-CT-042** | [Drag/drop participants không đổi identity]  IF: Provider/Staff reorder slot/lane/grid THEN: Chỉ update `slot_no`, `lane`, `grid_position`, `seed_no`; không tạo registration mới. |
| **BR-CT-043** | [Result thủ công phải có reason]  IF: Staff submit result THEN: Ghi reason và audit `match.result_submitted`. |
| **BR-CT-044** | [Advance dựa trên winner/finish position]  IF: Advance winner sang next match THEN: Chỉ advance participant có `is_winner=true` hoặc thỏa `advancement_rule`. |
| **BR-CT-050** | [Leaderboard phase này là snapshot trong contest config]  IF: Publish leaderboard THEN: Ghi ordered standings vào `contests.config.leaderboard` và audit `leaderboard.published`. |
| **BR-CT-051** | [Không publish nếu chưa có result hoàn tất]  IF: Không có completed final/result hợp lệ THEN: Reject publish leaderboard. |
| **BR-CT-052** | [Prize chỉ là config hiển thị]  IF: Contest có prize THEN: Lưu trong `contests.config.prizes`; không phát voucher/package tự động trong phase này. |
| **BR-CT-053** | [Cash prize nằm ngoài platform]  IF: Provider trao tiền mặt THEN: Hệ thống chỉ ghi mô tả manual, không xử lý payout/thuế/fraud. |
| **BR-CT-054** | [Local leaderboard không phải global leaderboard] IF: Provider publish leaderboard của contest THEN: Chỉ ghi snapshot local vào `contests.config.leaderboard`; global leaderboard đọc từ verified `race_records`. |
| **BR-CT-055** | [Global sync chỉ sau publish/correction hợp lệ] IF: Contest muốn sync kết quả sang Universal Racing Network THEN: Contest phải publish leaderboard, không còn match non-terminal, và mọi correction liên quan phải audit trước. |
| **BR-CT-060** | [Audit log nằm trong cùng transaction]  IF: Business mutation ghi DB THEN: Audit row phải được ghi cùng transaction với mutation đó. |
| **BR-CT-061** | [Audit payload nhỏ và hữu ích]  IF: Ghi `before_json`/`after_json` THEN: Chỉ lưu fields thay đổi, không lưu payload quá lớn. |
| **BR-CT-062** | [Logger vẫn cần cho vận hành runtime]  IF: Ghi audit DB THEN: Vẫn log `ContestAudit` bằng logger để debug production. |
| **BR-CT-070** | [Không tạo booking giả cho entry fee]  IF: Contest có `entry_fee > 0` THEN: Phase payment sau phải dùng `CONTEST_ENTRY` subject riêng hoặc `contest_registration_id` nullable trong payment component. |
| **BR-CT-071** | [Schedule block là next phase quan trọng]  IF: Contest chạy thật trong khung giờ sân THEN: Cần block lịch track/cafe để booking thường không trùng. |
| **BR-CT-072** | [BYOC tech-check là next phase]  IF: Contest cho BYOC THEN: Phase sau cần checklist structured; phase này có thể ghi manual note trong registration metadata. |
| **BR-CT-090** | [Rental contest uses Booking/Session, not fake contest rental]  IF: Contest requires organizer rental car (`vehicle_rule.vehicle_policy = RENTAL_ONLY`) or a `MIXED` contest registration chooses `vehicle_source = RENTAL` THEN: Customer must use the normal Booking flow for rental payment, vehicle hold, session check-in/check-out, and inspection. Contest registration stores `booking_id`/`vehicle_id` only as a link to that operational flow. Contest must not create a fake booking or duplicate rental payment/inspection logic. |
| **BR-CT-091** | [BYOC review is per contest registration]  IF: Customer chooses `vehicle_source = BYOC` THEN: Customer must submit/select a `customer_vehicle_id`; the contest registration starts as `PENDING`. Provider or assigned Staff reviews whether that car is acceptable for this contest/track, then approves to `CONFIRMED` or rejects to `CANCELLED` with a reason. This is not a global permanent vehicle certification. |
| **BR-CT-092** | [Rejected BYOC should offer a rental path when allowed]  IF: BYOC is rejected in a `MIXED` contest THEN: UI should show the rejection reason and guide the customer to register again with organizer rental. If contest is `BYOC_ONLY`, UI only shows the rejection reason. |
| **BR-CT-093** | [Staff operation is localized by match cafe]  IF: Staff checks in a registration, reorders match participants, submits results, or corrects results THEN: Staff must be assigned to the exact cafe used by that registration/match. Provider owner can operate across their contest cafes. |
| **BR-CT-094** | [Result correction and leaderboard guard]  IF: A result is corrected after downstream matches are completed THEN: only Provider can force cascade, and the correction must be audit logged. Leaderboard cannot be published while any contest match is still non-terminal (`DRAFT`, `READY`, `RUNNING`). |
| **BR-CT-095** | [Corrected published result must re-sync race records] IF: Result correction changes synced result fields THEN: Backend must mark previous synced record as `SUPERSEDED` or update through audited re-sync before global leaderboard can use corrected value. |

---

### 5.1.12 Universal Racing Network Rules

| ID | Định nghĩa Quy tắc Nghiệp vụ |
|---|---|
| **BR-RN-001** | [Global leaderboard chỉ đọc verified race records] IF: Public leaderboard query runs THEN: Chỉ trả `race_records.verification_status = VERIFIED` và không trả superseded/rejected/driver-opt-out/non-opt-in records. |
| **BR-RN-002** | [Customer không tự tạo official race record] IF: Customer tự nhập lap time THEN: Không đưa thẳng vào global leaderboard; phải qua Staff/Admin verification hoặc contest/session source hợp lệ. |
| **BR-RN-003** | [Contest result sync chỉ sau local publish] IF: Sync race records từ contest THEN: Contest phải publish local leaderboard, không còn match non-terminal, correction/audit hoàn tất. |
| **BR-RN-004** | [Result correction phải supersede hoặc re-sync] IF: Kết quả contest đã sync bị sửa THEN: Race record cũ phải `SUPERSEDED` hoặc update qua audited re-sync. |
| **BR-RN-005** | [Opt-in trước khi public cross-provider] IF: Cafe/provider chưa bật public racing network THEN: Record không xuất hiện trên public global leaderboard. |
| **BR-RN-020** | [Một user một driver profile active] IF: Customer dùng Driver Passport THEN: Mỗi `user_id` chỉ có một `driver_profiles` active; `driver_handle` unique case-insensitive. |
| **BR-RN-021** | [Passport QR không phải quyền vào sân] IF: Staff scan Driver Passport QR THEN: QR chỉ xác định driver/community check-in; booking/session check-in vẫn theo rules riêng. |
| **BR-RN-022** | [Cafe check-in cần staff scope] IF: Staff tạo `driver_cafe_checkins` THEN: Staff phải được assign vào cafe đó, hoặc Provider owner/Admin thực hiện. |
| **BR-RN-023** | [Public passport không lộ dữ liệu nhạy cảm] IF: Public xem Driver Passport THEN: Không trả email, phone, payment/session private notes, inspection evidence hoặc audit payload. |
| **BR-RN-040** | [Achievement definition là source of truth] IF: Hệ thống unlock badge THEN: Badge phải tồn tại trong `achievement_definitions`, đang active, và rule_code/version khớp evaluator. |
| **BR-RN-041** | [Distinct cafe achievement đếm cafe duy nhất] IF: Achievement yêu cầu đi qua N cafe THEN: Đếm distinct `cafe_id` từ check-ins hợp lệ. |
| **BR-RN-042** | [Race achievement chỉ dùng verified records] IF: Achievement dựa trên lap/rank/podium/số lần đua THEN: Chỉ dùng `race_records.verification_status = VERIFIED`. |
| **BR-RN-043** | [Unlock idempotent] IF: Achievement evaluator chạy lại THEN: Không tạo duplicate `driver_achievements`. |
| **BR-RN-060** | [Series là wrapper, không thay contest] IF: Tạo Grand Prix Series THEN: Mỗi round link tới contest đã tồn tại; match/result vẫn thuộc contest con. |
| **BR-RN-061** | [Series round chỉ tính contest đã publish] IF: Tính điểm series THEN: Chỉ dùng contest đã publish leaderboard và race records verified. |
| **BR-RN-062** | [Point rule phải snapshot] IF: Series bắt đầu THEN: `league_series.point_rule` phải được snapshot. |
| **BR-RN-063** | [Correction cascade cần audit] IF: Contest round bị correct sau khi standings đã tính THEN: Series standings phải re-calculate qua job/service có audit event. |
| **BR-RN-080** | [Team War không mở trước Driver Passport] IF: Chưa có Driver Passport và verified race records THEN: Không implement Team War runtime. |
| **BR-RN-081** | [Team membership cần captain approval] IF: User join team THEN: Captain/manager phải approve trước khi member active. |
| **BR-RN-082** | [Roster lock trước war] IF: Team War đã qua thời điểm roster lock THEN: Không cho thay roster, trừ Admin override có audit. |
| **BR-RN-083** | [Team result dùng verified source] IF: Team War standings được public THEN: Chỉ dùng race records/result đã verified. |
