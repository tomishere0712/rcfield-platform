import request from 'supertest';
import { app } from '../../app';
import { AppDataSource } from '../../config/database';
import { createTestCafe, createTestUser, generateToken } from '../helpers';
import { UserRole } from '../../types';

// jest.mock hoisting requires require() to access mock handles after factory runs
const geminiMocks = () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@google/genai') as {
    __mockGenerateContent: jest.Mock;
  };

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClassifyIntent = jest.fn();
jest.mock('../../config/nlu', () => ({
  classifyIntent: (...args: unknown[]) => mockClassifyIntent(...args),
}));

jest.mock('../../services/rag-cache', () => ({
  ragCache: { get: jest.fn().mockReturnValue(null), set: jest.fn(), clear: jest.fn() },
}));

jest.mock('@google/genai', () => {
  const generateContent = jest.fn();
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent,
      },
    })),
    __mockGenerateContent: generateContent,
    Type: {
      TYPE_UNSPECIFIED: 'TYPE_UNSPECIFIED',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY',
      OBJECT: 'OBJECT',
      NULL: 'NULL',
    },
  };
});

jest.mock('../../services/kb.service', () => ({
  kbService: {
    embedText: jest.fn().mockResolvedValue(new Array(3072).fill(0.1)),
    retrieveChunks: jest.fn().mockResolvedValue(['nội dung KB test']),
    parseFile: jest.fn(),
    chunkText: jest.fn(),
    embedAndStore: jest.fn(),
  },
}));

const mockGetWidgetConfigForCafe = jest.fn();
jest.mock('../../services/chat.service', () => {
  const original = jest.requireActual('../../services/chat.service');
  return {
    ...original,
    getWidgetConfigForCafe: (cafeId: string) => mockGetWidgetConfigForCafe(cafeId),
  };
});

beforeEach(() => {
  const original = jest.requireActual('../../services/chat.service');
  mockGetWidgetConfigForCafe.mockImplementation((id: string) =>
    original.getWidgetConfigForCafe(id),
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enableAiChat(cafeId: string) {
  const [cafe] = await AppDataSource.query<{ provider_id: string }[]>(
    `SELECT provider_id FROM cafes WHERE id = $1`,
    [cafeId],
  );
  const [plan] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM subscription_plans WHERE name = 'TRIAL' LIMIT 1`,
  );

  if (cafe && plan) {
    await AppDataSource.query(
      `INSERT INTO provider_subscriptions
         (provider_id, plan_id, status, started_at, expires_at, ai_quota_reset_at)
       VALUES ($1, $2, 'TRIAL', now(), now() + interval '30 days', now() + interval '30 days')`,
      [cafe.provider_id, plan.id],
    );
  }

  await AppDataSource.query(
    `INSERT INTO feature_flags (feature_key, display_name, entity_type, entity_id, is_enabled, config)
     VALUES ('AI_CHATBOT', 'AI Chatbot', 'CAFE', $1, true, $2::jsonb)
     ON CONFLICT (feature_key, entity_id) WHERE entity_id IS NOT NULL
     DO UPDATE SET is_enabled = true, config = EXCLUDED.config`,
    [cafeId, JSON.stringify({ monthly_quota: 100, used_this_month: 0 })],
  );
}

// ── POST /chat ────────────────────────────────────────────────────────────────

describe('POST /api/v1/cafes/:cafeId/chat', () => {
  let cafeId: string;

  beforeEach(async () => {
    const cafe = await createTestCafe();
    cafeId = cafe.id;

    mockClassifyIntent.mockResolvedValue({
      intent: 'rag_query',
      confidence: 0,
      needs_llm_fallback: false,
    });
    geminiMocks().__mockGenerateContent.mockResolvedValue({
      text: 'Test answer.',
    });
  });

  it('thiếu message → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post(`/api/v1/cafes/${cafeId}/chat`).send({ history: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('AI chưa bật → 503 AI_DISABLED', async () => {
    const res = await request(app)
      .post(`/api/v1/cafes/${cafeId}/chat`)
      .send({ message: 'xin chào', history: [] });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_DISABLED');
  });

  it('greeting → 200, response_type=greeting, không gọi Gemini', async () => {
    await enableAiChat(cafeId);
    mockClassifyIntent.mockResolvedValue({
      intent: 'greeting',
      confidence: 0.9,
      needs_llm_fallback: false,
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafeId}/chat`)
      .send({ message: 'xin chào', history: [] });

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe('greeting');
    expect(res.body.answer).toBeDefined();
    expect(geminiMocks().__mockGenerateContent).not.toHaveBeenCalled();
  });

  it('thanks → 200, response_type=thanks, không gọi Gemini', async () => {
    await enableAiChat(cafeId);
    mockClassifyIntent.mockResolvedValue({
      intent: 'thanks',
      confidence: 0.85,
      needs_llm_fallback: false,
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafeId}/chat`)
      .send({ message: 'cảm ơn', history: [] });

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe('thanks');
    expect(geminiMocks().__mockGenerateContent).not.toHaveBeenCalled();
  });

  it('farewell → 200, response_type=farewell, không gọi Gemini', async () => {
    await enableAiChat(cafeId);
    mockClassifyIntent.mockResolvedValue({
      intent: 'farewell',
      confidence: 0.88,
      needs_llm_fallback: false,
    });

    const res = await request(app)
      .post(`/api/v1/cafes/${cafeId}/chat`)
      .send({ message: 'tạm biệt', history: [] });

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe('farewell');
    expect(geminiMocks().__mockGenerateContent).not.toHaveBeenCalled();
  });

  it('RAG → 200, gọi Gemini, trả answer + response_type=text', async () => {
    await enableAiChat(cafeId);

    const res = await request(app)
      .post(`/api/v1/cafes/${cafeId}/chat`)
      .send({ message: 'nội quy sân là gì', history: [] });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('Test answer.');
    expect(res.body.response_type).toBe('text');
    expect(geminiMocks().__mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});

// ── GET /chat/config ──────────────────────────────────────────────────────────

describe('GET /api/v1/cafes/:cafeId/chat/config', () => {
  it('chưa có config → 200 default config', async () => {
    mockGetWidgetConfigForCafe.mockResolvedValueOnce(null);
    const cafe = await createTestCafe();
    const res = await request(app).get(`/api/v1/cafes/${cafe.id}/chat/config`);

    expect(res.status).toBe(200);
    expect(res.body.is_default).toBe(true);
    expect(res.body.greeting_message).toBeDefined();
    expect(res.body.position).toBeDefined();
  });
});

// ── PUT /chat/config ──────────────────────────────────────────────────────────

describe('PUT /api/v1/cafes/:cafeId/chat/config', () => {
  it('không có auth → 401', async () => {
    const cafe = await createTestCafe();
    const res = await request(app)
      .put(`/api/v1/cafes/${cafe.id}/chat/config`)
      .send({ greeting_message: 'Hello!' });

    expect(res.status).toBe(401);
  });

  it('không phải owner → 403 FORBIDDEN', async () => {
    const cafe = await createTestCafe();
    const other = await createTestUser({ role: UserRole.PROVIDER });
    const token = generateToken(other);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe.id}/chat/config`)
      .set('Authorization', `Bearer ${token}`)
      .send({ greeting_message: 'Hello!' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('owner cập nhật config → 200, trả config mới', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);

    const res = await request(app)
      .put(`/api/v1/cafes/${cafe.id}/chat/config`)
      .set('Authorization', `Bearer ${token}`)
      .send({ greeting_message: 'Chào mừng đến RC Arena!', primary_color: '#FF0000' });

    expect(res.status).toBe(200);
    expect(res.body.greeting_message).toBe('Chào mừng đến RC Arena!');
    expect(res.body.primary_color).toBe('#FF0000');
    expect(res.body.is_default).toBe(false);
  });
});

// ── GET /kb/documents ─────────────────────────────────────────────────────────

describe('GET /api/v1/cafes/:cafeId/kb/documents', () => {
  it('không có auth → 401', async () => {
    const cafe = await createTestCafe();
    const res = await request(app).get(`/api/v1/cafes/${cafe.id}/kb/documents`);
    expect(res.status).toBe(401);
  });

  it('chưa có tài liệu → 200 data rỗng', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);

    const res = await request(app)
      .get(`/api/v1/cafes/${cafe.id}/kb/documents`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ── DELETE /kb/documents/:documentId ─────────────────────────────────────────

describe('DELETE /api/v1/cafes/:cafeId/kb/documents/:documentId', () => {
  it('document không tồn tại → 404', async () => {
    const provider = await createTestUser({ role: UserRole.PROVIDER });
    const cafe = await createTestCafe({ provider_id: provider.id });
    const token = generateToken(provider);

    const res = await request(app)
      .delete(`/api/v1/cafes/${cafe.id}/kb/documents/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
