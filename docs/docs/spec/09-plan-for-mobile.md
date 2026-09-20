# 09 — Mobile App Screen Plan

> **RCField Mobile Application — Spec tổng quan màn hình**
>
> Tài liệu này xác định toàn bộ danh sách màn hình (screens) cần xây dựng cho ứng dụng di động
> RCField, phân chia theo vai trò **Customer (CUS)** và **Staff (STF)**, cùng với các màn hình dùng chung.
>
> Căn cứ từ: phân tích toàn bộ source code FE (`rcfield-fe`) và BE (`rcfield-be`) hiện tại.

---

## 1. Tổng quan kiến trúc Mobile

```
RCField Mobile App
├── Màn hình chung (SHARED)          ← Cả Staff & Customer đều dùng
│   ├── Login / Forgot Password / Reset Password
│   └── Profile & Settings
│
├── Luồng Customer (CUS)             ← Khách hàng đặt sân & chơi xe
│   ├── Explore (Khám phá sân)
│   ├── Booking Flow (Đặt lịch)
│   ├── My Bookings (Lịch sử)
│   ├── Active Session (Phiên đang chơi)
│   ├── Extension Response (Phản hồi gia hạn)
│   ├── Damage Review (Xem bằng chứng hư hại)
│   ├── Inspection Confirm (Ký biên bản)
│   ├── Payment Result
│   ├── Packages & Subscriptions
│   └── Reviews
│
└── Luồng Staff (STF)                ← Nhân viên vận hành tại sân
    ├── Staff Dashboard (Tổng quan ca trực)
    ├── Today Bookings (Lịch hôm nay + Walk-In)
    ├── Session Detail (Chi tiết ca chạy)
    ├── Inspection — Check-In (Lập biên bản nhận xe)
    ├── Inspection — Check-Out (Lập biên bản trả xe)
    ├── FnB Orders (Quản lý đơn ăn uống)
    ├── BYOC Management (Xe tự mang)
    ├── Incidents (Sự cố)
    └── Maintenance (Bảo trì xe)
```

---

## 2. Màn hình dùng chung (SHARED) & Luồng Xác thực (AUTH)

> Áp dụng cho các màn hình cấu hình tài khoản, đăng ký, đăng nhập và khôi phục mật khẩu. Điều hướng dựa vào role sau khi đăng nhập.

| #   | Screen ID            | Tên màn hình              | Mô tả chức năng                                                  | API / Service BE liên quan |
|-----|----------------------|---------------------------|------------------------------------------------------------------|---------------------------|
| S1  | `shared/login`       | **Đăng nhập**             | Form đăng nhập bằng Email + Mật khẩu. Hỗ trợ Google OAuth, ghi nhớ tài khoản. Validate inline thời gian thực. Chuyển hướng theo role. | `POST /auth/login` |
| S1b | `shared/register`    | **Đăng ký (Customer)**    | Đăng ký tài khoản cho Customer. Validate inline thời gian thực (Họ tên, Email, SĐT, Mật khẩu, Xác nhận mật khẩu). | `POST /auth/register` |
| S2  | `shared/forgot-pw`   | **Quên mật khẩu**         | Nhập email để yêu cầu mã khôi phục mật khẩu. Validate inline email. | `POST /auth/forgot-password` |
| S2b | `shared/verify-otp`  | **Xác thực mã OTP**       | Ô nhập mã OTP 6 chữ số có countdown đếm ngược gửi lại mã. | `POST /auth/verify-reset-code` |
| S3  | `shared/reset-pw`    | **Đặt lại mật khẩu**      | Thiết lập mật khẩu mới và xác nhận. Validate inline sự trùng khớp và độ bảo mật. | `POST /auth/reset-password` |
| S4  | `shared/profile`     | **Hồ sơ cá nhân**         | Xem & sửa avatar, tên, SĐT, email, đổi mật khẩu, đăng xuất.    | `GET/PUT /profile` |

### 2.1 Đặc tả chi tiết Logic và Phối màu Auth Mobile

#### A. Phối màu giao diện (Visual Style) — Đồng bộ với Web
* **Màu nền (Background):** Nền tối sâu **Slate 950** (`#0b0f19` hoặc `#0f172a`) tạo cảm giác thể thao và năng động cho đường đua RC Cafe.
* **Màu nhấn (Accent Color):** **Orange 500** (`#f97316`) hoặc **Orange 600** (`#ea580c`) sử dụng cho các Primary CTA (nút bấm chính), liên kết, checkbox được chọn, viền của input khi focus.
* **Màu bổ trợ (Neutral/Text):** Slate 400 (`#94a3b8`) cho text mô tả, icon và placeholder; Slate 800 (`#1e293b`) cho border của input mặc định.
* **Hiệu ứng Glow (Ánh sáng):** Hiệu ứng Radial Gradient mờ ở các góc màn hình (Cam/Đỏ/Indigo: `rgba(249, 115, 22, 0.1)` và `rgba(99, 102, 241, 0.1)`) tăng chiều sâu và độ cao cấp.
* **Trạng thái validation lỗi:** Chữ đỏ **Red 500** (`#ef4444`) và viền input đỏ khi trường nhập liệu không hợp lệ.

#### B. Cơ chế Validation Inline (Real-time Validation)
* **Thời điểm kích hoạt (Trigger):** Kiểm tra ngay khi người dùng rời khỏi ô nhập liệu (`onBlur`) lần đầu tiên hoặc khi người dùng thay đổi dữ liệu (`onChange`) sau khi ô nhập liệu đó đã bị báo lỗi.
* **Trải nghiệm người dùng:** Thông báo lỗi chi tiết hiển thị ngay bên dưới ô nhập tương ứng bằng chữ màu Red 500. Nút Submit (Đăng nhập/Đăng ký) sẽ bị vô hiệu hóa (disabled) và giảm độ mờ (opacity) cho đến khi toàn bộ form không còn lỗi validation.

#### C. Logic màn hình Đăng nhập (`shared/login`)
1. **Validation rules:**
   - *Email*: Không được để trống, phải đúng định dạng email (regex).
   - *Password*: Không được để trống, tối thiểu 6 ký tự.
2. **Remember Me (Ghi nhớ tài khoản):** Checkbox dùng để lưu email đã đăng nhập thành công vào `SecureStore` (hoặc `AsyncStorage`). Lần sau mở app sẽ tự động điền email này.
3. **Google Sign-In:** Nút Google OAuth tích hợp SDK native. Khi đăng nhập thành công qua Google, gửi credential lên backend để xác thực qua API `POST /auth/google`.
4. **Điều hướng theo vai trò (Role Routing):**
   - Lấy thông tin role từ access token/backend profile sau khi đăng nhập thành công.
   - Nếu `role` = `customer` $\rightarrow$ chuyển hướng tới trang chủ khách hàng (`cus/home`).
   - Nếu `role` = `staff` $\rightarrow$ chuyển hướng tới ca trực của nhân viên (`staff/dashboard`).
   - Nếu `role` là các vai trò khác (như `provider`, `admin`) $\rightarrow$ thông báo từ chối truy cập trên ứng dụng di động (Yêu cầu đăng nhập trên Web) để bảo mật.

#### D. Logic màn hình Đăng ký (`shared/register`)
1. **Giới hạn vai trò:** **Chỉ tạo tài khoản cho Customer**. Không cung cấp tùy chọn vai trò khác trên ứng dụng di động. Gửi mặc định `role: "customer"` trong payload API.
2. **Validation rules:**
   - *Họ và tên*: Không được để trống, tối thiểu 2 ký tự.
   - *Email*: Đúng định dạng email, kiểm tra xem email đã được dùng chưa qua API (hoặc lúc submit).
   - *Số điện thoại*: Định dạng số điện thoại Việt Nam (10 số, bắt đầu bằng 03, 05, 07, 08, 09 hoặc 84).
   - *Mật khẩu*: Tối thiểu 6 ký tự.
   - *Xác nhận mật khẩu*: Trùng khớp hoàn toàn với trường Mật khẩu.
   - *Điều khoản*: Phải chọn tick đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.
3. **Hành động sau thành công:** Đăng ký thành công sẽ tự động đăng nhập (lưu token), hiển thị Toast chào mừng và điều hướng trực tiếp vào trang Explore (`cus/home`).

#### E. Logic luồng Quên mật khẩu (`shared/forgot-pw` -> `shared/verify-otp` -> `shared/reset-pw`)
1. **Nhập Email (`shared/forgot-pw`):**
   - Người dùng nhập email $\rightarrow$ validate định dạng.
   - Bấm gửi $\rightarrow$ Gọi API `POST /auth/forgot-password` $\rightarrow$ Hệ thống gửi mã OTP 6 số qua email.
   - Chuyển hướng sang màn nhập OTP.
2. **Xác thực OTP (`shared/verify-otp`):**
   - Thiết kế 6 ô nhập chữ số tự động chuyển focus (auto-next).
   - Validation: Phải nhập đủ 6 chữ số.
   - Có nút "Gửi lại mã" (Resend code) hiển thị sau khi hết 60 giây countdown đếm ngược.
   - Gọi API `POST /auth/verify-reset-code` để kiểm tra. Nếu hợp lệ, chuyển sang màn Reset.
3. **Đặt lại mật khẩu (`shared/reset-pw`):**
   - Nhập mật khẩu mới và xác nhận mật khẩu mới $\rightarrow$ validate độ dài >= 6 ký tự và trùng khớp.
   - Gọi API `POST /auth/reset-password` để cập nhật mật khẩu mới.
   - Thành công $\rightarrow$ Chuyển sang màn hình thông báo hoàn tất và nút điều hướng về Login.

---

## 3. Luồng Customer (CUS) — Khách hàng

### 3.1 Khám phá & Đặt sân

| #   | Screen ID                        | Tên màn hình               | Mô tả chức năng                                                                                               | API liên quan |
|-----|----------------------------------|----------------------------|---------------------------------------------------------------------------------------------------------------|---------------|
| C1  | `cus/home`                       | **Trang chủ (Home)**       | Dashboard của khách hàng: thông tin cá nhân, quick actions, highlight lịch đặt sắp tới/cảnh báo chưa thanh toán, active packages, danh sách lịch đặt và chi nhánh nổi bật. | `GET /cafes`, `GET /bookings`, `GET /customer-packages` |
| C1b | `cus/explore-map`                | **Khám phá (Explore Map)**  | Bản đồ tương tác hiển thị danh sách chi nhánh RC Cafe. Định vị người dùng, chỉ đường (OSRM/Google Maps), highlight chi nhánh đang chọn trên bản đồ và hiển thị Bottom Card nổi. | `GET /cafes` |
| C2  | `cus/cafe-detail/:id`            | **Chi tiết chi nhánh**     | Thông tin chi nhánh (ảnh, địa chỉ, giờ mở cửa, giá), danh sách track, menu F&B, ảnh gallery.               | `GET /cafes/:id` |
| C3  | `cus/booking/create`             | **Đặt lịch (Booking)**     | Wizard nhiều bước: chọn ngày/giờ → chọn loại xe (thuê hoặc BYOC) → nhập người tham gia → xác nhận giá → thanh toán VNPay. | `POST /bookings` |
| C4  | `cus/booking/payment-result`     | **Kết quả thanh toán**     | Hiển thị trạng thái giao dịch VNPay (thành công / thất bại / chờ xử lý), hiển thị mã booking.               | `GET /vnpay/return` |

### 3.1.1 Đặc tả chi tiết Trang chủ & Khám phá (Bản đồ) của Customer

#### A. Trang chủ (Customer Home — `cus/home`)

Trang chủ là trung tâm điều hướng và là dashboard thông tin của khách hàng sau khi đăng nhập. Giao diện được thiết kế theo phong cách tối thể thao tương tự màn hình xác thực, đồng bộ chặt chẽ với logic từ Web.

##### 1. Bố cục & Các Thành phần (UI Components):
*   **Hero Banner & Lời chào (Greeting & Quick Search):**
    *   Hiển thị Avatar người dùng (nếu có, nếu không hiển thị chữ viết tắt của tên trên nền cam `#ea580c`) cùng lời chào động theo thời gian thực: *"Chào buổi sáng,"*, *"Chào buổi chiều,"* hoặc *"Chào buổi tối,"* kèm theo tên đầy đủ của khách hàng (`user.fullName`).
    *   **Thanh Tìm kiếm nhanh:** Ô tìm kiếm giả kích hoạt nút tìm sân. Khi click sẽ chuyển hướng trực tiếp sang màn hình Bản đồ Khám phá (`cus/explore-map`). Có icon tia chớp màu cam và nút "Tìm ngay" nổi bật.
*   **Highlight Lịch đặt sắp tới (Upcoming Booking Banner):**
    *   Khi khách hàng có lịch đặt sắp tới (trạng thái `CONFIRMED` hoặc `PENDING`), hiển thị một banner nổi bật nền xanh lá mờ (`rgba(16, 185, 129, 0.1)`) viền xanh lá ở ngay phần đầu trang để nhắc nhở thời gian chơi xe sắp bắt đầu.
*   **Cảnh báo thanh toán (Pending Payment Alert):**
    *   Nếu có bất kỳ lịch đặt nào ở trạng thái `PENDING` (chờ thanh toán), hiển thị banner cảnh báo màu hổ phách (Amber) kèm liên kết "Thanh toán" để dẫn người dùng trực tiếp đến trang thanh toán.
*   **Review Reminder Banner (Nhắc nhở đánh giá):**
    *   Nếu người dùng có các ca chơi đã hoàn thành (`COMPLETED`) nhưng chưa viết đánh giá, banner này sẽ hiển thị để khuyến khích họ đóng góp ý kiến. Khi click sẽ mở popup/màn hình đánh giá (`cus/reviews`).
*   **Quick Actions (Liên kết nhanh):**
    *   Thiết kế dạng grid 2 cột (hoặc 4 cột ngang tùy màn hình) với 4 nút chức năng chính:
        1.  **Tìm sân** (Icon `MapPin`, màu cam): Chuyển đến `cus/explore-map`.
        2.  **Lịch đặt** (Icon `CalendarCheck`, màu xanh lá): Chuyển đến `cus/bookings`.
        3.  **Gói hội viên** (Icon `Package`, màu tím): Chuyển đến `cus/packages`.
        4.  **Đội xe** (Icon `Car`, màu xanh dương): Chuyển đến `cus/vehicles`.
*   **Gói chơi đang dùng (Active Packages Slider):**
    *   Hiển thị danh sách các gói thời gian/lượt chơi đang hoạt động của khách hàng.
    *   Có thanh tiến trình (Progress Bar) màu tím biểu diễn trực quan: `Số slot còn lại / Tổng số slot` (ví dụ: *"Còn 5 / 10 slot"* - 50%).
    *   Hiển thị ngày hết hạn của gói kèm icon đồng hồ.
*   **Lịch đặt của tôi (My Bookings Preview):**
    *   Hiển thị tối đa 3 lịch đặt sắp tới. Mỗi card hiển thị: Ngày (dạng khối lịch bắt mắt), Giờ chơi, Trạng thái (được tag màu tương ứng: CONFIRMED - Xanh lá, PENDING - Cam, CANCELLED - Đỏ), Play Mode (Thuê xe - Cam, Xe riêng - Xanh dương), và mã số Booking rút gọn (8 ký tự đầu).
    *   **Trạng thái trống (Empty State):** Nếu không có lịch đặt nào, hiển thị một khung dash-border đẹp mắt kèm hình minh họa, thông báo *"Chưa có lịch đặt sân"* và nút *"Khám phá sân RC"* để kích thích người dùng đặt sân.
*   **Sân RC nổi bật (Featured Cafes Slider):**
    *   Slider vuốt ngang hiển thị các chi nhánh nổi bật. Mỗi card gồm ảnh chi nhánh, rating sao (ví dụ: `★ 4.8`), tên chi nhánh, thành phố, và giá thuê xe rẻ nhất dạng *"từ 150.000đ/giờ"*.

##### 2. Đồng bộ Phối màu (Visual System):
*   **Nền màn hình (Background):** Slate 950 (`#0b0f19`).
*   **Nền các Box/Card:** Slate 900 (`#0f172a`) với độ mờ (`/60` hoặc `/80`) kết hợp viền mờ `border-slate-800`.
*   **Hệ màu Trạng thái:** Đồng bộ hoàn toàn mã màu từ Web:
    *   `PENDING`: text màu vàng cam (`#b45309`), nền vàng cam mờ.
    *   `CONFIRMED`: text màu xanh lá (`#047857`), nền xanh lá mờ.
    *   `CANCELLED`: text màu đỏ (`#b91c1c`), nền đỏ mờ.

---

#### B. Khám phá & Bản đồ (Explore Map — `cus/explore-map`)

Màn hình Khám phá cho phép người dùng tìm kiếm, lọc và xem vị trí trực quan của tất cả các chi nhánh RC Cafe trên bản đồ.

##### 1. Bản đồ & Tính năng Bấm hiện sáng (Map Interactivity & Highlight Pin):
*   **Tích hợp Bản đồ native:** Sử dụng thư viện `react-native-maps` để chạy mượt mà trên di động.
*   **Custom Marker (Ghim cơ sở):**
    *   **Marker thông thường:** Thể hiện bằng một pin tròn có icon định vị màu trắng ở giữa trên nền màu cam sáng (`#ea580c`), có viền trắng 3px bo quanh.
    *   **Marker được chọn (Bấm hiện sáng / Highlighted Pin):** 
      * Khi người dùng click vào Marker trên bản đồ hoặc vuốt đến Card chi tiết tương ứng ở dưới màn hình, Marker đó sẽ được kích hoạt trạng thái **active**.
      * Màu nền Marker active chuyển sang màu đỏ cam sậm (`#c2410c`).
      * Kích thước tăng lên 1.3 lần (từ 36px lên 48px).
      * Độ dày viền trắng tăng lên 3.5px.
      * Thêm hiệu ứng bóng đổ sâu hơn (`shadow-lg`) hoặc một vòng tròn mờ phát sáng nhẹ (radial gradient) xung quanh Marker để tạo điểm nhấn thị giác cực mạnh.
*   **Di chuyển Camera thông minh:** Khi người dùng chọn một chi nhánh (bấm vào Marker hoặc chọn từ danh sách), bản đồ sẽ thực hiện hiệu ứng di chuyển camera mượt mà (`animateCamera` hoặc `flyTo`) để đưa Marker đó về chính giữa màn hình (Center) với mức độ zoom tối ưu (Zoom Level 15).

##### 2. Bottom Card Nổi (Floating Detail Sheet):
*   Khi click vào một Marker hoặc chọn một chi nhánh, ở góc dưới màn hình sẽ hiển thị một Card nổi (hoặc Bottom Sheet) chứa thông tin tóm tắt:
    *   Ảnh chi nhánh nằm bên trái.
    *   Tên chi nhánh, quận/huyện, thành phố, đánh giá sao, khoảng cách địa lý thực tế.
    *   Nút CTA **"Đặt lịch ngay"** (màu cam nổi bật) chuyển tiếp đến màn hình Booking Wizard (`cus/booking/create`).
    *   Nút **"Xem chi tiết"** chuyển tiếp đến trang thông tin chi tiết chi nhánh (`cus/cafe-detail/:id`).
*   Khách hàng có thể đóng Card nổi này bằng nút tắt (icon X) hoặc vuốt xuống dưới.

##### 3. Định vị người dùng & Chỉ đường (User Location & Routing):
*   **Vị trí hiện tại:** Yêu cầu quyền truy cập GPS của thiết bị (`Geolocation API`). Hiển thị vị trí của người dùng dưới dạng một chấm tròn xanh dương phát sáng đặc trưng (`USER_PIN`).
*   **Tính khoảng cách:** Tự động tính toán khoảng cách theo đường chim bay từ vị trí người dùng đến tất cả các chi nhánh bằng công thức Haversine để sắp xếp chi nhánh gần nhất lên đầu.
*   **Tính năng chỉ đường (Routing):**
    *   Khi nhấn nút **"Chỉ đường"**, ứng dụng sẽ gọi API chỉ đường của hệ thống (OSRM) để lấy danh sách tọa độ đường bộ và vẽ một đường dẫn màu xanh dương (`Polyline`) trực tiếp từ vị trí người dùng tới chi nhánh trên bản đồ.
    *   Đồng thời hiển thị box thông báo thời gian đi dự kiến và khoảng cách thực tế (ví dụ: *"15 phút · 4.2 km"*).
    *   Cung cấp tùy chọn click để mở trực tiếp Google Maps hoặc Apple Maps qua Deep Link điều hướng.

---

### 3.2 Quản lý lịch đặt

| #   | Screen ID                        | Tên màn hình               | Mô tả chức năng                                                                                               | API liên quan |
|-----|----------------------------------|----------------------------|---------------------------------------------------------------------------------------------------------------|---------------|
| C5  | `cus/bookings`                   | **Lịch sử đặt sân (My Bookings)** | Danh sách tất cả booking của khách (tab: Sắp tới / Đang diễn ra / Đã kết thúc / Đã hủy). Filter theo trạng thái. | `GET /bookings?customerId=...` |
| C6  | `cus/bookings/:bookingId`        | **Chi tiết đặt sân**       | Hiển thị đầy đủ thông tin booking: thời gian, track, mode, xe, người tham gia, hoá đơn, QR check-in code, trạng thái. | `GET /bookings/:id` |

### 3.3 Phiên chơi thực tế (Live Session)

| #   | Screen ID                              | Tên màn hình                        | Mô tả chức năng                                                                                                               | API liên quan |
|-----|----------------------------------------|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------|---------------|
| C7  | `cus/sessions/:sessionId`             | **Phiên đang chơi (Live Dashboard)**| Countdown thời gian còn lại (circular timer), danh sách xe đang chạy, lịch sử F&B đã gọi, nút liên kết. Flash alert khi Staff gửi đề xuất gia hạn hoặc phát hiện hư hại. | `GET /sessions/:id` |
| C8  | `cus/extension-response/:sessionId`   | **Phản hồi gia hạn**                | Hiển thị đề xuất gia hạn của Staff (số phút + phí). Nút Đồng ý / Từ chối. Cập nhật real-time qua websocket. | `POST /sessions/:id/extension-response` |
| C9  | `cus/damage-review/:sessionId`        | **Xem bằng chứng hư hại**           | So sánh ảnh check-in (baseline) vs ảnh check-out (thực tế), xem mô tả hư hại và số tiền bồi thường đề xuất. | `GET /sessions/:id/inspections` |
| C10 | `cus/inspection-confirm/:sessionId`   | **Ký biên bản kiểm xe**             | Khách hàng ký số (digital signature) để chấp nhận biên bản check-in xe trước khi lượt chơi bắt đầu. | `POST /sessions/:id/confirm-inspection` |

### 3.4 Gói dịch vụ & Đánh giá

| #   | Screen ID                  | Tên màn hình               | Mô tả chức năng                                                                              | API liên quan |
|-----|----------------------------|----------------------------|----------------------------------------------------------------------------------------------|---------------|
| C11 | `cus/packages`             | **Gói chơi của tôi**       | Danh sách các gói thời gian / lượt chơi đã mua, trạng thái còn lại, nút mua thêm.           | `GET /customer-packages` |
| C12 | `cus/subscriptions`        | **Đăng ký thành viên**     | Xem gói subscription đang dùng, ngày hết hạn, ưu đãi. Nút nâng cấp / gia hạn.             | `GET /subscriptions` |
| C13 | `cus/reviews`              | **Đánh giá của tôi**       | Danh sách các review đã viết, nút tạo review mới sau lượt chơi hoàn thành.                  | `GET/POST /reviews` |
| C14 | `cus/vehicles`             | **Xe của tôi (BYOC)**      | Quản lý danh sách xe tự mang: thêm, xem, xóa xe đã đăng ký.                                 | `GET/POST/DELETE /vehicles` |

---

## 4. Luồng Staff (STF) — Nhân viên vận hành

### 4.1 Tổng quan ca trực

| #   | Screen ID                   | Tên màn hình                     | Mô tả chức năng                                                                                                             | API liên quan |
|-----|-----------------------------|----------------------------------|-----------------------------------------------------------------------------------------------------------------------------|---------------|
| ST1 | `staff/dashboard`           | **Dashboard ca trực**            | Thống kê real-time: số phiên đang chạy, tổng đơn hôm nay, số đang chờ kiểm xe, số đơn F&B chờ. Hiển thị bản đồ track (Live Map) trạng thái từng làn đua. Nút QR Check-In và nút Walk-In. | `GET /staff/dashboard-summary` |

### 4.2 Check-In / Check-Out

| #   | Screen ID                               | Tên màn hình                             | Mô tả chức năng                                                                                                                               | API liên quan |
|-----|-----------------------------------------|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| ST2 | `staff/today-bookings`                  | **Lịch đặt hôm nay**                    | Danh sách booking trong ngày, filter theo trạng thái (PENDING / CONFIRMED / COMPLETED / CANCELLED). Tìm kiếm theo tên khách. Nút "Check-In bàn giao" cho từng booking đã xác nhận. Countdown đếm ngược giờ bắt đầu. | `GET /staff/today-bookings` |
| ST3 | `staff/today-bookings?tab=walkin`       | **Tạo đơn Walk-In**                     | Form tạo nhanh ca chơi trực tiếp cho khách vãng lai: nhập tên khách, SĐT, chọn mode (RENTAL/BYOC/MIXED), chọn đường đua, thời lượng, chọn xe. Xem chi tiết hóa đơn dự kiến. | `POST /bookings/walk-in` |
| ST4 | `staff/checkin-scan`                    | **Quét QR Check-In**                    | Camera quét QR hoặc nhập mã shortcode thủ công. Validation tự động trạng thái booking. Redirect sang màn hình session detail khi thành công. | `POST /bookings/:id/checkin` |
| ST5 | `staff/sessions/:sessionId`             | **Chi tiết ca chạy (Session Detail)**   | Hiển thị timer đếm ngược, thông tin khách & xe. 3 module hoạt động chính: (1) Gia hạn +15/30/60 phút, (2) Đổi xe thực tế (Vehicle Swap), (3) Gọi món F&B. Nút "Lập biên bản Check-In" (khi status=CHECKED_IN) và "Kiểm xe thu hồi Check-Out" (khi status=ACTIVE). Quyết toán hóa đơn cuối. | `GET/PUT /sessions/:id` |

### 4.3 Biên bản kiểm xe (Inspection)

| #   | Screen ID                                        | Tên màn hình                                | Mô tả chức năng                                                                                                                                                     | API liên quan |
|-----|--------------------------------------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| ST6 | `staff/inspection?sessionId=...&type=CHECK_IN`   | **Biên bản bàn giao (Check-In Inspection)** | Chụp ảnh 4 góc xe (FRONT/BACK/LEFT/RIGHT) bằng camera. Checklist an toàn linh kiện: pin, servo, lốp, remote. Ghi chú tổng quan. Submit để khởi động phiên chơi. | `POST /sessions/:id/inspections` |
| ST7 | `staff/inspection?sessionId=...&type=CHECK_OUT`  | **Biên bản thu hồi (Check-Out Inspection)** | Chụp ảnh 4 góc xe sau khi chơi. So sánh side-by-side với ảnh Check-In gốc. Checklist tình trạng xe. Đánh dấu hư hại (nếu có): nhập mô tả, kéo thanh ước tính chi phí, hệ số nhân xe premium. Tự động tính số tiền khấu trừ từ cọc. | `POST /sessions/:id/inspections` |

### 4.4 Vận hành phụ trợ

| #    | Screen ID                  | Tên màn hình               | Mô tả chức năng                                                                                          | API liên quan |
|------|----------------------------|----------------------------|----------------------------------------------------------------------------------------------------------|---------------|
| ST8  | `staff/fnb-orders`         | **Đơn F&B hôm nay**        | Danh sách tất cả đơn ăn uống trong ca, filter PENDING/PREPARING/SERVED/CANCELLED. Cập nhật trạng thái từng đơn. | `GET/PUT /fnb-orders` |
| ST9  | `staff/byoc`               | **Quản lý xe tự mang (BYOC)** | Danh sách xe BYOC của khách đã đăng ký lượt chơi, xác nhận xe đã qua kiểm định an toàn trước khi cho xuống làn. | `GET /staff/byoc-vehicles` |
| ST10 | `staff/incidents`          | **Báo cáo sự cố**          | Xem danh sách sự cố trong ngày. Tạo sự cố mới: loại sự cố, mô tả, ảnh, xe liên quan, mức độ nghiêm trọng. | `GET/POST /incidents` |
| ST11 | `staff/maintenance`        | **Bảo trì xe**             | Danh sách xe cần bảo trì hoặc đang bảo trì, xem lịch sử bảo trì. Cập nhật trạng thái từ MAINTENANCE → AVAILABLE. | `GET/PUT /vehicles/units/:id` |
| ST12 | `staff/packages`           | **Gói chơi khách hàng**    | Xem danh sách gói thời gian của khách (khi khách check-in sử dụng gói thay vì thanh toán trực tiếp). Validate và áp dụng gói. | `GET /customer-packages` |
| ST13 | `staff/shifts`             | **Thông tin ca làm việc**  | Xem ca được phân công, chi nhánh phụ trách, giờ bắt đầu/kết thúc ca. Xác nhận đi làm đúng giờ.         | `GET /shifts/my-shift` |

---

## 5. Ưu tiên phát triển (Priority Matrix)

### Phase 1 — MVP (Phải có)

> Các màn hình cốt lõi để vận hành được một ca chơi từ đầu đến cuối.

**Staff:**
- [ ] ST1 Dashboard ca trực
- [ ] ST2 Lịch đặt hôm nay
- [ ] ST4 Quét QR Check-In
- [ ] ST5 Chi tiết ca chạy (Session Detail)
- [ ] ST6 Biên bản Check-In Inspection
- [ ] ST7 Biên bản Check-Out Inspection

**Customer:**
- [ ] C1 Explore / Trang chủ
- [ ] C3 Đặt lịch
- [ ] C4 Kết quả thanh toán
- [ ] C5 Lịch sử đặt sân
- [ ] C6 Chi tiết đặt sân (có QR code)
- [ ] C7 Phiên đang chơi (Live Session)

**Shared & Auth:**
- [ ] S1 Đăng nhập
- [ ] S1b Đăng ký (Customer)
- [x] S4 Hồ sơ cá nhân

### Phase 2 — Hoàn thiện nghiệp vụ

**Staff:**
- [ ] ST3 Walk-In booking form
- [ ] ST8 Đơn F&B hôm nay
- [ ] ST9 Xe BYOC
- [ ] ST10 Báo cáo sự cố
- [ ] ST11 Bảo trì xe
- [ ] ST13 Ca làm việc

**Customer:**
- [ ] C8 Phản hồi gia hạn
- [ ] C9 Xem bằng chứng hư hại
- [ ] C10 Ký biên bản kiểm xe
- [ ] C2 Chi tiết chi nhánh

**Shared & Auth (Quên mật khẩu):**
- [ ] S2 Quên mật khẩu
- [ ] S2b Xác thực mã OTP
- [ ] S3 Đặt lại mật khẩu

### Phase 3 — Nâng cao trải nghiệm

- [ ] C11 Gói chơi của tôi
- [ ] C12 Đăng ký thành viên
- [ ] C13 Đánh giá của tôi
- [ ] C14 Xe của tôi (BYOC)
- [ ] ST12 Validate gói chơi
- [ ] Push notification (Gia hạn, hư hại, F&B sẵn sàng)

---

## 6. Tổng kết số lượng màn hình

| Nhóm       | Số màn hình |
|------------|-------------|
| Shared/Auth| 6           |
| Customer   | 14          |
| Staff      | 13          |
| **Tổng**   | **33**      |

---

## 7. Navigation Structure

### Customer Bottom Tab Bar

```
[🏠 Khám phá] [📅 Lịch sử] [🎮 Phiên live] [📦 Gói của tôi] [👤 Hồ sơ]
```

### Staff Bottom Tab Bar

```
[📊 Trực Ca] [📋 Lịch Hôm Nay] [🍔 F&B] [⚠️ Sự Cố / Bảo Trì] [👤 Hồ Sơ]
```

---

## 8. Luồng dữ liệu chính (Key Flows)

### Flow 1: Customer Đặt Sân & Chơi

```
C1 (Explore) → C2 (Chi tiết chi nhánh) → C3 (Booking Wizard)
→ C4 (Kết quả thanh toán) → C6 (Chi tiết booking + QR)
→ [Đến sân] → ST4 (Staff quét QR) → ST6 (Biên bản check-in)
→ C10 (Khách ký biên bản) → C7 (Live Session Dashboard)
→ [Hết giờ] → ST7 (Biên bản check-out) → C9 (Xem bằng chứng nếu có hư hại)
→ Hoàn thành → C13 (Đánh giá)
```

### Flow 2: Staff Xử lý Walk-In

```
ST1 (Dashboard) → ST3 (Form Walk-In) → ST5 (Session Detail)
→ ST6 (Check-In Inspection) → [Customer ký] → ST5 (Session đang chạy)
→ [Hết giờ / Checkout] → ST7 (Check-Out Inspection)
```

### Flow 3: Gia hạn thời gian

```
ST5 (Staff đề xuất gia hạn) → C8 (Customer nhận notification)
→ C8 (Đồng ý / Từ chối) → ST5 (Cập nhật timer)
```

### Flow 4: Phát hiện hư hại

```
ST7 (Staff đánh dấu hư hại + ước tính chi phí)
→ C9 (Customer nhận alert → xem ảnh so sánh)
→ Khấu trừ từ tiền đặt cọc tự động
```

---

## 9. Ghi chú kỹ thuật Mobile

### 9.1 Permissions cần thiết
- **Camera**: Bắt buộc cho Inspection (chụp ảnh 4 góc xe)
- **Camera (QR Scanner)**: Cần cho Staff quét mã check-in
- **Notifications (Push)**: Cho gia hạn, hư hại, F&B alerts

### 9.2 Offline considerations
- Màn hình Live Session (C7) cần fallback khi mất mạng
- Biên bản inspection nên có queue để sync khi có kết nối

### 9.3 Real-time (WebSocket)
- `C7` — Customer nhận push về gia hạn / hư hại / hết giờ
- `C8` — Extension response cần real-time (timeout 10 phút)
- `ST5` — Staff nhận confirm từ khách real-time

### 9.4 Tích hợp VNPay
- Màn hình `C3` trigger VNPay Deep Link / In-app WebView
- Màn hình `C4` xử lý callback từ VNPay (success/fail/pending)

---

*Tài liệu cập nhật: 2026-06-17*
*Căn cứ: rcfield-fe source code (pages/staff, pages/customer, pages/booking, pages/auth) + rcfield-be controllers & services*
