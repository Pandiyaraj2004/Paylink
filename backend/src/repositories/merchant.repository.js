const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access ONLY for merchants/{merchantId}. No business
 * logic here — see services/auth.service.js (and later merchant.service.js)
 * for the rules around when/how these are used.
 */
function db() {
  return admin.firestore();
}

async function createMerchant(merchantId, data) {
  await db().collection('merchants').doc(merchantId).set(data);
  return { id: merchantId, ...data };
}

async function getMerchantById(merchantId) {
  const snap = await db().collection('merchants').doc(merchantId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function findMerchantByUserId(userId) {
  const querySnap = await db().collection('merchants').where('userId', '==', userId).limit(1).get();
  if (querySnap.empty) return null;
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function updateMerchant(merchantId, patch) {
  await db().collection('merchants').doc(merchantId).update(patch);
  return getMerchantById(merchantId);
}

/**
 * Resolves a public page slug to its merchant via the `pageSlugs/{slug}`
 * lookup collection (Section 19.2 — exists purely to enforce slug
 * uniqueness, keyed by the slug itself as the document ID).
 */
async function getMerchantBySlug(slug) {
  const slugSnap = await db().collection('pageSlugs').doc(slug).get();
  if (!slugSnap.exists) return null;
  const { merchantId } = slugSnap.data();
  if (!merchantId) return null;
  return getMerchantById(merchantId);
}

/**
 * Atomically reserves a unique `pageSlugs/{slug}` lookup doc (Section 19.2:
 * "read pageSlugs/{slug}, and only proceed if it doesn't already exist").
 * Falls back to `${baseSlug}-2`, `-3`, ... on collision — practically always
 * resolves on the first attempt.
 */
async function reservePageSlug(merchantId, baseSlug) {
  const database = db();
  let candidate = baseSlug;
  let suffix = 2;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slugRef = database.collection('pageSlugs').doc(candidate);
    // eslint-disable-next-line no-await-in-loop
    const reserved = await database.runTransaction(async (tx) => {
      const snap = await tx.get(slugRef);
      if (snap.exists) return false;
      tx.set(slugRef, { merchantId });
      return true;
    });
    if (reserved) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  throw new Error(`Could not reserve a unique page slug for base "${baseSlug}".`);
}

module.exports = {
  createMerchant,
  getMerchantById,
  findMerchantByUserId,
  updateMerchant,
  getMerchantBySlug,
  reservePageSlug,
};
