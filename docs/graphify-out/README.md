# Graphify — Knowledge Graph của RCField Spec

Folder này chứa knowledge graph được build từ toàn bộ tài liệu và code trong repo.  
Claude Code dùng graph này để tìm đúng file cần đọc thay vì đọc hết mọi thứ mỗi lần.

---

## Nội dung folder

| File | Mô tả |
|------|-------|
| `graph.json` | Raw graph data — 180 nodes, 377 edges |
| `graph.html` | Interactive visualization — mở bằng browser |
| `GRAPH_REPORT.md` | Báo cáo tự động: god nodes, surprising connections, communities |
| `manifest.json` | Metadata về lần build gần nhất (ngày, số file, số node) |
| `cache/` | Cache extraction để build lại nhanh hơn |

---

## Tại sao cần graphify?

Không có graph, khi bạn hỏi Claude một câu về payment hay booking, Claude phải đọc hết 69 file (~52,000 từ) để tìm câu trả lời — tốn context window, dễ bỏ sót.

Với graph, Claude traverse theo node trước → chỉ đọc 4–5 file thực sự liên quan → nhanh hơn, chính xác hơn.

---

## Cách xem visualization

Mở `graph.html` bằng bất kỳ browser nào:

```bash
open graphify-out/graph.html
```

Các node được tô màu theo community. Click vào node để xem chi tiết và các edge kết nối.

---

## Cách query

### Query bằng Claude Code

Chỉ cần hỏi bình thường — Claude tự dùng graph nếu cần. Ví dụ:

```
"payment settlement hoạt động thế nào?"
"booking và session khác nhau ở điểm nào?"
"những bảng nào liên quan đến inspection?"
```

### Query trực tiếp bằng CLI

```bash
# BFS — tìm rộng, lấy nhiều context
graphify query "booking flow tables"

# DFS — đi sâu theo một hướng cụ thể
graphify query "payment settlement" --dfs

# Tìm đường ngắn nhất giữa 2 khái niệm
graphify path "Booking Entity" "PaymentEngine"

# Giải thích một node cụ thể
graphify explain "AppError"
```

---

## Cập nhật graph khi có file mới

Graph build lúc **2026-05-17**. Khi thêm file mới hoặc sửa nhiều tài liệu, cần rebuild:

```bash
# Incremental — chỉ re-extract file thay đổi (nhanh)
graphify update .

# Full rebuild từ đầu (chậm hơn, dùng khi cấu trúc thay đổi nhiều)
# Chạy lại /graphify trong Claude Code
```

---

## Kết quả build hiện tại

| Metric | Giá trị |
|--------|---------|
| Tổng file | 69 |
| Tổng từ | ~52,500 |
| Nodes | 180 |
| Edges | 377 |
| Communities | 10 |

**God nodes** (abstraction trung tâm, nhiều kết nối nhất):
- `AppError` — lớp lỗi chung, dùng ở middleware, service, test
- `InitialSchema1747180800000` — migration gốc, liên kết với toàn bộ schema
- `createTestUser()` / `createTestCafe()` — test helper dùng rộng rãi

**Communities lớn:**
- **Booking Entity** (44 nodes) — architecture docs, domain model, business rules
- **auth.test.ts** (26 nodes) — controller, routes, middleware, error codes
- **Feature 001: User Login** (7 nodes) — spec, plan, checklist, CLAUDE.md

---

## Lưu ý

- **Không commit** `graph.html` và `graph.json` nếu repo public — chúng chứa toàn bộ nội dung tài liệu dưới dạng đã index.
- File `cache/` có thể commit để tăng tốc rebuild cho team.
- Graph không tự cập nhật — phải chạy lại thủ công sau khi thêm tài liệu mới quan trọng.
