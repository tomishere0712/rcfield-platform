import request from 'supertest';
import { app } from '../../app';

describe('GET /api/v1/health', () => {
  it('trả về 200 và message', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('RCField API is running');
  });
});
