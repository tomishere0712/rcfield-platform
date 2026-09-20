# Feature Specification: Partner Landing Page Redesign

**Feature Branch**: `013-partner-page-redesign`  
**Created**: 2026-07-07  
**Status**: Draft  
**Input**: Redesign trang Partner Landing Page (/partner) của RCField — trang B2B dành cho chủ sân RC Cafe muốn đăng ký trở thành Provider trên nền tảng. Trang hiện tại có: hero section, feature highlights, pricing plans (TRIAL/STARTER/GROWTH/PRO từ API), trust section. Mục tiêu redesign: tăng conversion rate đăng ký Provider, storytelling rõ ràng hơn (pain points → solution → proof → pricing → CTA), visual premium hơn, mobile-first.

## Clarifications

### Session 2026-07-07

- Q: Khi chủ sân click "Liên hệ tư vấn", họ được dẫn đến đâu? → A: External Zalo OA link, mở tab mới
- Q: Khi API subscription plans lỗi, pricing section hiển thị gì? → A: Hiển thị banner liên hệ (Zalo OA) thay vì pricing cards
- Q: Có implement analytics event tracking (click CTA, scroll depth) trong scope này không? → A: Không — ngoài scope; đo CTR qua GA/server logs hiện có

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chủ sân khám phá trang và hiểu được giá trị nền tảng (Priority: P1)

Chủ sân RC Cafe lần đầu truy cập trang /partner (từ quảng cáo, bạn bè giới thiệu, hoặc tìm kiếm). Họ cuộn qua trang và trong vòng 60 giây hiểu được: (1) nền tảng giải quyết vấn đề gì của họ, (2) cách hoạt động, (3) ai đang dùng và thấy tin tưởng.

**Why this priority**: Đây là bước đầu tiên trong funnel — nếu chủ sân không hiểu được giá trị, tất cả các bước sau đều thất bại. Pain-to-solution storytelling phải rõ ràng, nhanh, thuyết phục.

**Independent Test**: Có thể kiểm tra bằng cách mở trang /partner trong trình duyệt, tắt network sau khi load, và đọc nội dung — phải hiểu được toàn bộ câu chuyện mà không cần tương tác thêm.

**Acceptance Scenarios**:

1. **Given** chủ sân vào trang /partner lần đầu, **When** họ cuộn qua Hero + Pain Points sections, **Then** họ nhận ra ít nhất 1 vấn đề mình đang gặp được nhắc đến
2. **Given** chủ sân đọc phần "Cách hoạt động", **When** họ đọc xong 3 bước, **Then** họ hiểu quy trình onboard và vận hành hàng ngày
3. **Given** chủ sân đọc phần Social Proof / Testimonials, **When** họ thấy quote từ Provider thực tế, **Then** họ tin rằng người khác đã thành công với nền tảng này
4. **Given** người dùng trên mobile (375px), **When** họ cuộn trang, **Then** tất cả nội dung hiển thị đầy đủ, không có horizontal scroll, font đọc được

---

### User Story 2 - Chủ sân so sánh gói và quyết định đăng ký (Priority: P2)

Chủ sân đã hiểu giá trị và muốn biết chi phí. Họ tìm đến phần Pricing, so sánh các gói (TRIAL/STARTER/GROWTH/PRO), chọn gói phù hợp và click CTA để bắt đầu đăng ký.

**Why this priority**: Pricing section là điểm quyết định conversion — nếu không rõ ràng hoặc không thuyết phục, chủ sân sẽ thoát mà không đăng ký.

**Independent Test**: Có thể test bằng cách navigate thẳng đến phần pricing và thực hiện quy trình chọn gói → click CTA → landing trên trang đăng ký.

**Acceptance Scenarios**:

1. **Given** chủ sân cuộn đến pricing section, **When** họ xem 4 gói, **Then** họ thấy tên, giá, danh sách tính năng, và nút CTA riêng cho từng gói
2. **Given** gói GROWTH được đánh dấu "Phổ biến nhất", **When** chủ sân xem pricing, **Then** gói GROWTH nổi bật hơn các gói khác về mặt visual
3. **Given** chủ sân click vào CTA của bất kỳ gói nào, **When** action xảy ra, **Then** họ được navigate đến trang đăng ký Provider
4. **Given** gói TRIAL, **When** chủ sân xem, **Then** họ thấy "Dùng thử miễn phí — không cần thẻ tín dụng"
5. **Given** API subscription plans đang load, **When** trang render, **Then** hiển thị skeleton loader đúng kích thước để tránh layout shift

---

### User Story 3 - Chủ sân tìm đường liên hệ hoặc hỏi thêm (Priority: P3)

Chủ sân có câu hỏi trước khi quyết định đăng ký (ví dụ: hỗ trợ kỹ thuật, tích hợp thiết bị, hỏi về điều khoản). Họ tìm CTA liên hệ hoặc đặt câu hỏi thay vì đăng ký ngay.

**Why this priority**: Một số chủ sân cần nurturing trước khi convert — cần có đường thoát không phải là "thoát trang" để giữ lead.

**Independent Test**: Click nút "Liên hệ tư vấn" (gói PRO) hoặc link trong final CTA section → navigate đúng đích.

**Acceptance Scenarios**:

1. **Given** chủ sân chưa sẵn sàng đăng ký, **When** họ đến cuối trang, **Then** họ thấy ít nhất 1 CTA "Liên hệ tư vấn" bên cạnh CTA đăng ký chính
2. **Given** chủ sân xem gói PRO, **When** họ click CTA, **Then** trình duyệt mở tab mới đến Zalo OA của RCField

---

### Edge Cases

- Điều gì xảy ra khi API subscription plans trả về lỗi? → Hiển thị banner liên hệ Zalo OA thay thế toàn bộ pricing cards
- Điều gì xảy ra khi chủ sân đã đăng nhập với role PROVIDER? → Trang vẫn hiển thị bình thường (họ có thể muốn xem lại để upgrade gói)
- Điều gì xảy ra khi màn hình rất nhỏ (< 320px)? → Nội dung vẫn không bị cắt, có horizontal scroll protection
- Điều gì xảy ra khi người dùng thích reduced motion? → Animation/parallax không chạy, layout giữ nguyên

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Trang PHẢI hiển thị đủ 7 sections theo thứ tự: Hero → Pain Points → How It Works → Features → Testimonials → Pricing → Final CTA
- **FR-002**: Hero section PHẢI có headline chính, subheadline, 2 CTA buttons (đăng ký + liên hệ), và visual mockup của dashboard RCField
- **FR-003**: Pain Points section PHẢI liệt kê ít nhất 3 vấn đề cụ thể của chủ sân RC Cafe với icon và mô tả ngắn
- **FR-004**: How It Works section PHẢI mô tả quy trình onboard + vận hành hàng ngày theo dạng numbered steps (tối thiểu 3 bước)
- **FR-005**: Features section PHẢI trình bày ít nhất 4 tính năng chính của nền tảng với layout alternating (text trái + visual phải, rồi đổi chiều)
- **FR-006**: Testimonials section PHẢI hiển thị ít nhất 3 quote từ Provider với tên, tên sân, và rating
- **FR-007**: Pricing section PHẢI fetch dữ liệu từ API subscription plans và hiển thị đúng giá, tên gói, tính năng, CTA per gói
- **FR-008**: Pricing section PHẢI hiển thị skeleton loader trong khi fetch API; khi API lỗi, thay thế toàn bộ pricing cards bằng một banner liên hệ ("Liên hệ để được tư vấn gói phù hợp") với CTA mở Zalo OA
- **FR-009**: Gói GROWTH PHẢI được highlight là "Phổ biến nhất" với visual treatment khác biệt
- **FR-010**: Final CTA section PHẢI có ít nhất 1 primary button (đăng ký) và 1 secondary button (liên hệ)
- **FR-011**: Tất cả CTA đăng ký Provider PHẢI navigate đến route đăng ký Provider (routePaths.register hoặc tương đương)
- **FR-015**: Tất cả CTA "Liên hệ tư vấn" PHẢI mở Zalo OA của RCField trong tab mới (`target="_blank" rel="noopener noreferrer"`); URL Zalo OA là constant được cấu hình một chỗ trong component
- **FR-012**: Trang PHẢI responsive trên mobile (375px), tablet (768px), và desktop (1280px+)
- **FR-013**: Trang PHẢI load và hiển thị nội dung above-the-fold trong vòng 2 giây trên kết nối 4G
- **FR-014**: Animation trên trang PHẢI tôn trọng `prefers-reduced-motion` media query

### Key Entities

- **SubscriptionPlan**: Đối tượng dữ liệu từ API — `name (TRIAL|STARTER|GROWTH|PRO)`, `pricePerMonth`, `branchLimit`, `aiQuotaPerMonth`, `channelLimit`, `isTrial`
- **Testimonial**: Dữ liệu tĩnh — `quote`, `authorName`, `cafeName`, `city`, `rating (1-5)`
- **PainPoint**: Dữ liệu tĩnh — `icon`, `title`, `description`
- **Feature**: Dữ liệu tĩnh — `icon`, `title`, `description`, `visualElement (JSX)`, `imagePosition (left|right)`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Visitor có thể nhìn qua trang (scroll từ đầu đến cuối) trong dưới 90 giây và trả lời đúng câu hỏi "Nền tảng này giải quyết vấn đề gì?" — đo qua user testing
- **SC-002**: Click-through rate (CTR) trên các nút CTA đăng ký tăng ít nhất 20% so với trang hiện tại — đo qua analytics sau khi deploy
- **SC-003**: Bounce rate của trang /partner giảm — visitor cuộn xuống dưới 50% chiều cao trang tăng lên (engagement metric)
- **SC-004**: Trang đạt điểm Lighthouse Performance ≥ 85 trên mobile
- **SC-005**: Tất cả interactive elements có touch target tối thiểu 44×44px trên mobile
- **SC-006**: Trang không có lỗi console khi load trong môi trường production (no unhandled errors)
- **SC-007**: Pricing section hiển thị đúng dữ liệu từ API trong vòng 1.5 giây sau khi trang load (giả định API response time < 500ms)

## Assumptions

- Trang sử dụng React + TypeScript + Tailwind CSS + shadcn/ui — không thay đổi tech stack
- Font Plus Jakarta Sans đã được load trong `index.html` (đã confirm)
- API endpoint subscription plans đã tồn tại và trả về đúng schema `SubscriptionPlan[]`
- `routePaths.register` là route đăng ký Provider hiện tại và vẫn dùng được
- Testimonial data là nội dung tĩnh (hardcoded) — không có API riêng cho testimonials
- Hình ảnh mockup trong Hero và Features sections là JSX/HTML components (không dùng ảnh file để tránh dependency)
- Không thêm external icon library mới — dùng Lucide React (đã có trong project)
- Social proof (số liệu: 50+ sân, 12k+ phiên, 4.8★) là hardcoded, chưa có API live stats
- Mobile-first là ưu tiên cao nhất: thiết kế từ 375px lên
- Google Fonts (Plus Jakarta Sans) đã được preconnect và preload trong `index.html`
- Analytics event tracking (click CTA, scroll depth) không nằm trong scope của redesign này — đo conversion qua GA/server logs hiện có
