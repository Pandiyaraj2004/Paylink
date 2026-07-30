const AppError = require('./AppError');

/**
 * Enforces "authenticated (owner)" access checks used across the
 * merchant/product endpoints (master-doc.md Section 22.2, 22.3).
 * Throws a 403 AppError if the given merchant doesn't belong to uid.
 */
function assertOwnership(merchant, uid) {
  if (!merchant || merchant.userId !== uid) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this merchant.');
  }
}

module.exports = { assertOwnership };
