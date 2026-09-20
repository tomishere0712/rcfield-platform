# RCField NLU Service

Dịch vụ phân loại intent cho chat widget. Nhận tin nhắn tiếng Việt, trả về intent để BE routing đúng hướng xử lý.

Dùng **semantic prototypes** (sentence-transformers MiniLM multilingual) thay vì keyword matching — tự handle paraphrase, gõ không dấu, tiếng Anh lẫn Việt.

## Intents

| Intent | Ví dụ | Xử lý tiếp theo |
|--------|-------|-----------------|
| `greeting` | "xin chào", "hello", "bạn ơi" | Trả greeting message từ widget config |
| `slot_check` | "còn chỗ không hôm nay", "đặt lịch thứ 7" | Query DB bookings |
| `rag_query` | Mọi câu hỏi khác | Gọi Gemini + pgvector RAG |

## Setup lần đầu (bắt buộc)

Chạy **một lần duy nhất** sau khi clone repo:

```bash
# Từ thư mục rcfeild-be/
npm run nlu:install
```

Lệnh này sẽ:
1. Tạo virtualenv tại `nlu-service/.venv/`
2. Cài dependencies từ `requirements.txt`
3. Download model `paraphrase-multilingual-MiniLM-L12-v2` (~470MB) — chỉ lần đầu

> Lần đầu mất 3–5 phút tuỳ tốc độ mạng. Từ lần 2 trở đi `npm run nlu` khởi động ngay lập tức.

## Chạy hàng ngày

```bash
# Từ thư mục rcfeild-be/
npm run nlu
```

Service chạy tại `http://localhost:8000`. BE (port 3000) gọi NLU tự động.

## Kiểm tra hoạt động

```bash
curl http://localhost:8000/health
# {"status":"ok","intents_loaded":2}
```

## Test thử

```bash
# greeting
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "xin chào bạn"}'
# {"intent":"greeting","confidence":0.82,"needs_llm_fallback":false}

# slot_check (có dấu)
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "cuối tuần còn chỗ không?"}'
# {"intent":"slot_check","confidence":0.79,"needs_llm_fallback":false}

# slot_check (không dấu — dual-pass tự restore)
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "con cho khong hom nay"}'
# {"intent":"slot_check","confidence":0.71,"needs_llm_fallback":false}

# rag_query (fallback)
curl -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "xe drift loại nào phù hợp cho người mới?"}'
# {"intent":"rag_query","confidence":0.31,"needs_llm_fallback":true}
```

## Thêm / sửa intent

Sửa `intents/rcfield.json` — thêm **câu ví dụ** vào `examples` (không phải keywords):

```json
{
  "intents": [
    {
      "name": "slot_check",
      "examples": [
        "còn chỗ không",
        "muốn đặt lịch chơi xe",
        "thứ 7 có slot trống không",
        "thêm câu ví dụ của bạn ở đây"
      ]
    }
  ]
}
```

Lưu file → service tự reload (do `--reload`). Prototype vector được tính lại từ examples mới.

> **Lưu ý**: Câu ví dụ là semantic training data — càng đa dạng càng tốt. Không cần cover hết mọi cách nói, model tự generalize.

## Cơ chế phân loại

```
message
  │
  ├── Pass A: embed raw text → cosine similarity vs prototype vectors
  ├── Pass B: nếu không dấu → khôi phục dấu → embed lại
  │           lấy max(Pass A, Pass B) per intent
  │
  ├── Keyword signal boost (non-destructive, +0.10)
  │
  └── Rank → top1 / margin / confidence threshold
              confidence < 0.35 → fallback rag_query
              margin < 0.08    → needs_llm_fallback = true
```

Latency: ~10–30ms (CPU, sau khi model đã load).

## Chạy bằng Docker

```bash
docker compose up nlu-service
```

Model được download tại build time (`Dockerfile`) nên container start ngay.
