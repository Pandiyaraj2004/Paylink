const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access ONLY for merchants/{merchantId}/payout/details
 * (master-doc.md Section 19.2) — deliberately its OWN repository file, not
 * folded into merchant.repository.js, mirroring product.repository.js's
 * "one repository per subcollection" pattern. This subcollection is kept
 * separate from the main merchant document on purpose: the main document is
 * read by the public, unauthenticated storefront query
 * (merchant.service.js's getPublicPage), and bank/settlement details must
 * never be reachable through that same read path. No business logic here —
 * see services/merchant.service.js's updateMerchantPayout/getMerchantPayout.
 */
function db() {
  return admin.firestore();
}

function payoutDetailsRef(merchantId) {
  return db().collection('merchants').doc(merchantId).collection('payout').doc('details');
}

async function getPayoutDetails(merchantId) {
  const snap = await payoutDetailsRef(merchantId).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Merge-writes the given fields into payout/details. `markCompleted` sets
 * `completedAt` via a server timestamp — callers only pass this the first
 * time the document doesn't already have one, so `completedAt` reflects when
 * Bank Details was first successfully completed (Section 19.2), not the most
 * recent edit.
 */
async function savePayoutDetails(merchantId, patch, markCompleted) {
  const ref = payoutDetailsRef(merchantId);
  const update = { ...patch };
  if (markCompleted) {
    update.completedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await ref.set(update, { merge: true });
  const snap = await ref.get();
  return snap.data();
}

module.exports = { getPayoutDetails, savePayoutDetails };
