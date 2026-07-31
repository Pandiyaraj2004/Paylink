const request = require('supertest');

/**
 * Backend tests for the Notifications tab endpoints (master-doc.md Section
 * 14.7): GET /api/merchants/:id/notifications and PATCH
 * /api/notifications/:id/read. notification.service.js is the sole data
 * access point for `users/{userId}/notifications` (no dedicated
 * repository), so these tests mock the Firestore Admin SDK chain directly,
 * same as the service itself calls it.
 */

function makeNotificationDoc(id, overrides = {}) {
  return {
    id,
    data: () => ({
      type: 'payment_success',
      channel: 'in_app',
      content: 'You just received a new payment.',
      status: 'sent',
      sentAt: { toMillis: () => Date.now() },
      read: false,
      ...overrides,
    }),
  };
}

jest.mock('../src/config/firebase', () => {
  const verifyIdToken = jest.fn();
  const firestoreMock = jest.fn();
  return {
    admin: {
      auth: () => ({ verifyIdToken }),
      firestore: firestoreMock,
    },
    isFirebaseReady: () => true,
    initError: () => null,
    __verifyIdToken: verifyIdToken,
    __firestoreMock: firestoreMock,
  };
});

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const app = require('../src/app');

describe('GET /api/merchants/:id/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the caller does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .get('/api/merchants/merchant-1/notifications')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns notifications reverse-chronologically, marking >90-day-old ones archived (not deleted)', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });

    const recentDoc = makeNotificationDoc('n-recent', { sentAt: { toMillis: () => Date.now() } });
    const oldDoc = makeNotificationDoc('n-old', {
      sentAt: { toMillis: () => Date.now() - 91 * 24 * 60 * 60 * 1000 },
    });

    const get = jest.fn().mockResolvedValue({ docs: [recentDoc, oldDoc] });
    const limit = jest.fn(() => ({ get }));
    const orderBy = jest.fn(() => ({ limit }));
    const notificationsCollection = jest.fn(() => ({ orderBy }));
    const doc = jest.fn(() => ({ collection: notificationsCollection }));
    const usersCollection = jest.fn(() => ({ doc }));

    firebaseConfig.__firestoreMock.mockReturnValue({ collection: usersCollection });

    const res = await request(app)
      .get('/api/merchants/merchant-1/notifications')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items[0].id).toBe('n-recent');
    expect(res.body.items[0].archived).toBe(false);
    expect(res.body.items[1].id).toBe('n-old');
    expect(res.body.items[1].archived).toBe(true);
    expect(orderBy).toHaveBeenCalledWith('sentAt', 'desc');
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 404 when the notification does not exist', async () => {
    const get = jest.fn().mockResolvedValue({ exists: false });
    const update = jest.fn();
    const doc = jest.fn(() => ({ get, update }));
    const notificationsCollection = jest.fn(() => ({ doc }));
    const userDoc = jest.fn(() => ({ collection: notificationsCollection }));
    const usersCollection = jest.fn(() => ({ doc: userDoc }));

    firebaseConfig.__firestoreMock.mockReturnValue({ collection: usersCollection });

    const res = await request(app)
      .patch('/api/notifications/does-not-exist/read')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('marks the caller\'s own notification as read, never touching another user\'s subcollection', async () => {
    const notifData = makeNotificationDoc('n-1', { read: false });
    const get = jest.fn().mockResolvedValue({ exists: true, data: notifData.data });
    const update = jest.fn().mockResolvedValue(undefined);
    const doc = jest.fn(() => ({ get, update }));
    const notificationsCollection = jest.fn(() => ({ doc }));
    const userDoc = jest.fn(() => ({ collection: notificationsCollection }));
    const usersCollection = jest.fn(() => ({ doc: userDoc }));

    firebaseConfig.__firestoreMock.mockReturnValue({ collection: usersCollection });

    const res = await request(app)
      .patch('/api/notifications/n-1/read')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
    expect(update).toHaveBeenCalledWith({ read: true });
    // Ownership is implicit: the collection path is scoped to the
    // authenticated uid, not a merchant/user id taken from the URL.
    expect(usersCollection).toHaveBeenCalledWith('users');
    expect(userDoc).toHaveBeenCalledWith('owner-1');
  });
});
