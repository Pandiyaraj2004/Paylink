const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access for `disputes/{disputeId}` (master-doc.md
 * Section 19.2). Top-level, not nested under a merchant — same rationale
 * documented there: the Admin Refunds & Disputes page (Section 16.4) needs
 * to list every open dispute platform-wide with one simple query, instead of
 * a collection-group query across every merchant.
 */
function db() {
  return admin.firestore();
}

function disputesCollection() {
  return db().collection('disputes');
}

/**
 * Creates a new dispute document (Section 15.4's "Contact PayLink Support"
 * escalation path). No index/lookup collection needed here the way orders
 * have `ordersIndex` — disputes are only ever listed platform-wide (Admin,
 * Section 16.4), never fetched by a customer afterward, so there's no
 * "resolve id -> owner" access pattern to support.
 */
async function createDispute(data) {
  const docRef = disputesCollection().doc();
  const record = { ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() };
  await docRef.set(record);
  return { id: docRef.id, ...record };
}

/**
 * GET /api/admin/disputes (master-doc.md Section 16.4) — the Admin Refunds
 * & Disputes page's Disputes tab. Added in Phase 11 alongside the
 * list/resolve actions the doc calls "a real gift" on top of Phase 10's
 * already-shipped createDispute above — no duplicate Firestore access, this
 * is the same `disputes` collection.
 */
async function listDisputes({ status, page = 1, pageSize = 20 } = {}) {
  let query = disputesCollection();
  if (status) query = query.where('status', '==', status);
  query = query.orderBy('createdAt', 'desc');

  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  const offset = (page - 1) * pageSize;
  const pagedSnap = await query.offset(offset).limit(pageSize).get();
  const items = pagedSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return { items, total, page, pageSize };
}

async function getDisputeById(id) {
  const snap = await disputesCollection().doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** PATCH /api/admin/disputes/:id (master-doc.md Section 16.4's resolution action). */
async function updateDispute(id, patch) {
  const docRef = disputesCollection().doc(id);
  await docRef.update(patch);
  const snap = await docRef.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Backs the Admin Dashboard's "open disputes" summary card (Section 16.1). */
async function countDisputesByStatus(statuses) {
  const snap = await disputesCollection().where('status', 'in', statuses).count().get();
  return snap.data().count;
}

module.exports = {
  createDispute,
  listDisputes,
  getDisputeById,
  updateDispute,
  countDisputesByStatus,
};
