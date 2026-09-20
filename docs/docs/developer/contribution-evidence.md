---
id: contribution-evidence
title: Minh chứng đóng góp theo thành viên
sidebar_label: Minh chứng đóng góp
---

# Minh chứng đóng góp — trích từ lịch sử git

Khoảng thời gian: **13/05/2026 → 15/08/2026** (14 tuần). Tổng **717 commit** trên hai kho mã nguồn (backend và frontend).

> Số liệu sinh tự động từ `git log --all --no-merges --numstat` của kho backend và kho frontend, không nhập tay. Commit gộp nhánh (merge) không tính để tránh đếm trùng. Kho tài liệu không nằm trong thống kê này.

## 1. Tổng hợp theo thành viên

| Thành viên | Commit | Tuần có commit | Commit đầu | Commit cuối |
|---|---:|---:|---|---|
| Bùi Trọng Trí | 211 | 14/14 | 2026-05-13 | 2026-08-15 |
| Huỳnh Hữu Toàn | 204 | 11/14 | 2026-05-16 | 2026-07-31 |
| Nguyễn Vĩnh Phúc | 155 | 12/14 | 2026-05-23 | 2026-08-14 |
| Thanh Tùng | 147 | 12/14 | 2026-05-23 | 2026-08-12 |

## 2. Phân bổ theo kho

| Thành viên | Backend | Frontend |
|---|---:|---:|
| Bùi Trọng Trí | 89 | 122 |
| Huỳnh Hữu Toàn | 88 | 116 |
| Nguyễn Vĩnh Phúc | 72 | 83 |
| Thanh Tùng | 57 | 90 |

## 3. Commit theo từng tuần

| Tuần | Từ ngày | Bùi Trọng Trí | Huỳnh Hữu Toàn | Nguyễn Vĩnh Phúc | Thanh Tùng | Tổng |
|---|---|---:|---:|---:|---:|---:|
| 1 | 11/05 | 10 | 1 | 0 | 0 | 11 |
| 2 | 18/05 | 8 | 20 | 2 | 3 | 33 |
| 3 | 25/05 | 17 | 14 | 3 | 21 | 55 |
| 4 | 01/06 | 14 | 4 | 7 | 12 | 37 |
| 5 | 08/06 | 24 | 11 | 1 | 14 | 50 |
| 6 | 15/06 | 15 | 3 | 9 | 7 | 34 |
| 7 | 22/06 | 19 | 29 | 17 | 14 | 79 |
| 8 | 29/06 | 9 | 0 | 0 | 0 | 9 |
| 9 | 06/07 | 17 | 12 | 10 | 1 | 40 |
| 10 | 13/07 | 6 | 68 | 56 | 4 | 134 |
| 11 | 20/07 | 13 | 16 | 11 | 16 | 56 |
| 12 | 27/07 | 6 | 26 | 13 | 26 | 71 |
| 13 | 03/08 | 21 | 0 | 19 | 17 | 57 |
| 14 | 10/08 | 32 | 0 | 7 | 12 | 51 |

## 4. Mảng công việc chính của từng người

Suy ra từ đường dẫn file mà mỗi người sửa nhiều nhất — dùng để đối chiếu với bảng phân công, không thay thế bảng phân công.

**Bùi Trọng Trí**

- `FE/pages/provider` — 228 lượt sửa file
- `BE/services` — 210 lượt sửa file
- `FE/pages/customer` — 114 lượt sửa file
- `FE/pages/booking` — 95 lượt sửa file
- `BE/controllers` — 86 lượt sửa file
- `BE/routes` — 86 lượt sửa file
- `BE/__tests__` — 77 lượt sửa file
- `BE/models` — 73 lượt sửa file

**Huỳnh Hữu Toàn**

- `FE/pages/customer` — 197 lượt sửa file
- `FE/features/contests` — 197 lượt sửa file
- `FE/pages/provider` — 153 lượt sửa file
- `BE/services` — 133 lượt sửa file
- `FE/pages/public` — 105 lượt sửa file
- `BE/__tests__` — 61 lượt sửa file
- `BE/routes` — 56 lượt sửa file
- `BE/models` — 54 lượt sửa file

**Nguyễn Vĩnh Phúc**

- `FE/pages/provider` — 129 lượt sửa file
- `FE/pages/staff` — 82 lượt sửa file
- `FE/pages/customer` — 67 lượt sửa file
- `BE/services` — 59 lượt sửa file
- `BE/__tests__` — 49 lượt sửa file
- `FE/pages/booking` — 38 lượt sửa file
- `BE/controllers` — 34 lượt sửa file
- `BE/models` — 28 lượt sửa file

**Thanh Tùng**

- `FE/pages/provider` — 137 lượt sửa file
- `BE/services` — 62 lượt sửa file
- `BE/controllers` — 30 lượt sửa file
- `BE/routes` — 25 lượt sửa file
- `FE/pages/staff` — 25 lượt sửa file
- `FE/app/router` — 17 lượt sửa file
- `BE/validate` — 15 lượt sửa file
- `BE/migrations` — 13 lượt sửa file

## 5. Cách hội đồng tự kiểm chứng

```bash
# Số commit theo người, toàn bộ nhánh
git log --all --no-merges --format='%ae' | sort | uniq -c | sort -rn

# Nhật ký commit đầy đủ kèm ngày và tác giả
git log --all --no-merges --date=short --format='%ad %h %an — %s'

# Toàn bộ commit của một người
git log --all --no-merges --author='email@…' --date=short --format='%ad %h — %s'
```

