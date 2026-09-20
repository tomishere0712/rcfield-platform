# API Contracts — Danh mục F&B do Provider tự tạo

**Feature**: `specs/017-custom-menu-categories` | **Date**: 2026-07-25
**Base path**: `/api/v1`

---

## Tổng quan

| # | Method | Path | Quyền | Trạng thái |
|---|---|---|---|---|
| 1 | `GET` | `/v1/cafes/:cafeId/menu/categories` | Công khai (`optionalAuthenticate`) | **Mới** |
| 2 | `POST` | `/v1/cafes/:cafeId/menu/categories` | `PROVIDER` (chủ chi nhánh) | **Mới** |
| 3 | `PATCH` | `/v1/cafes/:cafeId/menu/categories/:categoryId` | `PROVIDER` (chủ chi nhánh) | **Mới** |
| 4 | `DELETE` | `/v1/cafes/:cafeId/menu/categories/:categoryId` | `PROVIDER` (chủ chi nhánh) | **Mới** |
| 5 | `PATCH` | `/v1/cafes/:cafeId/menu/categories/reorder` | `PROVIDER` (chủ chi nhánh) | **Mới** |
| 6 | `GET` | `/v1/cafes/:cafeId/menu` | Công khai | **Sửa** — query + response |
| 7 | `POST` `PATCH` | `/v1/cafes/:cafeId/menu[/:itemId]` | `PROVIDER` | **Sửa** — body + response |
| 8 | `POST` `PATCH` | `/v1/cafes/:cafeId/menu/combos[/:itemId]` | `PROVIDER` | **Sửa** — body + response |

### ⚠️ Ràng buộc đăng ký route

`menuRouter` (`src/routes/menu.routes.ts`) hiện có `patch('/:itemId')` và `delete('/:itemId')`. Nhóm route `/categories` **bắt buộc** đăng ký trước chúng, giống cách `/combos` đang được đặt trước. Nếu đăng ký sau, Express khớp `/categories/<uuid>` vào `/:itemId` với `itemId = "categories"` và trả lỗi UUID không hợp lệ — lỗi im lặng, khó truy vết.

Riêng route `reorder` phải đặt **trước** `/:categoryId` vì cùng lý do.

Thứ tự đúng trong `menu.routes.ts`:

```typescript
menuRouter.use(authenticate, authorize(UserRole.PROVIDER), requireActiveProvider);

// categories — TRƯỚC mọi route có tham số động
menuRouter.post('/categories', menuCategoryController.create);
menuRouter.patch('/categories/reorder', menuCategoryController.reorder);   // trước /:categoryId
menuRouter.patch('/categories/:categoryId', menuCategoryController.update);
menuRouter.delete('/categories/:categoryId', menuCategoryController.remove);

// combos — giữ nguyên
menuRouter.post('/combos', menuController.createCombo);
menuRouter.patch('/combos/:itemId', menuController.updateCombo);

// item — luôn cuối cùng
menuRouter.post('/', menuController.createMenuItem);
menuRouter.patch('/:itemId', menuController.updateMenuItem);
menuRouter.delete('/:itemId', menuController.deleteMenuItem);
```

`GET /categories` đăng ký ở `cafe.routes.ts` với `optionalAuthenticate`, **trước** dòng `cafeRouter.use('/:cafeId/menu', menuRouter)`:

```typescript
cafeRouter.get('/:cafeId/menu/categories', optionalAuthenticate, menuCategoryController.list);
cafeRouter.get('/:cafeId/menu', optionalAuthenticate, menuController.listMenuItems);
cafeRouter.use('/:cafeId/menu', menuRouter);
```

---

## Kiểu dùng chung

```typescript
interface MenuCategoryResponse {
  id: string;            // uuid
  cafeId: string;        // uuid
  name: string;          // tên hiển thị Provider nhập
  displayOrder: number;
  itemCount: number;     // số món chưa xóa thuộc danh mục (kể cả món tạm ngưng bán)
  createdAt: string;     // ISO 8601
  updatedAt: string;
}
```

`itemCount` được trả sẵn để FE dựng cảnh báo trước khi Provider bấm xóa mà không phải gọi thêm request.

> ⚠️ **`itemCount` chỉ dùng cho màn hình quản lý của Provider.** Nó đếm cả món `is_available = false`, nên **không** dùng được để quyết định có ẩn danh mục khỏi màn hình khách hay không: danh mục có 3 món đều tạm ngưng bán sẽ có `itemCount = 3` nhưng theo FR-021 vẫn phải giấu khỏi khách. Tiêu chí ẩn ở phía khách là "nhóm không có món nào trong tập kết quả đã lọc `available=true`" — suy ra từ chính danh sách món, không từ trường này.

---

## 1. `GET /v1/cafes/:cafeId/menu/categories`

Liệt kê danh mục của một chi nhánh, theo thứ tự hiển thị.

**Quyền**: công khai. Khách vãng lai và mọi vai trò đều đọc được — cần thiết cho trang chi tiết chi nhánh và luồng đặt lịch (FR-017).

**Query**: không có.

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "3f2a...", "cafeId": "8e7f...", "name": "Cà phê",   "displayOrder": 0, "itemCount": 6, "createdAt": "2026-07-25T03:00:00.000Z", "updatedAt": "2026-07-25T03:00:00.000Z" },
    { "id": "9b1c...", "cafeId": "8e7f...", "name": "Trà sữa",  "displayOrder": 1, "itemCount": 0, "createdAt": "2026-07-25T03:01:00.000Z", "updatedAt": "2026-07-25T03:01:00.000Z" }
  ]
}
```

Sắp xếp: `display_order ASC, created_at ASC`. Danh mục đã xóa mềm không xuất hiện. Danh mục rỗng (`itemCount = 0`) **vẫn trả về** — việc ẩn khỏi màn hình khách là quyết định ở tầng hiển thị (FR-021), không phải ở API, vì cùng endpoint này phục vụ cả màn hình quản lý.

**Lỗi**: `404 CAFE_NOT_FOUND`.

---

## 2. `POST /v1/cafes/:cafeId/menu/categories`

**Body**

```json
{ "name": "Cà phê" }
```

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `name` | string | bắt buộc, trim, 1–50 ký tự, không rỗng sau trim |

`display_order` không nhận từ client — server gán `COALESCE(MAX(display_order), -1) + 1` để danh mục mới rơi xuống cuối.

**Response `201`**: `{ "success": true, "data": MenuCategoryResponse }` với `itemCount: 0`.

**Lỗi**

| Mã | Code | Khi nào |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Tên rỗng / chỉ khoảng trắng / >50 ký tự (FR-007, FR-008) |
| `403` | `FORBIDDEN` | Provider không sở hữu chi nhánh (FR-009) |
| `404` | `CAFE_NOT_FOUND` | Chi nhánh không tồn tại |
| `409` | `CATEGORY_NAME_DUPLICATE` | Trùng tên với danh mục **chưa xóa** trong cùng chi nhánh (FR-006) |
| `409` | `CATEGORY_LIMIT_EXCEEDED` | Đã đạt 30 danh mục (FR-008) |

Tạo lại danh mục trùng tên với một danh mục **đã xóa mềm** phải thành công `201` — không trả `409`.

---

## 3. `PATCH /v1/cafes/:cafeId/menu/categories/:categoryId`

**Body**

```json
{ "name": "Cà phê & Trà" }
```

Chỉ đổi tên. Thứ tự đổi qua endpoint `reorder` riêng.

**Response `200`**: `{ "success": true, "data": MenuCategoryResponse }`

**Lỗi**: như endpoint 2, cộng `404 CATEGORY_NOT_FOUND` (không tồn tại, đã xóa, hoặc thuộc chi nhánh khác — không phân biệt để tránh lộ dữ liệu chi nhánh khác, FR-005).

---

## 4. `DELETE /v1/cafes/:cafeId/menu/categories/:categoryId`

Xóa mềm một danh mục **rỗng**.

**Response `204`**: không có body.

**Lỗi**

| Mã | Code | Khi nào |
|---|---|---|
| `403` | `FORBIDDEN` | Không sở hữu chi nhánh |
| `404` | `CATEGORY_NOT_FOUND` | Không tồn tại / đã xóa / thuộc chi nhánh khác |
| `409` | `CATEGORY_NOT_EMPTY` | **Danh mục còn ≥1 món** (FR-015) |

**Response `409` — hợp đồng cụ thể**

```json
{
  "success": false,
  "code": "CATEGORY_NOT_EMPTY",
  "message": "Danh mục \"Cà phê\" còn 5 món. Vui lòng chuyển các món sang danh mục khác trước khi xóa.",
  "details": { "itemCount": 5 }
}
```

> Hình dạng lỗi **phẳng**, khớp `error.middleware.ts` hiện hành (`{ success, code, message }`) — không lồng trong `error`. Trường `details` là bổ sung mới: `AppError` được mở rộng thêm tham số thứ tư tuỳ chọn `details?: Record<string, unknown>`, middleware chỉ đính kèm khi có. Thay đổi tương thích ngược, mọi `AppError` cũ không đổi hành vi.

Số món đếm theo `menu_items WHERE category_id = :id AND deleted_at IS NULL` — **không** lọc `is_available`, tức món đang tạm ngưng bán vẫn chặn xóa (FR-015).

---

## 5. `PATCH /v1/cafes/:cafeId/menu/categories/reorder`

**Body**

```json
{ "category_ids": ["9b1c...", "3f2a...", "7d4e..."] }
```

| Trường | Kiểu | Ràng buộc |
|---|---|---|
| `category_ids` | string[] | bắt buộc, mảng uuid, **phải chứa đầy đủ và đúng một lần** mọi danh mục chưa xóa của chi nhánh |

Server gán `display_order = 0..N-1` theo đúng thứ tự mảng, trong một transaction.

**Response `200`**: `{ "success": true, "data": MenuCategoryResponse[] }` — danh sách sau khi sắp xếp.

**Lỗi**

| Mã | Code | Khi nào |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Mảng rỗng, có id trùng lặp, hoặc không khớp đúng tập danh mục hiện tại của chi nhánh |
| `403` | `FORBIDDEN` | Không sở hữu chi nhánh |

Yêu cầu mảng đầy đủ (thay vì cho phép sắp xếp một phần) loại bỏ hoàn toàn khả năng lệch thứ tự khi hai tab cùng thao tác — request nào tới sau ghi đè toàn bộ, kết quả luôn là một thứ tự hợp lệ.

---

## 6. `GET /v1/cafes/:cafeId/menu` — **THAY ĐỔI PHÁ VỠ**

### Query

| Tham số | Trước | Sau |
|---|---|---|
| `category` | enum `FOOD\|DRINK\|SNACK\|DESSERT\|COMBO\|OTHER` | **BỎ** |
| `category_id` | — | **MỚI** — uuid, hoặc literal `none` để lọc nhóm "Chưa phân loại" |
| `page`, `limit`, `available` | không đổi | không đổi |

### Response — trường của mỗi phần tử `data`

| Trường | Trước | Sau |
|---|---|---|
| `category` | `string \| null` (giá trị enum thô, ví dụ `"DRINK"`) | **BỎ** |
| `categoryId` | — | **MỚI** — `string \| null` |
| `categoryName` | — | **MỚI** — `string \| null`, tên Provider nhập |
| các trường còn lại | không đổi | không đổi |

```json
{
  "success": true,
  "data": [
    {
      "id": "56d9...", "cafeId": "8e7f...", "name": "Trà đào",
      "description": null, "price": "45000.00",
      "categoryId": "9b1c...", "categoryName": "Trà sữa",
      "isCombo": false, "imageUrl": null, "isAvailable": true,
      "createdAt": "...", "updatedAt": "...", "deletedAt": null
    },
    {
      "id": "77aa...", "name": "Combo tiết kiệm",
      "price": "89000.00",
      "categoryId": null, "categoryName": null,
      "isCombo": true,
      "components": [ { "itemId": "...", "name": "Trà đào", "quantity": 1 } ],
      "isAvailable": true
    }
  ],
  "meta": { "total": 2, "page": 1, "limit": 20 }
}
```

**Vì sao trả cả `categoryId` lẫn `categoryName`**: hai trường phục vụ hai việc khác nhau. `categoryId` để lọc và để form chọn đúng giá trị; `categoryName` để hiển thị ngay mà không phải tải thêm danh sách danh mục rồi tự map. Trả sẵn tên khiến việc sửa `FnbStep.tsx` và `CafeFnbSection.tsx` chỉ là đổi tên trường. (research.md D5)

**Sắp xếp**: `(categoryId IS NULL) ASC, display_order ASC, created_at ASC, name ASC` — nhóm có tên trước, "Chưa phân loại" cuối (FR-018, FR-019).

---

## 7. `POST` / `PATCH` `/v1/cafes/:cafeId/menu[/:itemId]` — **THAY ĐỔI PHÁ VỠ**

### Body

| Trường | Trước | Sau |
|---|---|---|
| `category` | enum, nullable, optional | **BỎ** |
| `category_id` | — | **MỚI** — uuid nullable optional. `null` = Chưa phân loại (FR-011) |
| `name`, `description`, `price`, `image_url`, `is_available` | không đổi | không đổi |

**Lỗi mới**

| Mã | Code | Khi nào |
|---|---|---|
| `400` | `INVALID_CATEGORY` | `category_id` thuộc chi nhánh khác, hoặc không tồn tại / đã xóa (FR-012) |

### Response
Cùng hình dạng với phần tử `data` của endpoint 6.

---

## 8. `POST` / `PATCH` `/v1/cafes/:cafeId/menu/combos[/:itemId]` — **THAY ĐỔI HÀNH VI**

### Body

| Trường | Trước | Sau |
|---|---|---|
| `category_id` | không tồn tại | **MỚI** — uuid nullable optional, giống món lẻ |
| `name`, `description`, `price`, `image_url`, `is_available`, `components` | không đổi | không đổi |

**Thay đổi hành vi cốt lõi**: `menu.service.ts:214` hiện gán cứng `category: FnbCategory.COMBO` khi tạo combo. Dòng này **bị bỏ**. Combo nhận `category_id` từ body giống hệt món lẻ; không truyền thì combo thuộc "Chưa phân loại" (FR-013).

Cờ `isCombo` **vẫn trả về `true`** và các luật riêng của combo giữ nguyên: `components` tối thiểu 2 món, cấm lồng combo (`COMBO_IN_COMBO`), phải dùng endpoint combo để sửa (`USE_COMBO_ENDPOINT`). Danh mục và tính-là-combo là hai chiều độc lập (FR-014).

---

## Hợp đồng KHÔNG thay đổi

Xác nhận tường minh — các endpoint sau **không sửa gì**, vì `fnb_order_items` không lưu tham chiếu danh mục (FR-024, SC-005):

| Endpoint | Nơi tiêu thụ |
|---|---|
| `GET /v1/bookings/:id` | `booking.controller.ts:246` — chỉ map `mi.name` |
| `GET /v1/staff/sessions/:sessionId` | `staff.service.ts:1444` — `menuItem?.name` + qty + price |
| `GET /v1/staff/cafes/:cafeId/fnb-orders` | `staff.service.ts:714` — `COALESCE(mi.name, item_name_snapshot)` |
| `GET /v1/provider/dashboard/top-stats` | `provider-dashboard.service.ts:487` — name + quantity + revenue |
| Email hóa đơn | `email.service.ts:333` — chỉ gộp `fnb_total` |

---

## Bảng mã lỗi mới

| Code | HTTP | Thông báo tiếng Việt |
|---|---|---|
| `CATEGORY_NOT_FOUND` | 404 | Danh mục không tồn tại |
| `CATEGORY_NAME_DUPLICATE` | 409 | Danh mục "{name}" đã tồn tại trong cơ sở này |
| `CATEGORY_NOT_EMPTY` | 409 | Danh mục "{name}" còn {n} món. Vui lòng chuyển các món sang danh mục khác trước khi xóa. |
| `CATEGORY_LIMIT_EXCEEDED` | 409 | Mỗi cơ sở chỉ được tạo tối đa 30 danh mục |
| `INVALID_CATEGORY` | 400 | Danh mục không hợp lệ hoặc không thuộc cơ sở này |
