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

module.exports = {
  createMerchant,
  getMerchantById,
  findMerchantByUserId,
  updateMerchant,
  getMerchantBySlug,
};
