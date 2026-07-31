const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { admin } = require('../config/firebase');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const userRepository = require('../repositories/user.repository');
const merchantRepository = require('../repositories/merchant.repository');

// How long an admin session token is valid for before re-prompting for the
// Access Code + Password (master-doc.md Section 24.5: "short expiry...
// re-prompting... rather than a silent refresh").
const ADMIN_TOKEN_EXPIRES_IN = '2h';

/**
 * Handles POST /api/auth/session business logic (Section 19.2 / 22.1):
 * given a verified Firebase token's uid/email, ensures matching
 * users/{uid} and merchants/{merchantId} documents exist.
 *
 * Existing-user merchant lookup: rather than an extra Firestore query
 * (merchants where userId == uid) on every session call, we store
 * merchantId directly on the user doc at creation time and read it back
 * as a single cheap doc.get(). We still fall back to the
 * findMerchantByUserId query for any legacy/edge-case user doc that
 * doesn't have merchantId stored, so this stays backward compatible.
 */
async function handleSession(decodedToken) {
  const { uid, email } = decodedToken;
  const existingUser = await userRepository.getUserById(uid);

  if (!existingUser) {
    const merchantId = uuidv4();

    await userRepository.createUser(uid, {
      email,
      authProvider: decodedToken.firebase?.sign_in_provider || 'password',
      role: 'entrepreneur',
      emailVerified: !!decodedToken.email_verified,
      merchantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await merchantRepository.createMerchant(merchantId, {
      userId: uid,
      businessName: '',
      tagline: null,
      category: '',
      status: 'pending_setup',
      surfboardSubmerchantId: null,
      pageSlug: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { isNewUser: true, merchantId, role: 'entrepreneur' };
  }

  let merchantId = existingUser.merchantId || null;
  if (!merchantId) {
    const merchant = await merchantRepository.findMerchantByUserId(uid);
    merchantId = merchant?.id || null;
  }

  return { isNewUser: false, merchantId, role: existingUser.role || 'entrepreneur' };
}

/**
 * Constant-time string comparison, guarding against timing attacks on the
 * hardcoded admin credential check (master-doc.md Section 16.0/24.4) —
 * mirrors surfboard.service.js's verifyWebhookSignature, which already
 * applies the same crypto.timingSafeEqual care to its own credential-shaped
 * comparison. Buffers of different length can't be passed to
 * timingSafeEqual directly (it throws), so a length mismatch still runs a
 * same-cost dummy comparison before returning false, rather than
 * short-circuiting immediately — the failure path shouldn't be faster just
 * because the input happened to be the wrong length.
 */
function safeCompare(provided, expected) {
  const providedBuf = Buffer.from(String(provided ?? ''), 'utf8');
  const expectedBuf = Buffer.from(String(expected ?? ''), 'utf8');

  if (providedBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(providedBuf, providedBuf);
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Handles POST /api/auth/admin-login (Section 16.0/22.1/24.4): checks
 * { accessCode, password } directly against env.ADMIN_ACCESS_CODE/
 * env.ADMIN_PASSWORD — no Firebase, no `users` doc, no registration path.
 *
 * Both fields are always compared (never short-circuited with `&&`) so a
 * wrong access code and a wrong password take the same amount of time as
 * each other and as a correct access code paired with a wrong password —
 * otherwise timing alone could leak which of the two fields was wrong,
 * defeating the point of the constant-time comparison above.
 *
 * On success, signs a short-lived `{ role: 'admin' }` JWT with
 * ADMIN_JWT_SECRET (Section 24.5) — this is the ONE place PayLink still
 * issues its own token, since Admin has no Firebase session backing it.
 */
async function handleAdminLogin({ accessCode, password }) {
  if (!env.ADMIN_ACCESS_CODE || !env.ADMIN_PASSWORD || !env.ADMIN_JWT_SECRET) {
    // Matches auth.middleware.js's isFirebaseReady()/surfboard.service.js's
    // degrade-gracefully pattern: a missing config is a deploy problem, not
    // a wrong-credentials problem, so it gets its own error rather than
    // being folded into INVALID_CREDENTIALS below.
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Admin authentication is not configured.');
  }

  const accessCodeValid = safeCompare(accessCode, env.ADMIN_ACCESS_CODE);
  const passwordValid = safeCompare(password, env.ADMIN_PASSWORD);

  if (!accessCodeValid || !passwordValid) {
    // Deliberately generic per Section 16.0 — never confirms which field
    // was wrong.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid access code or password.');
  }

  const adminToken = jwt.sign({ role: 'admin' }, env.ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_EXPIRES_IN,
  });

  return { adminToken };
}

module.exports = { handleSession, handleAdminLogin };
