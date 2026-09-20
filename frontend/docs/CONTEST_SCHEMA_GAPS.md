# Báo Cáo Phân Tích Database Schema & API Gaps cho Hệ Thống Giải Đấu RC Field

Tài liệu này tổng hợp phân tích của chuyên gia UI/UX và Kiến trúc hệ thống về các trường thông tin dữ liệu (Database) và Điểm cuối API (Endpoints) hiện tại đang bị thiếu để vận hành một giải đấu đua xe điều khiển (RC) chuyên nghiệp ở quy mô các quán cafe.

---

## 1. Phân Tích Database Schema Gaps (Các trường thiếu trong Cơ sở dữ liệu)

Hiện tại, các bảng của module Contest (`Contest`, `ContestRegistration`, `ContestRound`, `BracketMatch`) mới chỉ hỗ trợ luồng Check-in và tạo nhánh đấu sơ sài kiểu Knockout. Để tổ chức giải đua RC chuyên nghiệp, cần bổ sung các trường sau:

### A. Bảng `Contests` (Thông tin Giải đấu)
*   `tournament_type`: **Enum/String** (e.g. `OFF_ROAD`, `DRIFT`, `ON_ROAD`, `DRAG`) - Hệ đua để bộ phận kỹ thuật áp quy định kiểm tra.
*   `permitted_vehicles`: **Text** (e.g. `1/10 Scale Short Course Trucks, Max 3S LiPo`) - Quy chuẩn cấu hình xe được phép tham dự.
*   `track_surface`: **String** (e.g. `Đất hỗn hợp (Dirt)`, `Thảm nỉ (Carpet)`, `Nhựa đường (Asphalt)`) - Bề mặt đường đua ảnh hưởng đến loại lốp được dùng.
*   `timing_system_type`: **String** (e.g. `EASY_LAP`, `MYLAPS`, `MANUAL`) - Loại thiết bị/hệ thống bấm giờ được sử dụng tại chi nhánh.
*   `track_layout_image_url`: **String** - Sơ đồ đường chạy (Track Map) để hiển thị trực quan cho vận động viên khi đăng ký.
*   `max_duration_minutes`: **Integer** - Thời lượng dự kiến tối đa của giải đấu.

### B. Bảng `ContestRegistrations` (Đăng ký của Racer)
Để thực hiện quy trình kiểm tra kỹ thuật (Technical Inspection) và định danh xe:
*   `sbd`: **String** (Số Báo Danh - e.g., `RC-001`, `RC-024`) - Mã định danh duy nhất của racer trong suốt giải đấu, dán trực tiếp lên thân xe.
*   `transponder_id`: **String** - Mã số chip tính giờ tự động gắn trên xe (vận động viên tự mang đến hoặc thuê của quán).
*   `tech_check_status`: **Enum** (`PENDING` - Chờ kiểm tra, `PASSED` - Đạt, `FAILED` - Không đạt).
*   `tech_check_notes`: **Text** - Ghi chú lỗi kỹ thuật (e.g., "Trùng tần số sóng 2.4GHz", "Quá cân nặng pin", "Động cơ vượt mức kV cho phép").
*   `vehicle_model`: **String** - Hãng và dòng xe (e.g., `Traxxas Slash 4x4`, `Losi Tenacity`).
*   `motor_type`: **String** - Thông số động cơ (e.g., `Hobbywing 10.5T Brushless`).

### C. Bảng `ContestHeats` / `ContestRounds` (Lượt đua)
Đua xe RC thường chạy theo Heat (Lượt đấu vòng loại gom 4-6 xe chạy cùng lúc tính thời gian Lap tốt nhất) thay vì chỉ đấu tay đôi Knockout:
*   `laps_limit`: **Integer** (e.g. `10`) - Giới hạn số vòng chạy quy định để tính giờ hoàn thành Heat.
*   `time_limit_seconds`: **Integer** (e.g. `300` - 5 phút) - Thời gian tối đa của một Heat.
*   `heat_type`: **Enum** (`PRACTICE` - Chạy thử, `QUALIFYING` - Vòng loại, `MAIN_A` - Chung kết A, `MAIN_B` - Chung kết B).
*   `grid_positions`: **JSON/Array** - Mảng lưu thứ tự sắp xếp vị trí xuất phát (Grid Order) của các tay đua từ lane 1 đến lane 8.

### D. Bảng `ContestLapRecords` (Lưu vết chi tiết Lap - MỚI HOÀN TOÀN)
Bảng này cực kỳ quan trọng đối với đua xe RC chuyên nghiệp để lưu trữ kết quả của hệ thống tính giờ tự động (Transponder Loop):
*   `id`: **UUID (Primary Key)**
*   `registration_id`: **UUID (Foreign Key)**
*   `heat_id`: **UUID (Foreign Key)**
*   `lap_number`: **Integer** - Vòng số mấy.
*   `lap_time_ms`: **Integer** - Thời gian hoàn thành vòng chạy đó (tính bằng mili-giây).
*   `passing_time_ms`: **Integer** - Tổng thời gian tích lũy từ lúc xuất phát khi xe đi qua cổng chip.

---

## 2. Phân Tích API Gaps (Các Endpoints cần bổ sung trên Backend)

Hệ thống frontend hiện tại đang giả lập hoặc gọi các API thô. Backend cần cung cấp các API chuyên dụng sau để hoàn thiện trải nghiệm kéo thả và điều khiển giải đua:

### A. Quản Lý Kéo Thả & Sắp Xếp Heat
*   `PUT /v1/contests/:id/heats/reorder`
    *   **Mô tả:** Lưu cấu trúc sắp xếp các tay đua giữa các Heat và đổi vị trí xuất phát (`grid_position`).
    *   **Payload:**
        ```json
        {
          "heat_id": "uuid-heat-1",
          "entries": [
            { "registration_id": "reg-uuid-1", "grid_position": 1 },
            { "registration_id": "reg-uuid-2", "grid_position": 2 }
          ]
        }
        ```

### B. Cập Nhật Quy Trình Kiểm Tra Kỹ Thuật (Tech-Check)
*   `POST /v1/contests/registrations/:id/tech-check`
    *   **Mô tả:** Nhân viên cập nhật thông tin kiểm định xe sau khi kiểm tra thủ công các hạng mục cân nặng, động cơ, pin, tần số điều khiển.
    *   **Payload:**
        ```json
        {
          "status": "PASSED",
          "transponder_id": "8372651",
          "notes": "Xe đạt chuẩn, đã cấu hình chip EasyLap",
          "checklist": {
            "weight_check": true,
            "dimension_check": true,
            "motor_battery_check": true,
            "frequency_check": true
          }
        }
        ```

### C. Live Timing & Real-time Stream
*   `GET /v1/contests/:id/timing/stream`
    *   **Mô tả:** Điểm cuối WebSocket hoặc Server-Sent Events (SSE) để truyền dữ liệu thời gian thực từ phần mềm bấm giờ của quán lên bảng điện tử màn hình lớn (Leaderboard Live) cho khán giả và tuyển thủ theo dõi.
    *   **Dữ liệu truyền về:** Tốc độ vòng chạy hiện tại của từng tay đua, thứ hạng thay đổi liên tục khi có xe qua cổng chip.

### D. Tự động tính toán & Đồng bộ Bảng Xếp Hạng
*   `POST /v1/contests/:id/leaderboard/recalculate`
    *   **Mô tả:** Yêu cầu hệ thống tính toán lại bảng xếp hạng dựa trên thành tích vòng chạy tốt nhất (`best_lap`) hoặc tổng thời gian đua ngắn nhất của các lượt chạy đã được xác nhận (Verify).
