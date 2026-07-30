const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access ONLY for merchants/{merchantId}/orders. No
 * business logic here — read-only helpers used by the AI Earnings
 * Assistant (Section 10.2) and the Dashboard summary (Section 14.3).
 * No write/create/refund logic belongs in this file.
 */
function db() {
  return admin.firestore();
}

async function getOrdersInRange(merchantId, from, to) {
  const snap = await db()
    .collection('merchants')
    .doc(merchantId)
    .collection('orders')
    .where('createdAt', '>=', from)
    .where('createdAt', '<=', to)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getOrderCountForMerchant(merchantId) {
  const snap = await db()
    .collection('merchants')
    .doc(merchantId)
    .collection('orders')
    .count()
    .get();

  return snap.data().count;
}

module.exports = { getOrdersInRange, getOrderCountForMerchant };
