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

// config/env.js is a singleton computed once at require-time from real
// .env/.env.local — deleting process.env.* in beforeEach has no effect on
// its already-cached values. Mock the module directly so this test
// genuinely exercises the "no AI provider configured" path instead of
// making a real network call. (Anthropic was removed entirely — OpenRouter
// and Gemini are the only two providers left to blank out.)
jest.mock('../src/config/env', () => ({
  ...jest.requireActual('../src/config/env'),
  OPENROUTER_API_KEY: '',
  GEMINI_API_KEY: '',
}));

const firebaseConfig = require('../src/config/firebase');
const app = require('../src/app');

describe('POST /api/ai/setup-concierge — no AI provider configured', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });
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
