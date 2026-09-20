# Quickstart & Test Scenarios: Staff KPI Dashboard

**Feature**: 014-staff-kpi-dashboard  
**Date**: 2026-07-08

---

## Prerequisites

- Provider account với ít nhất 1 cafe và 1 nhân viên ACTIVE
- Nhân viên đó đã thực hiện ít nhất 1 check-in, 1 FnB order

---

## E2E Scenarios

### S1 — Điều hướng từ staff card đến detail page

1. Đăng nhập Provider → `/provider/staff`
2. Nhấn vào card nhân viên (hoặc nút "Xem chi tiết")
3. **Expected**: Điều hướng đến `/provider/staff/:staffId`
4. **Expected**: Profile header hiển thị đúng tên, email, chi nhánh, status badge, online dot (nếu active < 10 phút)

### S2 — KPI với period = 30 ngày (default)

1. Mở `/provider/staff/:staffId`
2. **Expected**: 5 KPI card hiển thị với label: "Đã kích hoạt chờ, FnB, Gia hạn, Đúng giờ, Ngày hoạt động"
3. Period selector mặc định là "30 ngày"
4. **Expected**: Giá trị KPI khớp với dữ liệu DB trong 30 ngày gần nhất

### S3 — Đổi period sang 7 ngày

1. Từ S2, nhấn "7 ngày" trên period selector
2. **Expected**: Tất cả 5 KPI card cập nhật giá trị (thường nhỏ hơn hoặc bằng 30 ngày)
3. **Expected**: Không có full page reload — chỉ KPI section re-fetch

### S4 — Nhân viên không có hoạt động trong khoảng thời gian

1. Chọn nhân viên mới tham gia (< 7 ngày, chưa có check-in)
2. Chọn period "7 ngày"
3. **Expected**: Tất cả KPI card hiển thị `0` hoặc `—` cho on-time rate
4. **Expected**: Không có lỗi, không crash

### S5 — Activity Timeline

1. Mở trang chi tiết nhân viên có nhiều hoạt động
2. Cuộn xuống phần "Lịch sử hoạt động"
3. **Expected**: Sự kiện CHECK_IN hiển thị booking short_code
4. **Expected**: Sự kiện FNB_ORDER và EXTENSION_APPROVED cũng có
5. **Expected**: Thứ tự mới nhất trước (newest first)

### S6 — Phân trang Timeline

1. Nhân viên có > 20 sự kiện
2. **Expected**: Sau 20 sự kiện đầu có nút "Tải thêm"
3. Nhấn "Tải thêm" → 20 sự kiện tiếp theo append vào list

### S7 — Provider không có quyền xem nhân viên khác

1. Gọi `GET /v1/provider/staff/:staffIdOfAnotherProvider/kpi`
2. **Expected**: Response 403 `FORBIDDEN`
3. **Expected**: Frontend redirect về `/provider/staff` hoặc hiển thị error page

### S8 — Skeleton loading state

1. Mở trang chi tiết (throttle network xuống Slow 3G)
2. **Expected**: 5 KPI card hiển thị skeleton shimmer thay vì layout trống
3. Sau khi data load → skeleton thay thế bằng số thực

---

## Unit Test Checklist (backend)

- [ ] `onTimeCheckInRate` = null khi 0 check-ins (không chia 0)
- [ ] `period=7d` chỉ tính từ `NOW() - 7 days`
- [ ] Provider A không thể xem KPI của staff Provider B → 403
- [ ] staffId không tồn tại → 404
- [ ] `activeDaysCount` không đếm trùng ngày khi có nhiều sự kiện cùng ngày
- [ ] Timeline sắp xếp đúng `event_time DESC`
- [ ] `hasMore = true` khi total > offset + limit
