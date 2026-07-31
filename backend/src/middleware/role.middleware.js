const AppError = require('../utils/AppError');

/**
 * Role-based access guard (master-doc.md Section 20.1/20.3 step 4). Checks
 * `req.user.role` — sourced from the verified Firebase ID token, which
 * auth.middleware already spreads onto `req.user` — against the route's
 * required role(s).
 *
 * Firebase-authenticated users only ever carry the `entrepreneur` role
 * (Section 19.2: `users.role` is `entrepreneur | customer`, and `customer`
 * accounts never authenticate per Section 15's "fully public, no login
 * required" customer pages), so every call site today is
 * `requireRole('entrepreneur')` and the `role` default below only ever
 * matters as a defensive fallback. Admin is a completely separate auth
 * system (Section 24.4-24.6: Access Code + Password, its own JWT) gated by
 * adminAuth.middleware.js instead — this function has no knowledge of admin
 * at all.
 */
function requireRole(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return next(new AppError(401, 'INVALID_TOKEN', 'Authentication required.'));
    }

    const role = req.user.role || 'entrepreneur';

    if (!allowedRoles.includes(role)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'));
    }

    return next();
  };
}

module.exports = { requireRole };
