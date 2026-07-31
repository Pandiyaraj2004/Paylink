const request = require('supertest');

/**
 * POST /api/users/me/fcm-token (Phase 13, master-doc.md Section 27 push).
 * Registers the authenticated caller's own FCM device token. Mocks
 * user.repository.js directly, same pattern every other route test in this
 * suite uses for its own repository — no real push send happens here (that's
 * covered separately in tests/notification.push.test.js, which mocks
 * admin.messaging()).
 */

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

jest.mock('../src/repositories/user.repository', () => ({
  getUserById: jest.fn(),
  createUser: jest.fn(),
  addFcmToken: jest.fn(),
  removeFcmTokens: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const userRepository = require('../src/repositories/user.repository');
const app = require('../src/app');

describe('POST /api/users/me/fcm-token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });
  });

  it('returns 401 without a valid Authorization header', async () => {
    const res = await request(app).post('/api/users/me/fcm-token').send({ token: 'abc' });
    expect(res.status).toBe(401);
    expect(userRepository.addFcmToken).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when no token is provided', async () => {
    const res = await request(app)
      .post('/api/users/me/fcm-token')
      .set('Authorization', 'Bearer faketoken')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(userRepository.addFcmToken).not.toHaveBeenCalled();
  });

  it('registers the token against the caller\'s own uid, never a client-supplied id', async () => {
    userRepository.addFcmToken.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/users/me/fcm-token')
      .set('Authorization', 'Bearer faketoken')
      .send({ token: 'a-real-looking-fcm-token' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registered: true });
    expect(userRepository.addFcmToken).toHaveBeenCalledWith('user-1', 'a-real-looking-fcm-token');
  });
});
