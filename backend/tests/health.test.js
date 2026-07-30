const request = require('supertest');
const app = require('../src/app');

describe('GET /api/health', () => {
  it('responds 200 with an ok status payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(['ready', 'unavailable']).toContain(res.body.firebase);
  });
});
