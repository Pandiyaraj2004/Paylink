const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access for the Admin Panel (master-doc.md Section 16,
 * 22.9). Ground-up build for Phase 11 — this file previously only had a
 * placeholder comment.
 *
 * Per-merchant/order/dispute CRUD already has its own owner
 * (merchant.repository.js, order.repository.js, payment.repository.js,
 * dispute.repository.js) — this file is reserved for genuinely
 * admin-specific Firestore access: listing across ALL merchants, the
 * platform-wide collection-group views (Section 19.4), the append-only
 * `adminActions` audit trail, and the single `platformSettings/config`
 * document (Section 16.6).
 *
 * Collection-group scope (getAllOrdersAcrossMerchants /
 * getAllRefundsAcrossMerchants): rather than server-side date-range
 * filtering (which would need a collection-group range index explicitly
 * enabled per field — see jobs/paymentReconciliation.job.js's own note on
 * this), these fetch the full collection group and let admin.service.js
 * filter/aggregate in application code. A deliberate MVP-scale trade-off,
 * consistent with this project's existing "client-side filtering over one
 * fetched page" precedent (frontend OrdersTab.tsx) — fine for this
 * project's real data volume, called out here for a future session if that
 * ever changes.
 */
function db() {
  return admin.firestore();
}

function merchantsCollection() {
  return db().collection('merchants');
}

function adminActionsCollection() {
  return db().collection('adminActions');
}

const SETTINGS_DOC_ID = 'config';

function platformSettingsRef() {
  return db().collection('platformSettings').doc(SETTINGS_DOC_ID);
}

/**
 * Firestore batch writes cap out at 500 operations — chunk any delete list
 * larger than that into multiple sequential commits rather than one that
 * would simply fail. Test/demo merchants are nowhere near this size today;
 * this is a correctness safeguard, not a scale optimization.
 */
const BATCH_CHUNK_SIZE = 400;

async function commitInChunks(database, refs) {
  for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
    const batch = database.batch();
    refs.slice(i, i + BATCH_CHUNK_SIZE).forEach((ref) => batch.delete(ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

/**
 * The cascade behind DELETE /api/admin/merchants/:id (admin.service.js's
 * deleteMerchant — see that file for the "zero real paid orders" guard this
 * is only ever called after). Removes every piece of Firestore data this
 * merchant's own working code paths ever write, across every collection
 * that references it:
 *
 *   - merchants/{id}/products, /gallery, /payout/details, /orders (each
 *     with its own /refunds subcollection), plus each order's `ordersIndex`
 *     lookup entry (order.repository.js's own index collection)
 *   - payoutBatches + payoutCursors/{id} (Payout & Settlement Management)
 *   - disputes filed against this merchant
 *   - pageSlugs/{slug} (frees the slug for reuse)
 *   - users/{userId}/notifications (this store's notification history) —
 *     NOT users/{userId} itself: per this feature's explicit scope, deleting
 *     a merchant never touches the owning Firebase Auth account or its user
 *     doc, only this merchant's own data.
 *   - the merchants/{id} document itself, last.
 *
 * Deliberately does NOT touch `paymentsIndex` (nothing in this codebase
 * actually ever writes to that collection — `createPaymentIndex` is defined
 * and exported but has no real call site — so there is never anything there
 * to clean up) or `processedWebhookEvents` (pure eventId-keyed idempotency
 * markers with no merchant-identifying content, harmless to leave behind).
 */
async function deleteMerchantData(merchant) {
  const database = db();
  const merchantId = merchant.id;
  const merchantRef = merchantsCollection().doc(merchantId);
  const refs = [];

  const productsSnap = await merchantRef.collection('products').get();
  productsSnap.docs.forEach((doc) => refs.push(doc.ref));

  const ordersSnap = await merchantRef.collection('orders').get();
  for (const orderDoc of ordersSnap.docs) {
    // eslint-disable-next-line no-await-in-loop
    const refundsSnap = await orderDoc.ref.collection('refunds').get();
    refundsSnap.docs.forEach((doc) => refs.push(doc.ref));
    refs.push(orderDoc.ref);
    refs.push(db().collection('ordersIndex').doc(orderDoc.id));
  }

  const gallerySnap = await merchantRef.collection('gallery').get();
  gallerySnap.docs.forEach((doc) => refs.push(doc.ref));

  refs.push(merchantRef.collection('payout').doc('details'));

  const payoutBatchesSnap = await db().collection('payoutBatches').where('merchantId', '==', merchantId).get();
  payoutBatchesSnap.docs.forEach((doc) => refs.push(doc.ref));
  refs.push(db().collection('payoutCursors').doc(merchantId));

  const disputesSnap = await db().collection('disputes').where('merchantId', '==', merchantId).get();
  disputesSnap.docs.forEach((doc) => refs.push(doc.ref));

  if (merchant.userId) {
    const notificationsSnap = await db().collection('users').doc(merchant.userId).collection('notifications').get();
    notificationsSnap.docs.forEach((doc) => refs.push(doc.ref));
  }

  if (merchant.pageSlug) {
    refs.push(db().collection('pageSlugs').doc(merchant.pageSlug));
  }

  refs.push(merchantRef);

  await commitInChunks(database, refs);
  return { deletedDocCount: refs.length };
}

/**
 * GET /api/admin/merchants (master-doc.md Section 22.9). Only `status` is
 * server-side filtered — 22.9 documents no `category`/signup-date query
 * params for this endpoint (16.2's "filterable... by category, signup
 * date" is satisfied client-side by the frontend table, the same pattern
 * OrdersTab.tsx already uses for its own filters).
 */
async function listMerchants({ status, page = 1, pageSize = 20 } = {}) {
  let query = merchantsCollection();
  if (status) query = query.where('status', '==', status);
  query = query.orderBy('createdAt', 'desc');

  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  const offset = (page - 1) * pageSize;
  const pagedSnap = await query.offset(offset).limit(pageSize).get();
  const items = pagedSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return { items, total, page, pageSize };
}

/** Every merchant, unpaginated — internal aggregation use only (Reports/Analytics/Refunds joins), never returned directly to a client. */
async function getAllMerchants() {
  const snap = await merchantsCollection().get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function countMerchantsByStatus(statuses) {
  const snap = await merchantsCollection().where('status', 'in', statuses).count().get();
  return snap.data().count;
}

async function countRecentMerchants(since) {
  const snap = await merchantsCollection().where('createdAt', '>=', since).count().get();
  return snap.data().count;
}

/**
 * Platform-wide orders (Section 19.4's collection-group query example,
 * applied here for real). Each item is annotated with `merchantId`, derived
 * the same way jobs/paymentReconciliation.job.js's
 * findStaleAuthorizedOrders already does (`doc.ref.parent.parent.id` — the
 * orders subcollection's parent document is the owning merchant).
 */
async function getAllOrdersAcrossMerchants() {
  const snap = await db().collectionGroup('orders').get();
  return snap.docs.map((doc) => ({ id: doc.id, merchantId: doc.ref.parent.parent.id, ...doc.data() }));
}

/**
 * Platform-wide refunds (`merchants/{merchantId}/orders/{orderId}/refunds/{refundId}`,
 * Section 19.2) via collection-group query. `doc.ref.parent` is the refunds
 * subcollection, `.parent` from there is the order document, and one more
 * `.parent.parent` reaches the owning merchant document — one level deeper
 * than getAllOrdersAcrossMerchants above since refunds nest one level under
 * orders.
 */
async function getAllRefundsAcrossMerchants() {
  const snap = await db().collectionGroup('refunds').get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    orderId: doc.ref.parent.parent.id,
    merchantId: doc.ref.parent.parent.parent.parent.id,
    ...doc.data(),
  }));
}

/**
 * `adminActions/{actionId}` (Section 19.2) — append-only by Firestore
 * Security Rule (not enforced here in application code, since the Admin SDK
 * bypasses rules entirely; the rule itself is the real enforcement,
 * declared alongside the rest of this project's Firestore Security Rules).
 * Every mutating admin.service.js action writes one of these, which is
 * exactly what the System page's Logs tab (Section 16.5) reads back.
 */
async function createAdminAction({ adminId, actionType, targetId, notes }) {
  const docRef = adminActionsCollection().doc();
  const record = {
    adminId,
    actionType,
    targetId,
    notes: notes || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await docRef.set(record);
  return { id: docRef.id, ...record };
}

/** GET /api/admin/logs (Section 16.5) — paginated, newest first. */
async function listAdminActions({ page = 1, pageSize = 50 } = {}) {
  const query = adminActionsCollection().orderBy('createdAt', 'desc');

  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  const offset = (page - 1) * pageSize;
  const pagedSnap = await query.offset(offset).limit(pageSize).get();
  const items = pagedSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return { items, total, page, pageSize };
}

// Genuinely minimal Phase 11 Settings (Section 16.6) — see admin.service.js
// for what each field actually gates. Defaults are merged under whatever's
// stored so a brand-new deployment (no platformSettings/config doc yet)
// behaves sensibly rather than crashing or reading `undefined`.
const DEFAULT_PLATFORM_SETTINGS = {
  platformFeePercent: 2.5,
  refundRateAlertThreshold: 0.2,
  maintenanceMode: false,
  refundFlaggingEnabled: true,
};

async function getPlatformSettings() {
  const snap = await platformSettingsRef().get();
  return { ...DEFAULT_PLATFORM_SETTINGS, ...(snap.exists ? snap.data() : {}) };
}

async function updatePlatformSettings(patch) {
  await platformSettingsRef().set(patch, { merge: true });
  return getPlatformSettings();
}

module.exports = {
  listMerchants,
  getAllMerchants,
  countMerchantsByStatus,
  countRecentMerchants,
  getAllOrdersAcrossMerchants,
  getAllRefundsAcrossMerchants,
  deleteMerchantData,
  createAdminAction,
  listAdminActions,
  getPlatformSettings,
  updatePlatformSettings,
  DEFAULT_PLATFORM_SETTINGS,
};
