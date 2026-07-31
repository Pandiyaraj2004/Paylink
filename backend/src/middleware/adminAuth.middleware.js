const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Verifies the admin session token in the Authorization header
 * (`Bearer <token>`) against ADMIN_JWT_SECRET (master-doc.md Section
 * 24.4-24.6). This is the ONLY gate on every /api/admin/* route — Admin no
 * longer has any Firebase involvement at all, so unlike auth.middleware.js
 * there is no ID-token verification here, just a locally-signed JWT check.
 *
 * On success attaches `req.admin = { role: 'admin', adminId: 'admin' }`.
 * There is exactly one admin role in this revision (Section 24.6 folded
 * `senior_admin` into `admin`) and exactly one admin credential (Section
 * 24.4's single Access Code + Password pair), so `adminId` is always the
 * fixed string `'admin'` — matching Section 19.2's `adminActions/{actionId}`
 * schema note that `adminId` is "a simple identifier string... rather than
 * a Firebase UID reference" until multiple admin credentials ever exist.
 */
function adminAuthMiddleware(req, res, next) {
  if (!env.ADMIN_JWT_SECRET) {
    return next(
      new AppError(503, 'SERVICE_UNAVAILABLE', 'Admin authentication is temporarily unavailable.')
    );
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'INVALID_TOKEN', 'Missing or malformed Authorization header.'));
  }

  try {
    const decoded = jwt.verify(token, env.ADMIN_JWT_SECRET);
    if (!decoded || decoded.role !== 'admin') {
      return next(new AppError(401, 'INVALID_TOKEN', 'The provided admin session token is invalid.'));
    }
    req.admin = { role: 'admin', adminId: 'admin' };
    return next();
  } catch (_err) {
    return next(new AppError(401, 'INVALID_TOKEN', 'The provided admin session token is invalid or expired.'));
  }
}

module.exports = adminAuthMiddleware;
