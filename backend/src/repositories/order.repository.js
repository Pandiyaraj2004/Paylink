const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access for merchants/{merchantId}/orders. Originally
 * read-only helpers used by the AI Earnings Assistant (Section 10.2) and
 * the Dashboard summary (Section 14.3) — Phase 6 (Order Engine, Section
 * 22.4) adds create/read/update/list here too. No refund-subcollection or
 * payment-reconciliation logic belongs in this file; that's
 * repositories/payment.repository.js's concern (Section 19.2's
 * paymentsIndex/processedWebhookEvents/refunds).
 */
function db() {
  return admin.firestore();
}

function ordersCollection(merchantId) {
  return db().collection('merchants').doc(merchantId).collection('orders');
}

/**
 * `ordersIndex/{orderId} -> { merchantId }` — a denormalized lookup
 * collection analogous to the documented `paymentsIndex/{surfboardPaymentId}`
 * (Section 19.2). Not itself listed in Section 19.2, but necessary for the
 * same structural reason paymentsIndex is: several documented endpoints
 * (`POST /api/payments/create`, `POST /api/payments/:id/refund`,
 * `GET /api/orders/:id/receipt`, `GET /api/orders/:id/bill-pdf`,
 * `PATCH /api/orders/:id/fulfil`) are addressed by `orderId` alone, with no
 * `merchantId` in their path or body — since orders live under
 * `merchants/{merchantId}/orders/{orderId}`, resolving orderId -> merchantId
 * needs exactly this kind of one-read lookup rather than an unindexed
 * cross-merchant scan. Written once, at order creation, alongside the order
 * itself.
 */
function orderIndexRef(orderId) {
  return db().collection('ordersIndex').doc(orderId);
}

/**
 * Creates a new order plus its `ordersIndex` lookup entry atomically (a
 * batch, not a transaction — there's no read-then-decide step here, just
 * two independent writes that should land together).
 */
async function createOrder(merchantId, data) {
  const docRef = ordersCollection(merchantId).doc();
  const record = { ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() };

  const batch = db().batch();
  batch.set(docRef, record);
  batch.set(orderIndexRef(docRef.id), { merchantId });
  await batch.commit();

  return { id: docRef.id, ...record };
}

/** Resolves `orderId` -> `merchantId` via the ordersIndex lookup above. */
async function resolveMerchantIdForOrder(orderId) {
  const snap = await orderIndexRef(orderId).get();
  return snap.exists ? snap.data().merchantId : null;
}

async function getOrderById(merchantId, orderId) {
  const snap = await ordersCollection(merchantId).doc(orderId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function updateOrder(merchantId, orderId, patch) {
  const docRef = ordersCollection(merchantId).doc(orderId);
  await docRef.update(patch);
  const snap = await docRef.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Paginated order listing for GET /api/merchants/:id/orders (Section 22.4).
 * `status`/`from`/`to` are optional filters; `page`/`pageSize` are 1-indexed.
 */
async function listOrders(merchantId, { status, from, to, customerRef, page = 1, pageSize = 20 } = {}) {
  let query = ordersCollection(merchantId);
  if (status) query = query.where('status', '==', status);
  if (from) query = query.where('createdAt', '>=', from);
  if (to) query = query.where('createdAt', '<=', to);
  // Section 14.9's "Orders (filtered by that customer)" nav from the
  // Customers page — same customerRef hashCustomerRef() already writes on
  // every order (order.service.js), just filtered on read here.
  if (customerRef) query = query.where('customerRef', '==', customerRef);
  query = query.orderBy('createdAt', 'desc');

  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  const offset = (page - 1) * pageSize;
  const pagedSnap = await query.offset(offset).limit(pageSize).get();
  const items = pagedSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return { items, total, page, pageSize };
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

/**
 * Fetches every order for a merchant, unfiltered — needed by Customers
 * (Section 14.9) and Reviews (14.11), both of which aggregate across a
 * merchant's full history rather than a single month like
 * getOrdersInRange/getMerchantSummary do. Deliberately unpaginated, same
 * posture as getOrdersInRange: fine for this app's scale, but a merchant
 * with a genuinely large order history would eventually need a real
 * aggregation (denormalized summary doc) instead of a full scan.
 */
async function getAllOrders(merchantId) {
  const snap = await ordersCollection(merchantId).get();
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

module.exports = {
  getOrdersInRange,
  getAllOrders,
  getOrderCountForMerchant,
  createOrder,
  resolveMerchantIdForOrder,
  getOrderById,
  updateOrder,
  listOrders,
};
