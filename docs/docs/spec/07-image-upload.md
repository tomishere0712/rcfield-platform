# Image Upload Spec

Tài liệu này mô tả cách upload hình ảnh dùng chung trong RCField. Mục tiêu là để các tính năng như avatar profile, ảnh cafe, ảnh xe, ảnh menu hoặc các module sau này có thể tái sử dụng cùng một luồng upload mà không làm ảnh hưởng lẫn nhau.

## 1. Nguyên tắc chung

- Frontend không upload trực tiếp lên Cloudinary.
- Frontend gửi file lên Backend.
- Backend là nơi duy nhất giữ `CLOUDINARY_API_SECRET` và gọi Cloudinary SDK.
- Mỗi tính năng phải truyền `usage` riêng để ảnh được tách folder rõ ràng.
- Không sửa endpoint upload dùng chung nếu chỉ cần thay đổi logic nghiệp vụ của một tính năng cụ thể.
- Không lưu `publicId` vào bảng nghiệp vụ nếu chưa cần xoá ảnh sau này; nếu tính năng cần xoá ảnh khỏi Cloudinary thì phải lưu `publicId`.

## 2. Cấu hình môi trường

Chỉ Backend cần Cloudinary env. Không thêm Cloudinary secret vào Frontend.

File:

```text
rcfield-be/.env
```

Cần có:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Frontend chỉ cần API URL:

```env
VITE_API_URL=http://localhost:3000/api
```

## 3. Endpoint upload dùng chung

Endpoint:

```http
POST /api/v1/uploads/images
```

Yêu cầu:

- Có Bearer token.
- Body là `multipart/form-data`.
- Field file tên là `file`.
- Field optional `usage` để phân loại nơi dùng ảnh.

Ví dụ form-data:

```text
file: avatar.png
usage: profile-avatar
```

Response thành công:

```json
{
  "success": true,
  "data": {
    "publicId": "rcfield/uploads/profile-avatar/<userId>/profile-avatar-...",
    "url": "https://res.cloudinary.com/.../image/upload/..."
  }
}
```

File hợp lệ:

- JPG / JPEG
- PNG
- WEBP

Giới hạn hiện tại:

```text
5MB / file
```

## 4. Quy ước `usage`

`usage` giúp Backend upload vào folder riêng:

```text
rcfield/uploads/<usage>/<userId>
```

Nên đặt `usage` rõ nghĩa, viết dạng kebab-case:

```text
profile-avatar
cafe-cover
cafe-gallery
vehicle-gallery
menu-item
payment-proof
inspection-evidence
```

Không dùng `usage` quá chung như:

```text
image
upload
test
```

Vì sau này rất khó quản lý và xoá ảnh.

## 5. Luồng upload profile avatar

Frontend:

1. User chọn ảnh ở trang profile.
2. FE gọi:

```ts
uploadImage(file, "profile-avatar")
```

3. Backend upload ảnh lên Cloudinary.
4. Backend trả về `url`.
5. FE gọi:

```http
PATCH /api/v1/auth/me
```

với:

```json
{
  "avatar_url": "https://res.cloudinary.com/..."
}
```

6. FE cập nhật auth store và local/session storage để header đổi avatar ngay.

## 6. Profile API

Lấy profile hiện tại:

```http
GET /api/v1/auth/me
```

Cập nhật profile:

```http
PATCH /api/v1/auth/me
```

Body hỗ trợ:

```json
{
  "full_name": "Nguyen Van A",
  "phone": "0900000000",
  "avatar_url": "https://res.cloudinary.com/..."
}
```

Các field đều optional, nhưng request phải có ít nhất một field.

## 7. Khi thêm tính năng upload mới

Nếu tính năng chỉ cần upload ảnh và lưu URL:

1. Dùng lại FE helper:

```ts
uploadImage(file, "<usage>")
```

2. Lưu `url` vào API nghiệp vụ riêng của tính năng đó.
3. Không tạo endpoint upload mới nếu không có yêu cầu đặc biệt.

Nếu tính năng cần quản lý nhiều ảnh hoặc cần xoá ảnh:

1. Lưu cả `url` và `publicId`.
2. Khi xoá record nghiệp vụ, gọi Backend xoá ảnh Cloudinary bằng `publicId`.
3. Không tự parse URL ở Frontend để lấy public ID.

Ví dụ tính năng gallery cafe hiện có luồng riêng vì cần lưu từng ảnh vào bảng `cafe_images` và hỗ trợ xoá ảnh:

```http
POST /api/v1/cafes/:cafeId/images
DELETE /api/v1/cafe-images/:id
```

Không thay thế luồng gallery cafe bằng endpoint upload chung nếu chưa cập nhật đầy đủ phần lưu DB và xoá ảnh.

## 8. Những việc không nên làm

- Không đặt `CLOUDINARY_API_SECRET` trong `rcfield-fe/.env`.
- Không gọi Cloudinary SDK trực tiếp từ Frontend.
- Không hard-code Cloudinary URL vào code.
- Không dùng chung một `usage` cho nhiều nghiệp vụ khác nhau.
- Không sửa `cloudinary.service.ts` theo nhu cầu riêng của một feature nếu thay đổi đó có thể ảnh hưởng feature khác.
- Không xoá ảnh Cloudinary chỉ dựa trên URL từ client nếu Backend đã có `publicId`.

## 9. File liên quan

Backend:

```text
rcfield-be/src/services/cloudinary.service.ts
rcfield-be/src/controllers/upload.controller.ts
rcfield-be/src/routes/upload.routes.ts
rcfield-be/src/controllers/auth.controller.ts
rcfield-be/src/services/auth.service.ts
rcfield-be/src/models/user.entity.ts
rcfield-be/src/migrations/1749254400000-AddUserAvatarUrl.ts
```

Frontend:

```text
rcfield-fe/src/features/uploads/api/upload.api.ts
rcfield-fe/src/features/auth/api/auth.api.ts
rcfield-fe/src/features/auth/stores/auth.store.ts
rcfield-fe/src/pages/profile/ProfilePage.tsx
```

## 10. Checklist khi upload lỗi

1. Backend `.env` đã có đủ Cloudinary chưa?
2. Đã restart Backend sau khi sửa `.env` chưa?
3. Frontend có `VITE_API_URL=http://localhost:3000/api` chưa?
4. Request upload có Bearer token chưa?
5. Field file có tên đúng là `file` chưa?
6. File có đúng định dạng JPG, PNG, WEBP và nhỏ hơn 5MB chưa?
7. Nếu upload được nhưng lưu profile lỗi, đã chạy migration thêm `avatar_url` chưa?

Chạy migration:

```powershell
cd rcfield-be
npm run migration:run
```
