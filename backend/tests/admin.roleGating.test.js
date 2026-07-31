const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { signAdminToken } = require('./helpers/adminToken');

jest.mock('../src/services/admin.service', () => ({
  getSummary: jest.fn().mockResolvedValue({ ok: true }),
  listMerchants: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  getPlatformSettings: jest.fn().mockResolvedValue({ platformFeePercent: 2.5 }),
  updatePlatformSettings: jest.fn().mockResolvedValue({ platformFeePercent: 3 }),
}));

const adminService = require('../src/services/admin.service');
const app = require('../src/app');

/**
 * master-doc.md Section 24.4-24.6: every /api/admin/* route requires a
 * verified admin session token signed with ADMIN_JWT_SECRET —
 * adminAuth.middleware.js, not Firebase, gates all of them. There is only
 * ONE admin role in this revision (senior_admin was folded into `admin`,
 * Section 24.6), so — unlike the old Firebase-custom-claim version of this
 * suite — there's no separate senior_admin-only case to cover; Settings
 * (16.6) is gated by the exact same middleware as everything else.
 */
describe('Admin routes — adminAuth.middleware.js gating (master-doc.md Section 24.4-24.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 with no Authorization header at all', async () => {
    const res = await request(app).get('/api/admin/summary');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
    expect(adminService.getSummary).not.toHaveBeenCalled();
  });

  it('returns 401 for a malformed Authorization header (no Bearer scheme)', async () => {
    const res = await request(app).get('/api/admin/summary').set('Authorization', signAdminToken());
    expect(res.status).toBe(401);
    expect(adminService.getSummary).not.toHaveBeenCalled();
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const bogusToken = jwt.sign({ role: 'admin' }, 'not-the-real-secret', { expiresIn: '2h' });

    const res = await request(app).get('/api/admin/summary').set('Authorization', `Bearer ${bogusToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
    expect(adminService.getSummary).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', async () => {
    const expiredToken = jwt.sign({ role: 'admin' }, env.ADMIN_JWT_SECRET, { expiresIn: -10 });

    const res = await request(app).get('/api/admin/summary').set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
    expect(adminService.getSummary).not.toHaveBeenCalled();
  });

  it('returns 401 for a validly-signed token carrying the wrong role', async () => {
    const wrongRoleToken = jwt.sign({ role: 'entrepreneur' }, env.ADMIN_JWT_SECRET, { expiresIn: '2h' });

    const res = await request(app).get('/api/admin/summary').set('Authorization', `Bearer ${wrongRoleToken}`);

    expect(res.status).toBe(401);
    expect(adminService.getSummary).not.toHaveBeenCalled();
  });

  it('allows a valid admin token through to GET /api/admin/summary', async () => {
    const res = await request(app)
      .get('/api/admin/summary')
      .set('Authorization', `Bearer ${signAdminToken()}`);

    expect(res.status).toBe(200);
    expect(adminService.getSummary).toHaveBeenCalled();
  });

  it('allows a valid admin token through to GET /api/admin/merchants', async () => {
    const res = await request(app)
      .get('/api/admin/merchants')
      .set('Authorization', `Bearer ${signAdminToken()}`);

    expect(res.status).toBe(200);
    expect(adminService.listMerchants).toHaveBeenCalled();
  });

  it('allows a valid admin token through to GET /api/admin/platform-settings (no separate senior_admin gate anymore, Section 24.6)', async () => {
    const res = await request(app)
      .get('/api/admin/platform-settings')
      .set('Authorization', `Bearer ${signAdminToken()}`);

    expect(res.status).toBe(200);
    expect(adminService.getPlatformSettings).toHaveBeenCalled();
  });

  it('allows a valid admin token to PATCH /api/admin/platform-settings', async () => {
    const res = await request(app)
      .patch('/api/admin/platform-settings')
      .set('Authorization', `Bearer ${signAdminToken()}`)
      .send({ platformFeePercent: 3 });

    expect(res.status).toBe(200);
    expect(adminService.updatePlatformSettings).toHaveBeenCalledWith({ platformFeePercent: 3 }, 'admin');
  });
});
