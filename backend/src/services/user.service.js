const userRepository = require('../repositories/user.repository');
const AppError = require('../utils/AppError');

const MAX_TOKEN_LEN = 4096; // generous — real FCM tokens are ~150-200 chars, this is just a sanity backstop

/**
 * POST /api/users/me/fcm-token (Phase 13, master-doc.md Section 27 push).
 * Registers the caller's own FCM device token for push delivery. No
 * merchant/ownership check is needed — this only ever touches the
 * authenticated caller's own `users/{uid}` document, resolved from the
 * verified Firebase ID token (auth.middleware), never a client-supplied id.
 */
async function registerFcmToken(uid, token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'token is required.');
  }
  if (token.length > MAX_TOKEN_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `token must be at most ${MAX_TOKEN_LEN} characters.`);
  }

  await userRepository.addFcmToken(uid, token.trim());
  return { registered: true };
}

module.exports = { registerFcmToken };
