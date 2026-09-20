# BR-FnB — Quy tắc nghiệp vụ: F&B

**Last updated**: 2026-05-15
**Status**: Active

> **THAY ĐỔI:** On-site order giờ gắn với `Session` (không phải `Booking`).
> Pre-order vẫn gắn với Booking (thanh toán 1 lần).

## 1. F&B Pre-order (đặt trước khi đến)

**BR-FB-001** — Pre-order khi tạo booking  
IF: Customer tạo booking  
THEN: Customer có thể chọn F&B pre-order từ menu của chi nhánh (optional)

**BR-FB-002** — Pre-order gộp 1 lần thanh toán  
IF: Customer có chọn F&B pre-order  
THEN: Tổng thanh toán = booking fee + F&B pre-order fee → 1 transaction qua payment gateway  
NOTE: Không yêu cầu Customer thanh toán 2 lần riêng biệt

**BR-FB-003** — Staff confirm pre-order khi check-in  
IF: Check-in bắt đầu và booking có F&B pre-order  
THEN: Staff xác nhận đã chuẩn bị xong F&B pre-order cho Customer

**BR-FB-004** — Menu theo từng chi nhánh  
Mỗi chi nhánh (Cafe) có menu F&B riêng. Customer chỉ thấy menu của chi nhánh mình đặt lịch.

---

## 2. F&B On-site (gọi thêm tại quán)

**BR-FB-005** — Staff ghi order tại quán  
IF: Customer muốn gọi thêm đồ trong khi chơi  
THEN: Staff ghi order vào app (FbOrder record)

**BR-FB-006** — Thanh toán trực tiếp cho quán  
IF: F&B on-site  
THEN: Customer thanh toán trực tiếp cho Provider (tiền mặt hoặc chuyển khoản)  
NOTE: Platform KHÔNG làm trung gian, KHÔNG thu tiền F&B on-site

**BR-FB-007** — Platform không thu phí F&B  
Platform fee = 0% trên toàn bộ F&B (cả pre-order và on-site)

---

## 3. Quản lý menu

**BR-FB-008** — Provider quản lý menu  
Provider (hoặc Staff được uỷ quyền) có thể thêm/sửa/xoá item trong menu F&B của từng chi nhánh

**BR-FB-009** — Item có thể bật/tắt  
Provider có thể tạm ẩn item khi hết hàng mà không cần xoá khỏi menu
