const { v4: uuidv4 } = require('uuid');
const { admin } = require('../config/firebase');
const userRepository = require('../repositories/user.repository');
const merchantRepository = require('../repositories/merchant.repository');

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

module.exports = { handleSession };
