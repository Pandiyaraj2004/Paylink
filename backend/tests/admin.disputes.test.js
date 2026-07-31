const request = require('supertest');
const { signAdminToken } = require('./helpers/adminToken');

jest.mock('../src/repositories/dispute.repository', () => ({
  createDispute: jest.fn(),
  listDisputes: jest.fn(),
  getDisputeById: jest.fn(),
  updateDispute: jest.fn(),
  countDisputesByStatus: jest.fn(),
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

const disputeRepository = require('../src/repositories/dispute.repository');
const adminRepository = require('../src/repositories/admin.repository');
const app = require('../src/app');

const ADMIN_AUTH_HEADER = `Bearer ${signAdminToken()}`;

/**
 * master-doc.md Section 16.4's Disputes tab: disputes/{disputeId} documents
 * already exist from Phase 10 (dispute.service.js/dispute.repository.js) —
 * this suite covers the NEW list/resolve actions layered on top for Phase 11.
 *
 * Auth: admin routes are gated by adminAuth.middleware.js (Section
 * 24.4-24.6, ADMIN_JWT_SECRET), not Firebase — every request below carries
 * a real admin token signed by tests/helpers/adminToken.js instead of a
 * mocked verifyIdToken() call.
 */
describe('Admin Disputes (master-doc.md Section 16.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/disputes', () => {
    it('lists disputes, serializing timestamps', async () => {
      disputeRepository.listDisputes.mockResolvedValue({
        items: [{ id: 'd1', merchantId: 'm1', orderId: 'o1', status: 'open', createdAt: '2026-01-01T00:00:00.000Z', resolvedAt: null }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const res = await request(app).get('/api/admin/disputes').set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('d1');
    });

    it('rejects an invalid status filter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/admin/disputes?status=bogus')
        .set('Authorization', ADMIN_AUTH_HEADER);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(disputeRepository.listDisputes).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/disputes/:id', () => {
    it('returns 404 DISPUTE_NOT_FOUND for an unknown dispute', async () => {
      disputeRepository.getDisputeById.mockResolvedValue(null);

      const res = await request(app)
        .patch('/api/admin/disputes/missing')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ status: 'resolved', resolutionNotes: 'Refunded in full.' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DISPUTE_NOT_FOUND');
    });

    it('requires resolutionNotes when resolving (Section 16.4: "every dispute resolution action requires a note")', async () => {
      disputeRepository.getDisputeById.mockResolvedValue({ id: 'd1', status: 'open' });

      const res = await request(app)
        .patch('/api/admin/disputes/d1')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ status: 'resolved' });

      expect(res.status).toBe(400);
      expect(disputeRepository.updateDispute).not.toHaveBeenCalled();
    });

    it('allows moving open -> investigating with no note required', async () => {
      disputeRepository.getDisputeById.mockResolvedValue({ id: 'd1', status: 'open' });
      disputeRepository.updateDispute.mockResolvedValue({ id: 'd1', status: 'investigating', resolutionNotes: null, resolvedAt: null });

      const res = await request(app)
        .patch('/api/admin/disputes/d1')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ status: 'investigating' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('investigating');
    });

    it('resolves a dispute with a note, stamping resolvedAt and logging an adminAction', async () => {
      disputeRepository.getDisputeById.mockResolvedValue({ id: 'd1', status: 'investigating' });
      disputeRepository.updateDispute.mockImplementation(async (id, patch) => ({ id, status: 'open', ...patch }));

      const res = await request(app)
        .patch('/api/admin/disputes/d1')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ status: 'resolved', resolutionNotes: 'Refunded in full; merchant coached on fulfilment SLAs.' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('resolved');
      expect(res.body.resolvedAt).toBeTruthy();
      expect(adminRepository.createAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'dispute.updated', targetId: 'd1' })
      );
    });

    it('locks an already-resolved dispute from further edits (audit integrity, Section 16.4) with 409 CONFLICT', async () => {
      disputeRepository.getDisputeById.mockResolvedValue({ id: 'd1', status: 'resolved', resolutionNotes: 'Done.' });

      const res = await request(app)
        .patch('/api/admin/disputes/d1')
        .set('Authorization', ADMIN_AUTH_HEADER)
        .send({ status: 'resolved', resolutionNotes: 'Trying to edit again.' });

      expect(res.status).toBe(409);
      expect(disputeRepository.updateDispute).not.toHaveBeenCalled();
    });
  });
});
