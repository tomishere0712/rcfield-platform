# Yêu Cầu Tích Hợp API Từ Backend (BE) Cho Trang Tìm Kiếm & Lọc Cafe (`/cafes`)

Tài liệu này tổng hợp toàn bộ các trường dữ liệu và tham số lọc cần được phía Backend bổ sung hoặc chỉnh sửa trong API **`GET /v1/cafes`** để trang khám phá hoạt động 100% bằng dữ liệu từ hệ thống, tránh việc lọc ở client-side hay sử dụng dữ liệu mặc định.

---

## 1. Các bộ lọc cần Backend hỗ trợ qua API Parameter
Hiện tại, một số bộ lọc lớn của Traveloka đang phải xử lý bằng cách lọc ở client-side (frontend tự filter sau khi nhận danh sách từ BE). Để tối ưu hoá hiệu năng khi số lượng cơ sở tăng lên, Backend cần hỗ trợ các tham số query này trực tiếp từ cơ sở dữ liệu:

| Tham số Query | Loại dữ liệu | Ví dụ giá trị | Mô tả |
| :--- | :--- | :--- | :--- |
| `price_min` | `number` | `50000` | Giá thuê slot tối thiểu |
| `price_max` | `number` | `200000` | Giá thuê slot tối đa |
| `amenities` | `string[]` | `["Serious Inspection", "Mát lạnh Điều hòa"]` | Lọc theo danh sách tiện ích đặc biệt |
| `vehicle_type` | `string` | `"Drift"` | Lọc theo thể loại xe cho thuê (nếu quán có cung cấp xe thuê) |
| `sort_by` | `string` | `"popularity"`, `"price_asc"`, `"price_desc"`, `"rating"` | Sắp xếp danh sách (mặc định theo độ phổ biến) |

---

## 2. Các trường thông tin cần trả thêm trong response danh sách cơ sở
Để hiển thị đầy đủ thông tin cho layout thẻ ngang (Traveloka-style) mới mà không cần fake data hoặc gọi thêm API đơn lẻ cho từng dòng, API trả về danh sách của `GET /v1/cafes` cần trả bổ sung các thuộc tính dưới đây:

### A. Rating & Reviews
*   `rating` (`number`): Điểm đánh giá trung bình từ người dùng (Thang điểm 0 - 10 hoặc 0 - 5). Hiện tại FE đang hiển thị fallback là `0.0`.
*   `reviews_count` (`number`): Tổng số lượng đánh giá của cơ sở. Hiện tại FE đang hiển thị fallback là `0`.

### B. Amenities (Tiện ích đặc biệt)
*   `amenities` (`array`): Danh sách chi tiết các tiện ích có ở sân (ví dụ: Hệ thống Mylaps, Pit Area Pro, Điều hòa, F&B,...).
    *   *Lưu ý*: Backend đã có bảng tiện ích này nhưng hiện tại API danh sách `/v1/cafes` chưa đính kèm `amenities` vào response của từng cơ sở. Frontend đã viết mapper sẵn sàng để hiển thị ngay khi Backend trả trường này dưới dạng `amenities: [{ id, title, icon }]`.

### C. Giá thấp nhất (Min Price)
*   `min_price` (`number`): Giá của dịch vụ thấp nhất (hoặc slot rẻ nhất của sân) để hiển thị nhãn "Từ [Giá] VND / giờ".

### D. Tích hợp sẵn thông tin Khuyến mãi (Promotions)
*   Hiện tại Frontend đang phải thực hiện gọi song song API `promotionApi.listActive(cafeId)` cho từng cơ sở trong danh sách để tìm mã giảm giá.
*   **Đề xuất**: API danh sách `GET /v1/cafes` nên trả kèm danh sách các khuyến mãi đang kích hoạt (`active_promotions: []`) của từng cơ sở để tránh việc frontend phải gọi hàng chục request phụ cùng lúc (gây nghẽn mạng).

---

## 3. Bản đồ & Tọa độ địa lý
*   Cần đảm bảo tất cả các cơ sở khi tạo mới đều bắt buộc có toạ độ `latitude` và `longitude` hợp lệ.
*   Hiện tại nếu toạ độ trả về bị null hoặc bằng 0, Frontend đang định vị mặc định lên giữa bản đồ Việt Nam.
