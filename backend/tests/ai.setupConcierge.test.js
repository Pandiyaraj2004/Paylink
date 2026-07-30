const request = require('supertest');

jest.mock('../src/config/firebase', () => {
  const verifyIdToken = jest.fn();
  return {
    admin: {
      auth: () => ({ verifyIdToken }),
      firestore: jest.fn(),
    },
    isFirebaseReady: () => true,
    initError: () => null,
    __verifyIdToken: verifyIdToken,
  };
});

const firebaseConfig = require('../src/config/firebase');
const app = require('../src/app');

describe('POST /api/ai/setup-concierge — no ANTHROPIC_API_KEY configured', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });
  });

  afterAll(() => {
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('returns a clean 503 AI_UNAVAILABLE without crashing', async () => {
    const res = await request(app)
      .post('/api/ai/setup-concierge')
      .set('Authorization', 'Bearer faketoken')
      .send({ message: "I'm a tailor, shirt stitching is 15 euros." });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    expect(res.body.error).toHaveProperty('correlationId');
    expect(res.body.error.message).not.toMatch(/at Object|\.js:\d+/); // no stack trace leak
  });
});
