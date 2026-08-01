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

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
  findMerchantByUserId: jest.fn(),
}));

jest.mock('../src/repositories/payoutBatch.repository', () => ({
  getCursor: jest.fn(),
  setCursor: jest.fn(),
  createBatch: jest.fn(),
  updateBatch: jest.fn(),
  getBatchById: jest.fn(),
  listPendingBatches: jest.fn(),
  getAllBatches: jest.fn(),
  listBatchesForMerchant: jest.fn(),
  getAllBatchesForMerchant: jest.fn(),
  listAllBatches: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const payoutBatchRepository = require('../src/repositories/payoutBatch.repository');
const app = require('../src/app');

/**
 * Payout & Settlement Management module — merchant-facing Payouts page
 * endpoints (GET /api/merchants/:id/payouts, /payouts/summary). See
 * admin.payouts.test.js for the admin-side (recalculate/mark-paid) coverage.
 */
describe('Merchant Payouts (Payout & Settlement Management module)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
  });

  describe('GET /api/merchants/:id/payouts/summary', () => {
    it('rejects a non-owner with 403 FORBIDDEN', async () => {
      firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'someone-else' });

      const res = await request(app)
        .get('/api/merchants/merchant-1/payouts/summary')
        .set('Authorization', 'Bearer faketoken');

      expect(res.status).toBe(403);
      expect(payoutBatchRepository.getAllBatchesForMerchant).not.toHaveBeenCalled();
    });

    it('summarizes pending/eligible/paid totals across the merchant\'s own batches', async () => {
      payoutBatchRepository.getAllBatchesForMerchant.mockResolvedValue([
        { status: 'pending', netAmount: 100, currency: 'SEK' },
        { status: 'pending', netAmount: 50, currency: 'SEK' },
        { status: 'eligible', netAmount: 200, currency: 'SEK' },
        { status: 'paid', netAmount: 300, currency: 'SEK' },
      ]);

      const res = await request(app)
        .get('/api/merchants/merchant-1/payouts/summary')
        .set('Authorization', 'Bearer faketoken');

      expect(res.status).toBe(200);
      expect(res.body.pendingBalance).toBe(150);
      expect(res.body.eligibleBalance).toBe(200);
      expect(res.body.totalPaidLifetime).toBe(300);
      expect(res.body.currency).toBe('SEK');
    });

    it('returns zeroed totals for a merchant with no payout batches yet', async () => {
      payoutBatchRepository.getAllBatchesForMerchant.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/merchants/merchant-1/payouts/summary')
        .set('Authorization', 'Bearer faketoken');

      expect(res.status).toBe(200);
      expect(res.body.pendingBalance).toBe(0);
      expect(res.body.eligibleBalance).toBe(0);
      expect(res.body.totalPaidLifetime).toBe(0);
    });
  });

  describe('GET /api/merchants/:id/payouts', () => {
    it('rejects an invalid status filter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/merchants/merchant-1/payouts?status=bogus')
        .set('Authorization', 'Bearer faketoken');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(payoutBatchRepository.listBatchesForMerchant).not.toHaveBeenCalled();
    });

    it('lists the merchant\'s own payout batch history', async () => {
      payoutBatchRepository.listBatchesForMerchant.mockResolvedValue({
        items: [
          {
            id: 'batch-1',
            merchantId: 'merchant-1',
            status: 'eligible',
            netAmount: 120,
            currency: 'SEK',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await request(app)
        .get('/api/merchants/merchant-1/payouts')
        .set('Authorization', 'Bearer faketoken');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('batch-1');
    });
  });
});
