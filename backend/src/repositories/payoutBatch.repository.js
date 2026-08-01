const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access for the Payout & Settlement Management module.
 * Deliberately a SEPARATE file from repositories/payout.repository.js, which
 * owns the entrepreneur's `merchants/{id}/payout/details` Bank Details
 * subcollection (Section 14.12/19.2) — this file owns the payout BATCH
 * ledger instead: which paid orders have been bundled into a payable amount,
 * whether that amount is still accumulating, ready to pay, or already paid,
 * and the per-merchant cursor tracking which orders have already been
 * claimed by a batch so a recalculation run never double-counts one.
 *
 * Two top-level collections, both new, neither touching any existing order/
 * merchant document:
 *   - `payoutBatches/{payoutId}` — one doc per calculated payout batch.
 *   - `payoutCursors/{merchantId}` — one doc per merchant, `{ lastCutoffMillis }`,
 *     the watermark past which orders haven't been batched yet.
 */
function db() {
  return admin.firestore();
}

function payoutBatchesCollection() {
  return db().collection('payoutBatches');
}

function payoutCursorsCollection() {
  return db().collection('payoutCursors');
}

/**
 * `createdAt` sort key for the in-application-code sort listBatchesForMerchant/
 * listAllBatches use below — see their own comment for why Firestore's own
 * `.orderBy()` is deliberately avoided on a filtered query here.
 */
function createdAtMillis(batch) {
  const value = batch.createdAt;
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

async function getCursor(merchantId) {
  const snap = await payoutCursorsCollection().doc(merchantId).get();
  return snap.exists ? snap.data().lastCutoffMillis || 0 : 0;
}

async function setCursor(merchantId, lastCutoffMillis) {
  await payoutCursorsCollection().doc(merchantId).set({ lastCutoffMillis }, { merge: true });
}

async function createBatch(data) {
  const docRef = payoutBatchesCollection().doc();
  const record = {
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await docRef.set(record);
  return { id: docRef.id, ...record };
}

async function updateBatch(id, patch) {
  const docRef = payoutBatchesCollection().doc(id);
  await docRef.update({ ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const snap = await docRef.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getBatchById(id) {
  const snap = await payoutBatchesCollection().doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Every merchant's `pending` batches — the recheck step of a recalculation run. */
async function listPendingBatches() {
  const snap = await payoutBatchesCollection().where('status', '==', 'pending').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/** Every batch, unpaginated — internal aggregation only (admin summary), never returned directly to a client. */
async function getAllBatches() {
  const snap = await payoutBatchesCollection().get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * GET /api/merchants/:id/payouts — the merchant's own payout history,
 * paginated. LIVE-VERIFIED: combining the `merchantId` equality filter
 * with `.orderBy('createdAt')` 500s until a composite Firestore index is
 * deployed (`firestore.indexes.json` declares one, but deploying it is a
 * manual `firebase deploy --only firestore:indexes` step outside this
 * codebase's control — see README's Known Gaps for the identical
 * pre-existing issue on Orders/Customers). Deliberately sidestepped here by
 * fetching the (small, per-merchant) matching set with equality filters
 * only — auto-indexed by Firestore, no deploy needed — and sorting/paging
 * in application code instead, the same "aggregate in application code"
 * trade-off admin.repository.js already documents for its own queries.
 */
async function listBatchesForMerchant(merchantId, { status, page = 1, pageSize = 20 } = {}) {
  let query = payoutBatchesCollection().where('merchantId', '==', merchantId);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const items = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => createdAtMillis(b) - createdAtMillis(a));

  const total = items.length;
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), total, page, pageSize };
}

/** Every batch for one merchant, unpaginated — used for the Payouts page's summary totals. */
async function getAllBatchesForMerchant(merchantId) {
  const snap = await payoutBatchesCollection().where('merchantId', '==', merchantId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * GET /api/admin/payouts — Settlement Management's table, platform-wide.
 * Same composite-index sidestep as listBatchesForMerchant above (see its
 * comment) — equality filters only, sorted/paged in application code.
 */
async function listAllBatches({ status, merchantId, page = 1, pageSize = 20 } = {}) {
  let query = payoutBatchesCollection();
  if (status) query = query.where('status', '==', status);
  if (merchantId) query = query.where('merchantId', '==', merchantId);

  const snap = await query.get();
  const items = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => createdAtMillis(b) - createdAtMillis(a));

  const total = items.length;
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), total, page, pageSize };
}

module.exports = {
  getCursor,
  setCursor,
  createBatch,
  updateBatch,
  getBatchById,
  listPendingBatches,
  getAllBatches,
  listBatchesForMerchant,
  getAllBatchesForMerchant,
  listAllBatches,
};
