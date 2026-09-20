# Research — Danh mục F&B do Provider tự tạo

**Feature**: `specs/017-custom-menu-categories` | **Date**: 2026-07-25
**Phương pháp**: trace codebase thật bằng `codegraph_explore` + đọc trực tiếp file liên quan. Mọi số hiệu dòng dưới đây đã được xác minh trên `main`.

---

## Hiện trạng đã xác minh

| Hạng mục | Vị trí | Chi tiết |
|---|---|---|
| Enum nguồn | `rcfeild-be/src/types/index.ts:334` | `FnbCategory` = FOOD, DRINK, SNACK, DESSERT, COMBO, OTHER |
| Kiểu cột DB | `menu_items.category` | Postgres native enum `fnb_category_enum`, tạo ở migration `1751300000002` |
| Entity | `src/models/menu-item.entity.ts:31` | `@Column({ type: 'enum', enum: FnbCategory, nullable: true })` |
| Validate | `src/validate/index.ts:877, 895` | `z.nativeEnum(FnbCategory)` ở `MenuListQuerySchema` và `CreateMenuItemSchema` |
| Ép combo | `src/services/menu.service.ts:214` | `category: FnbCategory.COMBO` hardcode |
| Filter + sort | `src/services/menu.service.ts:111, 122` | `WHERE item.category = :category`, `ORDER BY item.category NULLS LAST` |
| Chatbot | `src/services/chat-tools/get-menu.ts:26` | `ORDER BY category ASC`, group theo giá trị enum thô |
| FE hardcode | `rcfield-fe/src/features/menu/types/index.ts:1-18` | `FNB_CATEGORIES` + `FNB_CATEGORY_LABEL` |

**Xác minh quan trọng — enum chỉ được dùng bởi đúng một bảng.** `grep fnb_category_enum` trên toàn bộ `src/migrations/` chỉ trả về file `1751300000002`, tức chỉ `menu_items.category` tham chiếu type này. Do đó `DROP TYPE` an toàn, không có bảng nào khác giữ tham chiếu.

**Xác minh quan trọng — đơn F&B đã phát sinh không lưu danh mục.** `fnb_order_items` chỉ có `menu_item_id`, `item_name_snapshot`, `quantity`, `unit_price`, `subtotal`, `notes`. Bốn nơi tiêu thụ dữ liệu này (`booking.controller.ts:246`, `staff.service.ts:714`, `staff.service.ts:1444`, `provider-dashboard.service.ts:487`) đều chỉ đọc tên món + số lượng + giá. Đây là cơ sở kỹ thuật cho FR-024: mọi thay đổi danh mục không chạm tới hóa đơn, chi tiết booking, màn hình Staff hay báo cáo doanh thu.

---

## D1 — Bảng riêng thay vì chuỗi tự do

**Decision**: Tạo bảng `menu_categories`, `menu_items.category_id` là khóa ngoại nullable.

**Rationale**: Bốn yêu cầu trong spec chỉ thỏa được bằng bảng riêng — đổi tên một chỗ áp dụng mọi nơi (FR-002), thứ tự hiển thị (FR-004), chặn xóa khi còn món (FR-015), ràng buộc trùng tên trong phạm vi chi nhánh (FR-006). Nếu lưu tên dạng chuỗi trên chính `menu_items` thì đổi tên phải UPDATE hàng loạt và không có chỗ nào để gắn thứ tự.

**Alternatives rejected**:
- *Giữ cột `category` dạng `VARCHAR` tự do* — quay lại đúng trạng thái trước migration `1751300000002`; không có thứ tự, không chống trùng tên, đổi tên phải sửa từng dòng.
- *JSONB mảng danh mục trên `cafes`* — không có khóa ngoại nên không chặn được xóa khi còn món, và không đánh index lọc được.

---

## D2 — Cách chuyển đổi cột: bỏ hẳn enum

**Decision**: Migration `up` thực hiện đúng thứ tự: tạo bảng `menu_categories` → thêm `menu_items.category_id` (uuid NULL, FK `ON DELETE RESTRICT`) → `DROP COLUMN menu_items.category` → `DROP TYPE fnb_category_enum`.

**Rationale**: Quyết định nghiệp vụ đã chốt là không giữ lại phân loại cũ (spec, Clarifications). Giữ cột enum song song chỉ tạo hai nguồn sự thật.

**⚠️ `ON DELETE RESTRICT` KHÔNG phải lưới an toàn cho FR-015.** Xóa danh mục là **xóa mềm** (D3), tức một câu `UPDATE ... SET deleted_at = now()`, không phải `DELETE`. Đã xác minh cơ chế hiện hành ở `menu.service.ts:182` (`item.deletedAt = new Date()` rồi `save()`). `RESTRICT` chỉ kích hoạt khi có `DELETE` thật, nên **nó không bao giờ chạy trong luồng nghiệp vụ**. Nó chỉ có giá trị như lớp chặn cho thao tác xóa cứng ngoài luồng (script dọn dữ liệu, thao tác tay trên DB).

**Hệ quả**: kiểm tra đếm món ở tầng service (D7) là **guard duy nhất** thực thi FR-015. Không được nới lỏng test của nó với lý do "đã có DB chặn".

**Down migration**: tạo lại `fnb_category_enum` và cột `category` với toàn bộ giá trị `NULL`, drop `category_id` và bảng `menu_categories`. Rollback **không** khôi phục được phân loại cũ — đây là hệ quả không tránh được của việc bỏ dữ liệu, cần ghi rõ trong PR.

**Alternatives rejected**:
- *Giữ cột `category` cũ để rollback được* — mâu thuẫn quyết định nghiệp vụ, và cột chết sẽ tồn tại vô thời hạn.
- *Map dữ liệu cũ sang 6 danh mục mặc định cho mỗi chi nhánh* — đã bị người dùng bác bỏ tường minh ("tự tạo lại từ đầu").

---

## D3 — Ràng buộc trùng tên phải bỏ qua bản ghi đã xóa

**Decision**: Partial unique index:
```sql
CREATE UNIQUE INDEX "UQ_menu_categories_cafe_name"
  ON "menu_categories" (cafe_id, lower(btrim(name)))
  WHERE deleted_at IS NULL;
```

**Rationale**: Đây là điểm nối trực tiếp giữa hai quyết định trong phiên clarify. Xóa mềm (`deleted_at`) + unique index thường sẽ khiến Provider **không tạo lại được** danh mục vừa xóa cùng tên — vi phạm FR-006 và acceptance scenario US1-8. Mệnh đề `WHERE deleted_at IS NULL` giải quyết triệt để. `lower(btrim(...))` thực thi luôn quy tắc so sánh không phân biệt hoa/thường và bỏ khoảng trắng thừa.

**Alternatives rejected**:
- *Chỉ kiểm tra trùng ở tầng service* — thua race condition khi hai request đồng thời; DB phải là chốt cuối.
- *Xóa cứng* — làm unique index đơn giản hơn nhưng vi phạm quy ước `deleted_at` bắt buộc cho mọi entity trong `.specify/memory/constitution.md` (mục Naming) và `CLAUDE.md`.

---

## D4 — Thứ tự hiển thị bằng số nguyên, gán lại toàn bộ khi sắp xếp

**Decision**: Cột `display_order INT NOT NULL DEFAULT 0`. Sắp xếp đọc theo `(display_order ASC, created_at ASC)`. Endpoint sắp xếp nhận **mảng đầy đủ id theo thứ tự mong muốn**, gán lại `0..N-1` trong một transaction.

**Rationale**: Tối đa 30 danh mục mỗi chi nhánh (FR-008) nên ghi lại toàn bộ là không đáng kể và loại bỏ hoàn toàn nguy cơ lệch thứ tự do cập nhật từng phần. `created_at` làm tiêu chí phụ giữ thứ tự ổn định khi nhiều danh mục cùng `display_order` (ví dụ tất cả đều mặc định 0).

Danh mục mới tạo nhận `display_order = (max hiện tại) + 1` để rơi xuống cuối, khớp Assumption trong spec.

**Alternatives rejected**:
- *Fractional ordering (số thực chèn giữa)* — giải pháp cho danh sách hàng nghìn phần tử; thừa cho ≤30 và sinh lỗi tích lũy dấu phẩy động.
- *Linked list (`prev_id`/`next_id`)* — phức tạp hơn nhiều lần, không có lợi ích ở quy mô này.

---

## D5 — Hình dạng dữ liệu trả về: thay `category` bằng `categoryId` + `categoryName`

*(Đây là hạng mục được đánh dấu Deferred ở phiên `/speckit-clarify`, nay chốt tại đây.)*

**Decision**: `MenuItem` trả về **bỏ** trường `category`, thêm `categoryId: string | null` và `categoryName: string | null`.

**Rationale**: Frontend là consumer duy nhất của endpoint này (`rcfield-fe/src/features/menu/api/menu.api.ts`) và được sửa trong cùng PR — không có bên thứ ba nào tiêu thụ hợp đồng này. Cần cả hai trường vì chúng phục vụ hai việc khác nhau: `categoryId` để lọc và để form chọn đúng giá trị, `categoryName` để hiển thị mà không phải tải thêm danh sách danh mục rồi tự map. Trả `categoryName` sẵn cũng khiến việc sửa `FnbStep.tsx` và `CafeFnbSection.tsx` chỉ là đổi tên trường, không phải thêm query mới.

**Alternatives rejected**:
- *Giữ tên trường `category` nhưng đổi giá trị thành tên danh mục* — nhìn thì "backward compatible" nhưng thực chất là bẫy: `FnbStep`/`CafeFnbSection` sẽ hiển thị đúng mà không cần sửa gì, nên lỗi hiện mã thô có vẻ tự khỏi, trong khi bộ lọc ở `ProviderMenuPage` vẫn cần id và sẽ âm thầm sai. Một trường mang hai ngữ nghĩa là nguồn lỗi lâu dài.
- *Trả về object lồng `category: { id, name }`* — sạch về mặt mô hình nhưng buộc mọi chỗ hiển thị phải xử lý optional chaining hai tầng; hai trường phẳng đọc dễ hơn ở tầng UI.

---

## D6 — Tham số lọc theo danh mục

**Decision**: `MenuListQuerySchema.category_id` nhận **uuid** hoặc chuỗi literal `none`. `none` nghĩa là chỉ lấy món chưa phân loại. Bỏ hẳn tham số `category` cũ.

**Rationale**: Màn hình quản lý cần lọc được đúng nhóm "Chưa phân loại" để Provider tìm và gán lại món sau khi chuyển đổi — đây là thao tác chính họ phải làm ngay sau khi triển khai (FR-025 khiến toàn bộ món rơi vào nhóm này). Nếu chỉ nhận uuid thì không có cách nào biểu diễn "chưa phân loại".

---

## D7 — Chặn xóa: đếm ở service, chặn cứng ở DB

**Decision**: Service đếm `menu_items WHERE category_id = :id AND deleted_at IS NULL` (**không** lọc `is_available`, theo FR-015 — món tạm ngưng bán vẫn tính). Nếu `> 0` → `AppError('...', 409, 'CATEGORY_NOT_EMPTY')` kèm số lượng trong thông báo.

**Đây là guard duy nhất.** `ON DELETE RESTRICT` trên khóa ngoại **không** hỗ trợ gì ở đây vì xóa danh mục là `UPDATE` xóa mềm chứ không phải `DELETE` (xem cảnh báo ở D2). Toàn bộ trọng trách thực thi FR-015 nằm ở đoạn đếm này, nên nó cần được phủ test kỹ (T014).

**Rationale**: Mã 409 Conflict đúng ngữ nghĩa hơn 400 — yêu cầu hợp lệ về cú pháp nhưng xung đột với trạng thái hiện tại của tài nguyên. Trả kèm số lượng để FE dựng đúng thông báo mà không phải gọi thêm request đếm.

---

## D8 — Vị trí route và một cái bẫy thứ tự đăng ký

**Decision**:
- `GET /v1/cafes/:cafeId/menu/categories` — gắn vào `cafe.routes.ts` với `optionalAuthenticate`, giống hệt cách `GET .../menu` đang làm (công khai cho khách xem menu).
- `POST | PATCH | DELETE | PATCH /reorder` — gắn vào `menuRouter` sẵn có, thừa hưởng `authenticate + authorize(PROVIDER) + requireActiveProvider` đã khai báo ở `menu.routes.ts:8`.

**⚠️ Bẫy phải tránh**: `menuRouter` hiện có `patch('/:itemId')` và `delete('/:itemId')`. Nếu đăng ký route categories **sau** chúng, Express sẽ khớp `/categories/abc` vào `/:itemId` với `itemId = "categories"` và trả lỗi UUID không hợp lệ. Route categories **bắt buộc** đăng ký trước `/:itemId` — đúng như `/combos` đang được đặt trước ở `menu.routes.ts:10-11`.

---

## D9 — Không thêm kiểm tra subscription cho danh mục

**Decision**: Không gọi `assertSubscriptionActive` trong service danh mục.

**Rationale**: `docs/developer/provider-subscription-enforcement.md` yêu cầu mọi write operation của Provider phải tự kiểm tra subscription, nhưng đã xác minh: **các endpoint menu item hiện tại không hề kiểm tra** — `createMenuItem`/`updateMenuItem`/`deleteMenuItem` chỉ gọi `getManagedCafeOrThrow`. Ngoài ra helper `assertSubscriptionActive` **chưa tồn tại trong codebase** (tài liệu ghi "Thêm function này khi cần dùng lần đầu").

Thêm kiểm tra cho riêng danh mục sẽ tạo ra hành vi vô lý: Provider hết hạn gói vẫn sửa/xóa được món nhưng không đổi tên được danh mục. Đây là **khoảng trống có sẵn của cả module menu**, nên xử lý một lần cho toàn module ở một PR riêng, không vá lệch trong PR này.

**Ghi nhận nợ kỹ thuật**: module menu (item + combo + category) chưa enforce subscription — cần một task riêng.

---

## D10 — Quyền ADMIN: giữ nguyên hiện trạng PROVIDER-only

**Decision**: Endpoint ghi danh mục chỉ mở cho `PROVIDER`, không mở cho `ADMIN`.

**Rationale**: `menu.routes.ts:8` hiện là `authorize(UserRole.PROVIDER)` — ADMIN **không** ghi được menu item. Trong khi đó `menu.service.ts:102` lại có nhánh `viewer?.role === UserRole.ADMIN` cho `canManage`, nhưng nhánh này chỉ với tới được ở đường đọc (`listMenuItems` qua route `optionalAuthenticate`); ở đường ghi nó là code không bao giờ chạy. Mở ADMIN cho riêng danh mục sẽ lệch với phần còn lại của module.

**⚠️ Sai lệch với spec**: FR-009 viết *"chỉ cho phép Provider sở hữu chi nhánh (và ADMIN) quản lý danh mục"*. Phần "(và ADMIN)" **không khớp** hiện trạng. Đã sửa FR-009 trong spec để phản ánh đúng phạm vi triển khai, kèm ghi chú rằng việc mở quyền ADMIN cho cả module menu là hạng mục riêng.

---

## D11 — Dữ liệu seed và bộ kiểm thử phải sửa cùng PR

**Decision**: Sửa `seed-cafes.ts` để tạo danh mục trước rồi gán `category_id`; sửa helper `createMenuItem` trong `menu.test.ts` để bỏ cột `category`.

**Rationale**: Cả hai đang ghi thẳng giá trị enum dạng chuỗi và sẽ vỡ ngay khi cột bị drop:
- `seed-cafes.ts:872` — `INSERT INTO menu_items (..., category, ...)` với giá trị `'DRINK'`/`'SNACK'` (12+ chỗ, dòng 416-477).
- `menu.test.ts:42` — cùng kiểu INSERT với `category: 'DRINK'`.

Đây là rủi ro đã được nêu ở checklist của spec; nay xác nhận đúng và đã đưa vào danh sách file phải sửa.

Riêng seed: vì seed tạo dữ liệu demo, việc tạo sẵn vài danh mục ("Đồ uống", "Ăn vặt") cho cafe seed **không** vi phạm quyết định "không migrate data cũ" — quyết định đó nói về migration trên dữ liệu thật, còn seed là dữ liệu dựng mới.

---

## Tổng hợp rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Route `/categories` bị `/:itemId` nuốt | **Cao** | Đăng ký trước `/:itemId` (D8); test tích hợp cho cả 4 method |
| Rollback không khôi phục được phân loại cũ | Trung bình | Ghi rõ trong mô tả PR; là hệ quả đã được chấp nhận |
| Unique index chặn tạo lại tên đã xóa | **Cao** | Partial index `WHERE deleted_at IS NULL` (D3); có test riêng cho US1-8 |
| Seed/test vỡ khi drop cột | **Cao** | Sửa cùng PR (D11); chạy `npm test` + seed lại trước khi merge |
| Sau triển khai toàn bộ menu về "Chưa phân loại" | Trung bình | Đã chấp nhận; bộ lọc `category_id=none` (D6) giúp Provider gán lại nhanh |
| Module menu không enforce subscription | Thấp | Ghi nhận nợ kỹ thuật (D9), không xử lý trong PR này |
