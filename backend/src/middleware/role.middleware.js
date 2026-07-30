const AppError = require('../utils/AppError');

/**
 * Role-based access guard (master-doc.md Section 20.1/20.3 step 4, 24.3).
 * Checks `req.user.role` — sourced from the verified Firebase ID token's
 * custom claims, which auth.middleware already spreads onto `req.user` —
 * against the route's required role(s).
 *
 * Per Section 24.3, only `admin`/`senior_admin` are ever set as Firebase
 * custom claims; any authenticated user without one of those claims is the
 * implicit default `entrepreneur` role (the only other role capable of
 * signing in at all today — `customer` accounts never authenticate, per
 * Section 15's "fully public, no login required" customer pages). This
 * keeps the check a pure token read, with no extra Firestore lookup on
 * every request.
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
