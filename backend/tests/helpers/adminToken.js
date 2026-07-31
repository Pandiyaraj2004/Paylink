const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');

/**
 * Signs a valid admin session token the same way auth.service.js's
 * handleAdminLogin does (master-doc.md Section 24.4-24.5), for admin-route
 * tests that need to get past adminAuth.middleware.js without exercising
 * the login endpoint itself. Relies on ADMIN_JWT_SECRET being configured
 * (backend/.env.local in real dev, same pattern webhook.signature.test.js
 * relies on SURFBOARD_WEBHOOK_CERTIFICATE being set there too).
 */
function signAdminToken(overrides = {}) {
  return jwt.sign({ role: 'admin', ...overrides }, env.ADMIN_JWT_SECRET, { expiresIn: '2h' });
}

module.exports = { signAdminToken };
