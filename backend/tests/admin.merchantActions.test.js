const request = require('supertest');
const { signAdminToken } = require('./helpers/adminToken');

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
  findMerchantByUserId: jest.fn(),
}));

jest.mock('../src/repositories/admin.repository', () => ({
  listMerchants: jest.fn(),
  getAllMerchants: jest.fn(),
  countMerchantsByStatus: jest.fn(),
  countRecentMerchants: jest.fn(),
  getAllOrdersAcrossMerchants: jest.fn(),
  getAllRefundsAcrossMerchants: jest.fn(),
  deleteMerchantData: jest.fn(),
  createAdminAction: jest.fn().mockResolvedValue({ id: 'action-1' }),
  listAdminActions: jest.fn(),
  getPlatformSettings: jest.fn(),
  updatePlatformSettings: jest.fn(),
}));

jest.mock('../src/repositories/order.repository', () => ({
  getAllOrders: jest.fn(),
  resolveMerchantIdForOrder: jest.fn(),
  createOrder: jest.fn(),
  getOrderById: jest.fn(),
  updateOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrdersInRange: jest.fn(),
  getOrderCountForMerchant: jest.fn(),
}));

// Phase 13 (Section 27, Deviation 1): suspendMerchant now also fires a
// merchant_suspended notification — mocked here the same way
// webhook.idempotency.test.js mocks notification.service.js, so these tests
// exercise admin.service.js's real logic without touching Firestore.
jest.mock('../src/services/notification.service', () => ({
  notify: jest.fn(),
}));

const merchantRepository = require('../src/repositories/merchant.repository');
const adminRepository = require('../src/repositories/admin.repository');
const orderRepository = require('../src/repositories/order.repository');
const notificationService = require('../src/services/notification.service');
const app = require('../src/app');

const ADMIN_AUTH_HEADER = `Bearer ${signAdminToken()}`;

/**
 * master-doc.md Section 16.2 + Deviation 1: Suspend is THE core safeguard
 * this phase — its request validation (an internal note is mandatory) and
 * the reactivate/approve/reject repurposing (see admin.service.js's module
 * header comment for the full reasoning) are covered here at the route
 * level, mocking only the repositories (not admin.service.js itself), so
 * the real business logic runs end to end.
 *
 * Auth: admin routes are gated by adminAuth.middleware.js (Section
 * 24.4-24.6, ADMIN_JWT_SECRET), not Firebase — `adminId` on every
 * audit-trail entry is therefore always the fixed string `'admin'` (Section
 * 19.2), not a Firebase uid.
 */
describe('Admin Merchant Management actions (master-doc.md Section 16.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue({ id: 'n1' });
  });

  describe('POST /api/admin/merchants/:id/suspend', () => {
    it('rejects with 400 VALIDATION_ERROR when no note is provided', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/suspend')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
    });

    it('suspends an active merchant, writes status=suspended, and logs an adminAction', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });
      merchantRepository.updateMerchant.mockResolvedValue({ id: 'm1', status: 'suspended' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/suspend')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ note: 'Multiple customer complaints of non-delivery.' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'suspended' });
      expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('m1', { status: 'suspended' });
      expect(adminRepository.createAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ adminId: 'admin', actionType: 'merchant.suspended', targetId: 'm1' })
      );
      expect(notificationService.notify).toHaveBeenCalledWith({ merchantId: 'm1', type: 'merchant_suspended' });
    });

    it('still suspends successfully even if the notification dispatch throws', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });
      merchantRepository.updateMerchant.mockResolvedValue({ id: 'm1', status: 'suspended' });
      notificationService.notify.mockRejectedValue(new Error('push provider down'));

      const res = await request(app)
        .post('/api/admin/merchants/m1/suspend')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ note: 'Multiple customer complaints of non-delivery.' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'suspended' });
    });

    it('returns 409 CONFLICT when the merchant is already suspended', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'suspended' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/suspend')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ note: 'Second attempt.' });

      expect(res.status).toBe(409);
      expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
    });

    it('returns 404 MERCHANT_NOT_FOUND for an unknown merchant', async () => {
      merchantRepository.getMerchantById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/admin/merchants/does-not-exist/suspend')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ note: 'x' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MERCHANT_NOT_FOUND');
    });
  });

  describe('POST /api/admin/merchants/:id/reactivate', () => {
    it('reactivates a suspended merchant back to active', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'suspended' });
      merchantRepository.updateMerchant.mockResolvedValue({ id: 'm1', status: 'active' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/reactivate')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'active' });
      expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('m1', { status: 'active' });
    });

    it('rejects reactivating a merchant that is not currently suspended', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/reactivate')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
      expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/merchants/:id/approve (repurposed post-Deviation-1)', () => {
    it('re-affirms an already-active merchant (no-op status change, still audit-logged)', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });
      merchantRepository.updateMerchant.mockResolvedValue({ id: 'm1', status: 'active' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/approve')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'active' });
      expect(adminRepository.createAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'merchant.approved' })
      );
    });

    it('reverses a rejected merchant back to active (appeal granted)', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'rejected' });
      merchantRepository.updateMerchant.mockResolvedValue({ id: 'm1', status: 'active' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/approve')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'active' });
    });

    it('refuses to approve a suspended merchant — points the admin at Reactivate instead', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'suspended' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/approve')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(409);
      expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/merchants/:id/reject (repurposed post-Deviation-1)', () => {
    it('requires a reason, per the documented request shape (Section 22.9)', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/reject')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({});

      expect(res.status).toBe(400);
      expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
    });

    it('sets status to rejected with a reason, and logs the reason on the audit trail', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });
      merchantRepository.updateMerchant.mockResolvedValue({ id: 'm1', status: 'rejected' });

      const res = await request(app)
        .post('/api/admin/merchants/m1/reject')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ reason: 'Confirmed policy violation.' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'rejected' });
      expect(adminRepository.createAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'merchant.rejected', notes: 'Confirmed policy violation.' })
      );
    });
  });

  describe('DELETE /api/admin/merchants/:id (new — genuinely destructive, no undo)', () => {
    it('returns 404 MERCHANT_NOT_FOUND for an unknown merchant', async () => {
      merchantRepository.getMerchantById.mockResolvedValue(null);

      const res = await request(app).delete('/api/admin/merchants/does-not-exist').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(404);
      expect(adminRepository.deleteMerchantData).not.toHaveBeenCalled();
    });

    it('refuses to delete a merchant that has ever taken a real payment, pointing at Suspend instead', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', businessName: 'Acme', userId: 'u1' });
      orderRepository.getAllOrders.mockResolvedValue([
        { id: 'o1', status: 'pending' },
        { id: 'o2', status: 'paid' },
      ]);

      const res = await request(app).delete('/api/admin/merchants/m1').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(adminRepository.deleteMerchantData).not.toHaveBeenCalled();
    });

    it('refuses to delete a merchant with a partially_refunded or refunded order too, not just paid', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', businessName: 'Acme', userId: 'u1' });
      orderRepository.getAllOrders.mockResolvedValue([{ id: 'o1', status: 'refunded' }]);

      const res = await request(app).delete('/api/admin/merchants/m1').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(409);
      expect(adminRepository.deleteMerchantData).not.toHaveBeenCalled();
    });

    it('permanently deletes a merchant with zero real paid orders, and logs a self-contained audit entry', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({
        id: 'm1',
        businessName: 'Test Shop',
        category: 'Other',
        pageSlug: 'test-shop',
        userId: 'u1',
      });
      orderRepository.getAllOrders.mockResolvedValue([
        { id: 'o1', status: 'pending' },
        { id: 'o2', status: 'failed' },
      ]);
      adminRepository.deleteMerchantData.mockResolvedValue({ deletedDocCount: 7 });

      const res = await request(app).delete('/api/admin/merchants/m1').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'deleted', merchantId: 'm1', deletedDocCount: 7 });
      expect(adminRepository.deleteMerchantData).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', businessName: 'Test Shop' })
      );
      expect(adminRepository.createAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin',
          actionType: 'merchant.deleted',
          targetId: 'm1',
          notes: expect.stringContaining('Test Shop'),
        })
      );
      // The audit note must stand on its own — the merchant doc is gone.
      const auditCall = adminRepository.createAdminAction.mock.calls.find(([c]) => c.actionType === 'merchant.deleted');
      expect(JSON.parse(auditCall[0].notes)).toEqual({
        businessName: 'Test Shop',
        category: 'Other',
        pageSlug: 'test-shop',
        orderCount: 2,
      });
    });

    it('allows deleting a merchant with zero orders at all', async () => {
      merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', businessName: 'Empty Shop', userId: 'u1' });
      orderRepository.getAllOrders.mockResolvedValue([]);
      adminRepository.deleteMerchantData.mockResolvedValue({ deletedDocCount: 1 });

      const res = await request(app).delete('/api/admin/merchants/m1').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('deleted');
    });
  });
});
