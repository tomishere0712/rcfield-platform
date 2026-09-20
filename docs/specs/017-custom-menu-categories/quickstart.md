# Quickstart — Danh mục F&B do Provider tự tạo

**Feature**: `specs/017-custom-menu-categories` | **Date**: 2026-07-25

Tài liệu này là bộ kịch bản xác minh thủ công + checklist test tự động. Chạy đủ trước khi coi tính năng là xong.

---

## Chuẩn bị

```bash
# 1. Backend — chạy migration
cd rcfield-workspace/rcfield-spec/rcfeild-be
npm run migration:run

# 2. Seed lại dữ liệu demo (seed đã được sửa để tạo danh mục)
npm run seed

# 3. Chạy API
npm run dev

# 4. Frontend
cd ../rcfield-fe
npm run dev
```

**Kiểm tra migration đã chạy đúng** — cả 4 lệnh phải cho kết quả như mô tả:

```sql
-- a) Bảng danh mục tồn tại
\d menu_categories

-- b) Cột enum cũ đã biến mất, cột FK mới đã có
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'menu_items' AND column_name IN ('category', 'category_id');
-- Kỳ vọng: đúng 1 dòng — category_id | uuid

-- c) Type enum đã bị drop
SELECT 1 FROM pg_type WHERE typname = 'fnb_category_enum';
-- Kỳ vọng: 0 dòng

-- d) Partial unique index tồn tại ĐÚNG dạng có mệnh đề WHERE
SELECT indexdef FROM pg_indexes WHERE indexname = 'UQ_menu_categories_cafe_name';
-- Kỳ vọng: chuỗi trả về PHẢI chứa "WHERE (deleted_at IS NULL)"
```

> Bước (d) là bước dễ bỏ sót nhất. Thiếu mệnh đề `WHERE`, kịch bản 4 sẽ fail và Provider vĩnh viễn không tạo lại được danh mục đã xóa.

---

## Kịch bản E2E

### KB-1 — Provider tạo bộ danh mục đầu tiên (US1)

1. Đăng nhập Provider → **Quản lý menu đồ ăn** → chọn chi nhánh "RC Tân Bình".
2. Quan sát: thẻ **Category** hiển thị `0`, toàn bộ món nằm ở nhóm **Chưa phân loại**.
3. Mở hộp thoại quản lý danh mục → tạo lần lượt: `Cà phê`, `Trà sữa`, `Đồ ăn nhẹ`.

**Kỳ vọng**
- Ba danh mục xuất hiện theo đúng thứ tự tạo (`displayOrder` = 0, 1, 2).
- Thẻ **Category** đổi thành `3` — số thật từ API, không phải hằng số.
- Bộ lọc danh mục ở màn danh sách có đủ 3 lựa chọn mới + `Tất cả` + `Chưa phân loại`.

---

### KB-2 — Cô lập giữa các chi nhánh (US1, FR-005)

1. Chuyển sang chi nhánh "RC Arena Sài Gòn".
2. Quan sát danh sách danh mục.
3. Tạo tại đây một danh mục cũng tên `Cà phê`.

**Kỳ vọng**
- Chi nhánh Sài Gòn **không** thấy 3 danh mục của Tân Bình — bắt đầu từ số 0.
- Tạo `Cà phê` ở Sài Gòn **thành công** dù Tân Bình đã có tên này (ràng buộc trùng tên chỉ trong phạm vi chi nhánh).
- Quay lại Tân Bình: bộ danh mục nguyên vẹn, không bị ảnh hưởng.

---

### KB-3 — Chặn xóa danh mục còn món (US1, FR-015) ⚠️ trọng tâm

1. Ở Tân Bình, gán 5 món bất kỳ vào danh mục `Cà phê`.
2. Đặt 1 trong 5 món đó sang trạng thái **Tạm ẩn**.
3. Bấm xóa danh mục `Cà phê`.

**Kỳ vọng**
- Hệ thống **từ chối**, thông báo nêu đúng **5 món** — món tạm ẩn vẫn được tính.
- Danh mục còn nguyên, không món nào bị đổi.
- Response `409` với `code = CATEGORY_NOT_EMPTY` và `details.itemCount = 5`.

4. Chuyển cả 5 món sang `Trà sữa` (hoặc bỏ danh mục) rồi xóa lại `Cà phê`.

**Kỳ vọng**: xóa thành công `204`, danh mục biến mất khỏi mọi màn hình, 5 món vẫn còn nguyên vẹn.

---

### KB-4 — Tạo lại danh mục trùng tên vừa xóa (US1, FR-006) ⚠️ trọng tâm

Tiếp ngay sau KB-3.

1. Tạo một danh mục mới cũng tên `Cà phê`.

**Kỳ vọng**: thành công `201`, **không** báo trùng tên. Đây là kịch bản chứng minh partial unique index đúng.

2. Thử tạo thêm một danh mục nữa cũng tên `cà phê` (chữ thường, thêm khoảng trắng hai đầu: `"  cà phê  "`).

**Kỳ vọng**: bị từ chối `409 CATEGORY_NAME_DUPLICATE` — so sánh không phân biệt hoa/thường và đã trim.

---

### KB-5 — Combo tự gán danh mục (US2, FR-013) ⚠️ trọng tâm

1. Tạo combo gồm 2 món, đặt tên `Combo tiết kiệm`, chọn danh mục `Đồ ăn nhẹ`.

**Kỳ vọng**
- Combo được lưu với `categoryName = "Đồ ăn nhẹ"` — **không** bị ghi đè thành `"COMBO"`.
- `isCombo = true`, danh sách `components` hiển thị đủ 2 món thành phần.
- Ở màn quản lý, cột danh mục hiện `Đồ ăn nhẹ`.

2. Tạo combo thứ hai, **không** chọn danh mục.

**Kỳ vọng**: lưu thành công, rơi vào nhóm **Chưa phân loại**.

---

### KB-6 — Khách xem menu, tên hiển thị đúng (US3, FR-017) ⚠️ trọng tâm

1. Đăng xuất (hoặc dùng cửa sổ ẩn danh) → mở trang chi tiết chi nhánh "RC Tân Bình".
2. Đăng nhập Customer → vào luồng đặt lịch → bước **Chọn món**.

**Kỳ vọng cả hai màn**
- Nhãn danh mục hiển thị **`Trà sữa`, `Đồ ăn nhẹ`** — tiếng Việt do Provider nhập.
- **Không xuất hiện** bất kỳ chuỗi nào trong `DRINK`, `FOOD`, `SNACK`, `DESSERT`, `COMBO`, `OTHER`. Đây chính là lỗi đang tồn tại ở `FnbStep.tsx:91` và `CafeFnbSection.tsx:73`.
- Thứ tự nhóm khớp thứ tự Provider đã sắp.
- Nhóm **Chưa phân loại** nằm cuối cùng.
- Danh mục rỗng (`itemCount = 0`) **không** hiển thị cho khách.

---

### KB-7 — Sắp xếp lại thứ tự (US1, FR-004/FR-018)

1. Provider kéo `Đồ ăn nhẹ` lên đầu.
2. Refresh màn quản lý → mở lại trang khách.

**Kỳ vọng**: thứ tự mới giữ nguyên sau refresh và khớp ở **cả** màn quản lý lẫn màn khách.

---

### KB-8 — Đổi tên không ảnh hưởng đơn đã phát sinh (FR-024, SC-005) ⚠️ trọng tâm

1. Tạo một booking có pre-order F&B gồm món thuộc `Trà sữa`. Ghi lại tổng tiền.
2. Provider đổi tên `Trà sữa` → `Trà & Nước ép`.
3. Kiểm tra lần lượt: chi tiết booking (Customer), màn hình phiên chạy (Staff), Top F&B ở dashboard Provider, email hóa đơn.

**Kỳ vọng**: **không màn nào thay đổi**. Tên món và giá trong đơn giữ nguyên; tổng tiền không đổi. Danh mục không tồn tại trong đơn đã phát sinh nên không có gì để đổi.

---

### KB-9 — Trợ lý AI trả lời theo danh mục (US4, FR-023)

1. Mở widget chat của chi nhánh, hỏi: *"Quán có đồ uống gì?"*

**Kỳ vọng**: trả lời nhóm món theo `Cà phê` / `Trà & Nước ép` / `Đồ ăn nhẹ` — **không** dùng mã `DRINK`/`FOOD`. Món chưa gán nằm ở nhóm `Chưa phân loại`.

---

### KB-10 — Ranh giới quyền (FR-005, FR-009)

1. Đăng nhập Provider B (không sở hữu "RC Tân Bình").
2. Gọi trực tiếp `POST /v1/cafes/<id-Tân-Bình>/menu/categories`.
3. Đăng nhập Staff, thử gọi cùng endpoint.

**Kỳ vọng**: cả hai bị chặn `403`. Response **không** tiết lộ tên hay số lượng danh mục của chi nhánh Tân Bình.

---

## Checklist test tự động

### Backend — `src/__tests__/routes/menu-category.test.ts` (tạo mới)

- [ ] `GET /categories` trả mảng rỗng cho chi nhánh chưa có danh mục
- [ ] `GET /categories` sắp xếp theo `display_order` rồi `created_at`
- [ ] `GET /categories` trả `itemCount` đúng, **bao gồm** món `is_available = false`
- [ ] `POST` tạo thành công, `displayOrder` tự tăng và rơi xuống cuối
- [ ] `POST` từ chối tên rỗng / chỉ khoảng trắng → `400`
- [ ] `POST` từ chối tên >50 ký tự → `400`
- [ ] `POST` từ chối trùng tên khác hoa/thường và có khoảng trắng thừa → `409 CATEGORY_NAME_DUPLICATE`
- [ ] **`POST` cho phép trùng tên với danh mục đã xóa mềm → `201`** *(chứng minh partial unique index)*
- [ ] `POST` cho phép trùng tên giữa hai chi nhánh khác nhau → `201`
- [ ] `POST` từ chối khi đã đủ 30 danh mục → `409 CATEGORY_LIMIT_EXCEEDED`
- [ ] `PATCH` đổi tên thành công
- [ ] `PATCH` danh mục thuộc chi nhánh khác → `404` (không phải `403`, tránh lộ dữ liệu)
- [ ] **`DELETE` danh mục còn món → `409 CATEGORY_NOT_EMPTY` với `details.itemCount` đúng**
- [ ] **`DELETE` danh mục chỉ còn món `is_available = false` → vẫn `409`**
- [ ] `DELETE` danh mục rỗng → `204`, bản ghi có `deleted_at`, biến mất khỏi `GET`
- [ ] `PATCH /reorder` gán lại `0..N-1` đúng thứ tự mảng
- [ ] `PATCH /reorder` từ chối mảng thiếu / thừa / trùng id → `400`
- [ ] Provider không sở hữu chi nhánh → `403` trên mọi endpoint ghi
- [ ] Staff / Customer → `403` trên mọi endpoint ghi
- [ ] Khách chưa đăng nhập gọi `GET /categories` → `200`

### Backend — `src/__tests__/routes/menu.test.ts` (sửa)

- [ ] Helper `createMenuItem` bỏ cột `category` khỏi câu INSERT *(nếu không, toàn bộ file vỡ)*
- [ ] Toàn bộ test cũ vẫn xanh
- [ ] Response món trả `categoryId` + `categoryName`, **không** còn trường `category`
- [ ] Lọc `?category_id=<uuid>` trả đúng món của danh mục đó
- [ ] Lọc `?category_id=none` trả đúng món chưa phân loại
- [ ] `POST` món với `category_id` của chi nhánh khác → `400 INVALID_CATEGORY`
- [ ] `POST` món không truyền `category_id` → lưu thành công với `categoryId = null`
- [ ] **`POST /combos` với `category_id` → combo giữ đúng danh mục, không bị ép `COMBO`**
- [ ] `POST /combos` không truyền `category_id` → `categoryId = null`, `isCombo` vẫn `true`
- [ ] Luật combo giữ nguyên: `COMBO_IN_COMBO`, `USE_COMBO_ENDPOINT`, tối thiểu 2 thành phần
- [ ] Thứ tự trả về: danh mục có tên trước, `null` cuối cùng

### Kiểm tra không hồi quy — chạy lại, kỳ vọng không đổi

- [ ] `swagger.test.ts` xanh sau khi cập nhật `menu.openapi.ts`
- [ ] `walk-in-booking.test.ts` xanh *(chạm `getSessionDetail`)*
- [ ] `npm run seed` chạy sạch từ DB trống
- [ ] `npx tsc --noEmit` không lỗi ở cả hai repo *(enum `FnbCategory` bị xóa sẽ lộ mọi chỗ còn tham chiếu)*

### Frontend — xác minh thủ công

- [ ] `ProviderMenuPage` — thẻ **Category** hiển thị số thật, không phải hằng số `5`
- [ ] `ProviderMenuPage` — bộ lọc dựng từ API, có lựa chọn `Chưa phân loại`
- [ ] `ProviderMenuPage` — cột danh mục hiện tên Provider nhập; combo hiện danh mục đã gán, không phải chữ `"Combo"` cứng
- [ ] `ProviderMenuItemFormDialog` — dropdown từ API, không còn mặc định cứng `"Đồ uống"`, cho phép bỏ trống
- [ ] `ProviderComboFormDialog` — **có** dropdown chọn danh mục (trường mới)
- [ ] `FnbStep` — badge hiện tên tiếng Việt, không phải `DRINK`
- [ ] `CafeFnbSection` — nhóm theo danh mục đúng thứ tự, `Chưa phân loại` cuối
- [ ] Không còn tham chiếu `FNB_CATEGORIES` / `FNB_CATEGORY_LABEL` nào trong `rcfield-fe/src`

---

## Xác minh sau khi triển khai (production)

Ngay sau migration, **toàn bộ menu của mọi chi nhánh nằm trong nhóm "Chưa phân loại"** — đây là hành vi đúng theo FR-025, không phải sự cố.

Câu truy vấn xác nhận không mất dữ liệu:

```sql
-- Số món phải khớp chính xác con số trước khi migrate
SELECT COUNT(*) FROM menu_items WHERE deleted_at IS NULL;

-- Toàn bộ món chưa phân loại — đúng như thiết kế
SELECT COUNT(*) FROM menu_items WHERE category_id IS NULL AND deleted_at IS NULL;

-- Không đơn F&B nào bị đụng
SELECT COUNT(*), SUM(subtotal) FROM fnb_order_items;
```

**Cần thông báo cho Provider trước khi triển khai**: họ phải tự tạo lại danh mục và phân loại lại menu. Dùng bộ lọc `Chưa phân loại` ở màn quản lý để thao tác nhanh.
