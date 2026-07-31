const request = require('supertest');

/**
 * Phase 13 (master-doc.md Section 27, Deviation 1): "Your store is live"
 * repurposes the old pre-launch "Merchant approved" event, firing the
 * moment merchant.service.js's updateMerchantProfile flips a merchant from
 * `pending_setup` to `active` (the AI Setup Concierge confirm flow's last
 * step, per that function's own module comment). Mocks
 * notification.service.js directly (same pattern webhook.idempotency.test.js
 * uses) so this exercises the real transition-detection logic in
 * merchant.service.js without needing a real Firestore write for the
 * notification doc itself.
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

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
  findMerchantByUserId: jest.fn(),
  reservePageSlug: jest.fn(),
}));

jest.mock('../src/services/notification.service', () => ({
  notify: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const notificationService = require('../src/services/notification.service');
const app = require('../src/app');

describe('PATCH /api/merchants/:id — "store is live" notification (Phase 13, Section 27)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    notificationService.notify.mockResolvedValue({ id: 'n1' });
  });

  it('fires a store_live notification when the update transitions pending_setup -> active', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'pending_setup',
      businessName: 'Old Name',
      pageSlug: 'old-name',
    });
    merchantRepository.updateMerchant.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      businessName: 'New Name',
      pageSlug: 'old-name',
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ businessName: 'New Name' });

    expect(res.status).toBe(200);
    expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('merchant-1', expect.objectContaining({ status: 'active' }));
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith({ merchantId: 'merchant-1', type: 'store_live' });
  });

  it('does NOT fire a store_live notification on a routine update to an already-active merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      businessName: 'Old Name',
      pageSlug: 'old-name',
    });
    merchantRepository.updateMerchant.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      businessName: 'New Name',
      pageSlug: 'old-name',
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ businessName: 'New Name' });

    expect(res.status).toBe(200);
    expect(notificationService.notify).not.toHaveBeenCalled();
  });

  it('does not fail the profile update if the notification dispatch throws', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'pending_setup',
      businessName: 'Old Name',
      pageSlug: 'old-name',
    });
    merchantRepository.updateMerchant.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      businessName: 'New Name',
      pageSlug: 'old-name',
    });
    notificationService.notify.mockRejectedValue(new Error('boom'));

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ businessName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});
