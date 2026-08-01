const request = require('supertest');
const { signAdminToken } = require('./helpers/adminToken');

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

jest.mock('../src/repositories/admin.repository', () => ({
  listMerchants: jest.fn(),
  getAllMerchants: jest.fn(),
  countMerchantsByStatus: jest.fn(),
  countRecentMerchants: jest.fn(),
  getAllOrdersAcrossMerchants: jest.fn(),
  getAllRefundsAcrossMerchants: jest.fn(),
  createAdminAction: jest.fn().mockResolvedValue({ id: 'action-1' }),
  listAdminActions: jest.fn(),
  getPlatformSettings: jest.fn(),
  updatePlatformSettings: jest.fn(),
}));

jest.mock('../src/repositories/order.repository', () => ({
  resolveMerchantIdForOrder: jest.fn(),
  createOrder: jest.fn(),
  getOrderById: jest.fn(),
  updateOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrdersInRange: jest.fn(),
  getOrderCountForMerchant: jest.fn(),
  getAllOrders: jest.fn(),
}));

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
  findMerchantByUserId: jest.fn(),
}));

jest.mock('../src/services/surfboard.service', () => ({
  createOrder: jest.fn(),
  initiatePayment: jest.fn(),
  voidPayment: jest.fn(),
  getOrderStatus: jest.fn(),
  checkConnection: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  toNumericCurrency: jest.fn(),
  mapPaymentMethod: jest.fn(),
  getSettlementReports: jest.fn(),
}));

jest.mock('../src/services/notification.service', () => ({
  notify: jest.fn().mockResolvedValue(null),
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
}));

const payoutBatchRepository = require('../src/repositories/payoutBatch.repository');
const adminRepository = require('../src/repositories/admin.repository');
const orderRepository = require('../src/repositories/order.repository');
const surfboardService = require('../src/services/surfboard.service');
const notificationService = require('../src/services/notification.service');
const app = require('../src/app');

const ADMIN_AUTH_HEADER = `Bearer ${signAdminToken()}`;

/**
 * Payout & Settlement Management module — admin-facing Settlement
 * Management page endpoints: list/summary, manual recalculation, and the
 * "mark as Paid" action. See payout.merchant.test.js for the merchant-side
 * Payouts page coverage.
 */
describe('Admin Payouts / Settlement Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue(null);
  });

  describe('GET /api/admin/payouts/summary', () => {
    it('aggregates pending/eligible/paid totals per merchant', async () => {
      payoutBatchRepository.getAllBatches.mockResolvedValue([
        { merchantId: 'm1', status: 'pending', netAmount: 100, currency: 'SEK' },
        { merchantId: 'm1', status: 'eligible', netAmount: 50, currency: 'SEK' },
        { merchantId: 'm2', status: 'paid', netAmount: 200, currency: 'SEK' },
      ]);
      adminRepository.getAllMerchants.mockResolvedValue([
        { id: 'm1', businessName: 'Alice Bakes' },
        { id: 'm2', businessName: 'Bob Repairs' },
      ]);

      const res = await request(app).get('/api/admin/payouts/summary').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.pendingBalance).toBe(100);
      expect(res.body.eligibleBalance).toBe(50);
      expect(res.body.totalPaidLifetime).toBe(200);
      expect(res.body.byMerchant).toHaveLength(2);
      const alice = res.body.byMerchant.find((m) => m.merchantId === 'm1');
      expect(alice.businessName).toBe('Alice Bakes');
      expect(alice.pendingBalance).toBe(100);
      expect(alice.eligibleBalance).toBe(50);
    });

    it('requires a valid admin token', async () => {
      const res = await request(app).get('/api/admin/payouts/summary');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/payouts', () => {
    it('rejects an invalid status filter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/admin/payouts?status=bogus')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(payoutBatchRepository.listAllBatches).not.toHaveBeenCalled();
    });

    it('lists batches platform-wide, enriched with businessName', async () => {
      payoutBatchRepository.listAllBatches.mockResolvedValue({
        items: [
          {
            id: 'batch-1',
            merchantId: 'm1',
            status: 'eligible',
            netAmount: 150,
            currency: 'SEK',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
      adminRepository.getAllMerchants.mockResolvedValue([{ id: 'm1', businessName: 'Alice Bakes' }]);

      const res = await request(app).get('/api/admin/payouts').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.items[0].businessName).toBe('Alice Bakes');
    });
  });

  describe('POST /api/admin/payouts/recalculate', () => {
    it('bundles newly-captured paid orders into a new pending batch per merchant', async () => {
      payoutBatchRepository.listPendingBatches.mockResolvedValue([]);
      payoutBatchRepository.getCursor.mockResolvedValue(0);
      adminRepository.getAllOrdersAcrossMerchants.mockResolvedValue([
        {
          id: 'order-1',
          merchantId: 'm1',
          status: 'paid',
          totalAmount: 100,
          currency: 'SEK',
          payment: { capturedAt: '2026-01-01T00:00:00.000Z', surfboardOrderId: 'sb-order-1' },
        },
      ]);
      adminRepository.getAllRefundsAcrossMerchants.mockResolvedValue([]);
      payoutBatchRepository.createBatch.mockResolvedValue({ id: 'batch-new' });

      const res = await request(app)
        .post('/api/admin/payouts/recalculate')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.batchesCreated).toBe(1);
      expect(payoutBatchRepository.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 'm1', status: 'pending', netAmount: 100, orderIds: ['order-1'] })
      );
      expect(payoutBatchRepository.setCursor).toHaveBeenCalledWith('m1', expect.any(Number));
    });

    it('nets out a fully-refunded order to zero and advances the cursor without creating a batch', async () => {
      payoutBatchRepository.listPendingBatches.mockResolvedValue([]);
      payoutBatchRepository.getCursor.mockResolvedValue(0);
      adminRepository.getAllOrdersAcrossMerchants.mockResolvedValue([
        {
          id: 'order-1',
          merchantId: 'm1',
          status: 'refunded',
          totalAmount: 100,
          currency: 'SEK',
          payment: { capturedAt: '2026-01-01T00:00:00.000Z' },
        },
      ]);
      adminRepository.getAllRefundsAcrossMerchants.mockResolvedValue([
        { orderId: 'order-1', amount: 100, status: 'completed' },
      ]);

      const res = await request(app)
        .post('/api/admin/payouts/recalculate')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.batchesCreated).toBe(0);
      expect(payoutBatchRepository.createBatch).not.toHaveBeenCalled();
      expect(payoutBatchRepository.setCursor).toHaveBeenCalledWith('m1', expect.any(Number));
    });

    it('promotes a pending batch to eligible once the reserve period has elapsed', async () => {
      const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      payoutBatchRepository.listPendingBatches.mockResolvedValue([
        { id: 'batch-old', merchantId: 'm1', periodEnd: longAgo, orderIds: ['order-1'] },
      ]);
      orderRepository.getOrderById.mockResolvedValue({ payment: {} }); // no surfboardOrderId — inconclusive check
      adminRepository.getAllOrdersAcrossMerchants.mockResolvedValue([]);
      adminRepository.getAllRefundsAcrossMerchants.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/admin/payouts/recalculate')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.batchesPromoted).toBe(1);
      expect(payoutBatchRepository.updateBatch).toHaveBeenCalledWith(
        'batch-old',
        expect.objectContaining({ status: 'eligible' })
      );
    });

    it('promotes early when Surfboard confirms settlement, even before the reserve period elapses', async () => {
      const justNow = new Date().toISOString();
      payoutBatchRepository.listPendingBatches.mockResolvedValue([
        { id: 'batch-new', merchantId: 'm1', periodEnd: justNow, orderIds: ['order-1'] },
      ]);
      orderRepository.getOrderById.mockResolvedValue({ payment: { surfboardOrderId: 'sb-1' } });
      surfboardService.getOrderStatus.mockResolvedValue({
        transactions: [{ settlementStatus: 'SETTLED' }],
      });
      adminRepository.getAllOrdersAcrossMerchants.mockResolvedValue([]);
      adminRepository.getAllRefundsAcrossMerchants.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/admin/payouts/recalculate')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.batchesPromoted).toBe(1);
      expect(payoutBatchRepository.updateBatch).toHaveBeenCalledWith(
        'batch-new',
        expect.objectContaining({ status: 'eligible', settlementConfirmed: true })
      );
    });

    it('does not promote a fresh pending batch when neither the reserve nor Surfboard confirms it', async () => {
      const justNow = new Date().toISOString();
      payoutBatchRepository.listPendingBatches.mockResolvedValue([
        { id: 'batch-new', merchantId: 'm1', periodEnd: justNow, orderIds: ['order-1'] },
      ]);
      orderRepository.getOrderById.mockResolvedValue({ payment: {} });
      adminRepository.getAllOrdersAcrossMerchants.mockResolvedValue([]);
      adminRepository.getAllRefundsAcrossMerchants.mockResolvedValue([]);

      const res = await request(app)
        .post('/api/admin/payouts/recalculate')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.batchesPromoted).toBe(0);
      expect(payoutBatchRepository.updateBatch).not.toHaveBeenCalledWith(
        'batch-new',
        expect.objectContaining({ status: 'eligible' })
      );
    });
  });

  describe('PATCH /api/admin/payouts/:id/mark-paid', () => {
    it('returns 404 PAYOUT_NOT_FOUND for an unknown batch', async () => {
      payoutBatchRepository.getBatchById.mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/admin/payouts/missing/mark-paid')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ note: 'Paid via bank transfer ref #123' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYOUT_NOT_FOUND');
    });

    it('rejects marking a still-pending batch as paid with 400 VALIDATION_ERROR', async () => {
      payoutBatchRepository.getBatchById.mockResolvedValue({ id: 'batch-1', status: 'pending' });

      const res = await request(app)
        .patch('/api/admin/payouts/batch-1/mark-paid')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
      expect(payoutBatchRepository.updateBatch).not.toHaveBeenCalled();
    });

    it('rejects marking an already-paid batch as paid again with 409 CONFLICT', async () => {
      payoutBatchRepository.getBatchById.mockResolvedValue({ id: 'batch-1', status: 'paid' });

      const res = await request(app)
        .patch('/api/admin/payouts/batch-1/mark-paid')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(409);
      expect(payoutBatchRepository.updateBatch).not.toHaveBeenCalled();
    });

    it('marks an eligible batch as paid, logs an adminAction, and notifies the merchant', async () => {
      payoutBatchRepository.getBatchById.mockResolvedValue({ id: 'batch-1', status: 'eligible', merchantId: 'm1' });
      payoutBatchRepository.updateBatch.mockImplementation(async (id, patch) => ({ id, merchantId: 'm1', ...patch }));

      const res = await request(app)
        .patch('/api/admin/payouts/batch-1/mark-paid')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ note: 'Paid via bank transfer ref #123' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paid');
      expect(res.body.paidAt).toBeTruthy();
      expect(adminRepository.createAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'payout.paid', targetId: 'batch-1' })
      );
      expect(notificationService.notify).toHaveBeenCalledWith({ merchantId: 'm1', type: 'payout_paid' });
    });
  });

  describe('GET /api/admin/payouts/surfboard-settlements', () => {
    it('gracefully reports not-configured when no partner ID is set', async () => {
      surfboardService.getSettlementReports.mockResolvedValue({ configured: false });

      const res = await request(app)
        .get('/api/admin/payouts/surfboard-settlements')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });
  });
});
