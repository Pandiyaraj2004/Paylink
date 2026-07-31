const request = require('supertest');
const jwt = require('jsonwebtoken');

/**
 * POST /api/auth/admin-login (master-doc.md Section 16.0/22.1/24.4): the
 * ONLY way into the Admin side of the product — Access Code + Password
 * checked directly against env.ADMIN_ACCESS_CODE/env.ADMIN_PASSWORD, no
 * Firebase involved at all.
 *
 * `jest.resetModules()` + re-requiring `../src/app` fresh in each test
 * gives every test its own express-rate-limit store (authLimiter is a
 * module-level singleton shared with POST /api/auth/session), so the
 * rate-limiting test at the bottom doesn't leak failed attempts into the
 * success-path tests above it, or vice versa.
 */
describe('POST /api/auth/admin-login', () => {
  let env;
  let app;

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line global-require
    env = require('../src/config/env');
    // eslint-disable-next-line global-require
    app = require('../src/app');
  });

  it('issues a valid, short-lived admin JWT for the correct Access Code + Password', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ accessCode: env.ADMIN_ACCESS_CODE, password: env.ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.adminToken).toBe('string');

    const decoded = jwt.verify(res.body.adminToken, env.ADMIN_JWT_SECRET);
    expect(decoded.role).toBe('admin');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('rejects a wrong access code with the deliberately generic error (Section 16.0)', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ accessCode: 'not-the-code', password: env.ADMIN_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid access code or password.');
  });

  it('rejects a wrong password with the exact same generic error — never confirms which field was wrong', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ accessCode: env.ADMIN_ACCESS_CODE, password: 'not-the-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Invalid access code or password.');
  });

  it('rejects a request with both fields missing rather than throwing', async () => {
    const res = await request(app).post('/api/auth/admin-login').send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate-limits repeated failed attempts — 429 after 5 requests in the window (Section 16.0: no account-lockout/reset flow to fall back on)', async () => {
    const attempt = () =>
      request(app).post('/api/auth/admin-login').send({ accessCode: 'wrong', password: 'wrong' });

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await attempt();
      expect(res.status).toBe(401);
    }

    const sixth = await attempt();
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('RATE_LIMITED');
  });
});
