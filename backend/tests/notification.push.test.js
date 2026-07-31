/**
 * Phase 13 (master-doc.md Section 27 push): notification.service.js's
 * notify() now also fires a best-effort FCM push via
 * admin.messaging().sendEachForMulticast alongside the existing in-app
 * write. These tests mock the Firestore Admin SDK chain AND
 * admin.messaging() directly (never a real push send), matching this
 * project's existing "mock the Firestore chain the service itself calls"
 * style (tests/notifications.test.js).
 */

function makeFirestoreMock({ merchantUserId = 'owner-1', fcmTokens = [] } = {}) {
  const notificationDocRef = { id: 'notif-1', set: jest.fn().mockResolvedValue(undefined) };
  const notificationsCollection = jest.fn(() => ({ doc: jest.fn(() => notificationDocRef) }));

  const userDocData = { fcmTokens };
  const userDocRef = {
    get: jest.fn().mockResolvedValue({ exists: true, data: () => userDocData }),
    collection: notificationsCollection,
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const usersCollection = jest.fn(() => ({ doc: jest.fn(() => userDocRef) }));

  return {
    firestoreMock: jest.fn(() => ({ collection: usersCollection })),
    userDocRef,
    notificationDocRef,
    merchantUserId,
  };
}

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
}));

describe('notification.service.js notify() — FCM push (Phase 13, Section 27)', () => {
  let admin;
  let sendEachForMulticast;
  let merchantRepository;
  let notificationService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    sendEachForMulticast = jest.fn();

    jest.doMock('../src/config/firebase', () => ({
      admin: {
        firestore: jest.fn(),
        messaging: () => ({ sendEachForMulticast }),
      },
      isFirebaseReady: () => true,
      initError: () => null,
    }));

    jest.doMock('../src/repositories/merchant.repository', () => ({
      getMerchantById: jest.fn(),
    }));

    // eslint-disable-next-line global-require
    const firebaseConfig = require('../src/config/firebase');
    admin = firebaseConfig.admin;
    admin.firestore.FieldValue = { serverTimestamp: () => 'SERVER_TIMESTAMP' };

    // eslint-disable-next-line global-require
    merchantRepository = require('../src/repositories/merchant.repository');
    // eslint-disable-next-line global-require
    notificationService = require('../src/services/notification.service');
  });

  it('does not call admin.messaging() at all when the user has no registered FCM tokens', async () => {
    const { firestoreMock } = makeFirestoreMock({ fcmTokens: [] });
    admin.firestore.mockImplementation(firestoreMock);
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });

    const result = await notificationService.notify({ merchantId: 'merchant-1', type: 'payment_success' });

    expect(result.id).toBe('notif-1');
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sends a push to every registered token when present', async () => {
    const { firestoreMock } = makeFirestoreMock({ fcmTokens: ['token-a', 'token-b'] });
    admin.firestore.mockImplementation(firestoreMock);
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });

    await notificationService.notify({ merchantId: 'merchant-1', type: 'refund_issued' });

    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token-a', 'token-b'],
        notification: expect.objectContaining({ body: expect.any(String) }),
      })
    );
  });

  it('prunes a confirmed-invalid token instead of crashing notify()', async () => {
    const { firestoreMock, userDocRef } = makeFirestoreMock({ fcmTokens: ['good-token', 'stale-token'] });
    admin.firestore.mockImplementation(firestoreMock);
    admin.firestore.FieldValue.arrayRemove = (...tokens) => ({ __arrayRemove: tokens });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    const result = await notificationService.notify({ merchantId: 'merchant-1', type: 'payment_success' });

    expect(result.id).toBe('notif-1');
    expect(userDocRef.update).toHaveBeenCalledWith({ fcmTokens: { __arrayRemove: ['stale-token'] } });
  });

  it('never throws out of notify() when the push send itself fails outright', async () => {
    const { firestoreMock } = makeFirestoreMock({ fcmTokens: ['token-a'] });
    admin.firestore.mockImplementation(firestoreMock);
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    sendEachForMulticast.mockRejectedValue(new Error('FCM outage'));

    await expect(
      notificationService.notify({ merchantId: 'merchant-1', type: 'payment_success' })
    ).resolves.toEqual(expect.objectContaining({ id: 'notif-1' }));
  });
});
