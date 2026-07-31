const request = require('supertest');

/**
 * Backend tests for PATCH /api/merchants/:id/settings (master-doc.md
 * Section 14.12's Language tab) — ownership enforcement and field
 * validation, mirroring merchant.ownership.test.js's style for the sibling
 * profile PATCH endpoint.
 *
 * Bank/payout fields used to be tested here (an earlier revision bundled
 * them into this same endpoint) — that's been reverted per Section 30 rule
 * 12 / Section 19.2's `payout/details` subcollection. Bank Details now has
 * its own dedicated endpoint and its own test file, merchant.payout.test.js.
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
  reservePageSlug: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const app = require('../src/app');

const VALID_PATCH = { language: 'en' };

describe('PATCH /api/merchants/:id/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the authenticated uid does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/settings')
      .set('Authorization', 'Bearer faketoken')
      .send(VALID_PATCH);

    expect(res.status).toBe(403);
    expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
  });

  it('allows the owner to update the language preference', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    merchantRepository.updateMerchant.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', ...VALID_PATCH });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/settings')
      .set('Authorization', 'Bearer faketoken')
      .send(VALID_PATCH);

    expect(res.status).toBe(200);
    expect(res.body.language).toBe('en');
    expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('merchant-1', VALID_PATCH);
  });

  it('rejects an unsupported language code', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/settings')
      .set('Authorization', 'Bearer faketoken')
      .send({ language: 'fr' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores bank/payout fields if sent to this endpoint (they have their own endpoint now)', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    merchantRepository.updateMerchant.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', language: 'en' });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/settings')
      .set('Authorization', 'Bearer faketoken')
      .send({ language: 'en', bankName: 'Nordea', accountNumber: '1234567890' });

    expect(res.status).toBe(200);
    // Only `language` is a recognized field on this endpoint now — bank
    // fields are silently dropped, not written to the merchant document.
    expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('merchant-1', { language: 'en' });
  });
});

describe('PATCH /api/merchants/:id — Profile & Business expansion fields (Phase 12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('accepts valid theme colors and business hours', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      pageSlug: 'elins-bakery',
    });
    merchantRepository.updateMerchant.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });

    const patch = {
      themePrimaryColor: '#112233',
      themeSecondaryColor: '#ffffff',
      businessHours: { mon: { open: '09:00', close: '17:00', closed: false }, sun: null },
      socialLinks: { website: 'https://example.com', instagram: '@elins_bakery' },
    };

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send(patch);

    expect(res.status).toBe(200);
    expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('merchant-1', patch);
  });

  it('rejects a malformed hex color', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      pageSlug: 'elins-bakery',
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ themePrimaryColor: 'blue' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
  });

  it('rejects a cover banner image over the size budget', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      pageSlug: 'elins-bakery',
    });

    // ~200KB decoded, over the 150KB budget shared with the profile photo.
    const oversized = Buffer.alloc(200 * 1024).toString('base64');

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ coverBannerBase64: oversized });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized social link field', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      status: 'active',
      pageSlug: 'elins-bakery',
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ socialLinks: { tiktok: '@elins_bakery' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
