const request = require('supertest');

/**
 * Backend tests for GET/PATCH /api/merchants/:id/payout (master-doc.md
 * Section 14.12/19.2's Bank Details tab) — ownership enforcement, field
 * validation, the active-currency check, and the empty-vs-filled-in states,
 * mirroring merchant.settings.test.js's style for the sibling endpoint.
 * Deliberately excluded from onboarding (Section 30 rule 12) — this is the
 * only place these fields are ever written, and they live in their own
 * `merchants/{id}/payout/details` subcollection, not on the main merchant
 * document.
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
}));

jest.mock('../src/repositories/payout.repository', () => ({
  getPayoutDetails: jest.fn(),
  savePayoutDetails: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const payoutRepository = require('../src/repositories/payout.repository');
const app = require('../src/app');

const VALID_PATCH = {
  bankName: 'Nordea',
  accountHolderName: 'Elin Andersson',
  accountNumber: '1234567890',
  ifscSwift: 'NDEASESS',
  accountType: 'savings',
  settlementCurrency: 'SEK',
};

describe('GET /api/merchants/:id/payout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the authenticated uid does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .get('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(403);
    expect(payoutRepository.getPayoutDetails).not.toHaveBeenCalled();
  });

  it('returns an honest empty state ({ completed: false }) for a newly onboarded merchant with no payout/details doc', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ completed: false, completedAt: null });
  });

  it('masks the account number in a filled-in state, never returning it in full', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue({
      ...VALID_PATCH,
      completedAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    });

    const res = await request(app)
      .get('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.maskedAccountNumber).toBe('••••••7890');
    expect(res.body.accountNumber).toBeUndefined();
  });
});

describe('PATCH /api/merchants/:id/payout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the authenticated uid does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send(VALID_PATCH);

    expect(res.status).toBe(403);
    expect(payoutRepository.savePayoutDetails).not.toHaveBeenCalled();
  });

  it('allows the owner to save bank details for the first time and sets completedAt', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue(null);
    payoutRepository.savePayoutDetails.mockResolvedValue({
      ...VALID_PATCH,
      branch: null,
      upiId: null,
      completedAt: { toDate: () => new Date('2026-07-31T00:00:00.000Z') },
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send(VALID_PATCH);

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.maskedAccountNumber).toBe('••••••7890');
    // markCompleted=true is passed since no existing doc had a completedAt yet.
    expect(payoutRepository.savePayoutDetails).toHaveBeenCalledWith(
      'merchant-1',
      expect.objectContaining({ bankName: 'Nordea', settlementCurrency: 'SEK' }),
      true
    );
  });

  it('does not re-mark completedAt on a subsequent edit', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue({
      ...VALID_PATCH,
      completedAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    });
    payoutRepository.savePayoutDetails.mockResolvedValue({
      ...VALID_PATCH,
      bankName: 'Swedbank',
      completedAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send({ ...VALID_PATCH, bankName: 'Swedbank' });

    expect(res.status).toBe(200);
    expect(payoutRepository.savePayoutDetails).toHaveBeenCalledWith(
      'merchant-1',
      expect.objectContaining({ bankName: 'Swedbank' }),
      false
    );
  });

  it('rejects a settlementCurrency outside the active Surfboard currency list', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send({ ...VALID_PATCH, settlementCurrency: 'USD' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(payoutRepository.savePayoutDetails).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized accountType', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send({ ...VALID_PATCH, accountType: 'crypto' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(payoutRepository.savePayoutDetails).not.toHaveBeenCalled();
  });

  it('rejects an empty bankName', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send({ ...VALID_PATCH, bankName: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts an optional upiId and branch', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1', status: 'active' });
    payoutRepository.getPayoutDetails.mockResolvedValue(null);
    payoutRepository.savePayoutDetails.mockResolvedValue({
      ...VALID_PATCH,
      branch: 'Gothenburg',
      upiId: 'elin@upi',
      completedAt: { toDate: () => new Date('2026-07-31T00:00:00.000Z') },
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/payout')
      .set('Authorization', 'Bearer faketoken')
      .send({ ...VALID_PATCH, branch: 'Gothenburg', upiId: 'elin@upi' });

    expect(res.status).toBe(200);
    expect(res.body.branch).toBe('Gothenburg');
    expect(res.body.upiId).toBe('elin@upi');
  });
});
