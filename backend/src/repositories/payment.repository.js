const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access for the payment-adjacent collections (Section
 * 20.1/20.2, 19.2): `paymentsIndex/{surfboardPaymentId}`,
 * `processedWebhookEvents/{eventId}`, and each order's
 * `refunds/{refundId}` subcollection. Order-document CRUD itself lives in
 * order.repository.js — this file only touches the order document when a
 * transaction here (webhook reconciliation, refund-balance check) needs to
 * read/write it alongside those other collections in the same atomic unit.
 *
 * The two transaction functions below (`runWebhookTransaction`,
 * `createRefundIfWithinBalance`) hand a live `tx` + document refs to a
 * caller-supplied function so the *business logic* of what to write stays
 * in payment.service.js/refund.service.js (Section 20.2) — this file only
 * owns the transaction mechanics (which docs to read, idempotency
 * bookkeeping, contention).
 */
function db() {
  return admin.firestore();
}

function ordersCollection(merchantId) {
  return db().collection('merchants').doc(merchantId).collection('orders');
}

function orderRef(merchantId, orderId) {
  return ordersCollection(merchantId).doc(orderId);
}

function refundsCollection(merchantId, orderId) {
  return orderRef(merchantId, orderId).collection('refunds');
}

function paymentIndexRef(surfboardPaymentId) {
  return db().collection('paymentsIndex').doc(surfboardPaymentId);
}

/**
 * `ordersIndex/{orderId} -> { merchantId }` — the same lookup collection
 * order.repository.js owns and writes at order-creation time (see its own
 * `orderIndexRef`/`resolveMerchantIdForOrder`). Read-only here: the real
 * Surfboard webhook payload's `data.referenceId` IS PayLink's own orderId
 * (set at order/refund-order creation, see payment.service.js), so
 * resolving merchantId for the webhook transaction needs this exact same
 * collection, read transactionally alongside the order doc + refunds
 * below — the same reason payment.repository.js already reads/writes the
 * order document directly inside these transactions instead of going
 * through order.repository.js.
 */
function ordersIndexRef(orderId) {
  return db().collection('ordersIndex').doc(orderId);
}

function processedEventRef(eventId) {
  return db().collection('processedWebhookEvents').doc(eventId);
}

async function createPaymentIndex(surfboardPaymentId, { merchantId, orderId }) {
  await paymentIndexRef(surfboardPaymentId).set({ merchantId, orderId });
}

async function getPaymentIndex(surfboardPaymentId) {
  const snap = await paymentIndexRef(surfboardPaymentId).get();
  return snap.exists ? snap.data() : null;
}

async function listRefunds(merchantId, orderId) {
  const snap = await refundsCollection(merchantId, orderId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function updateRefund(merchantId, orderId, refundId, patch) {
  const docRef = refundsCollection(merchantId, orderId).doc(refundId);
  await docRef.update(patch);
  const snap = await docRef.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * The webhook-processing transaction (master-doc.md Section 19.3, 25.9):
 * checks `processedWebhookEvents/{eventId}` for idempotency, resolves
 * `ordersIndex/{orderId}` to find the merchant in one read (`orderId` here
 * is already PayLink's own id, taken from the real webhook's
 * `data.referenceId` — see payment.service.js), then reads the order + its
 * refunds before handing control to `applyFn` — defined by
 * payment.service.js — which performs whatever `tx.update` calls the event
 * type calls for (Section 25's payment/refund reconciliation). This
 * function commits the `processedWebhookEvents` marker itself, after
 * `applyFn` returns, so a crash mid-`applyFn` never marks an event
 * processed without also having applied it.
 *
 * Returns one of:
 *   { duplicate: true }                — already processed, no-op
 *   { indexMissing: true }              — unknown orderId (ordersIndex miss)
 *   { orderMissing: true }              — ordersIndex pointed at a
 *                                          now-missing order
 *   { duplicate: false, merchantId, orderId } — applied successfully
 */
async function runWebhookTransaction(eventId, orderId, applyFn) {
  return db().runTransaction(async (tx) => {
    const processedRef = processedEventRef(eventId);
    const processedSnap = await tx.get(processedRef);
    if (processedSnap.exists) {
      return { duplicate: true };
    }

    const indexSnap = await tx.get(ordersIndexRef(orderId));
    if (!indexSnap.exists) {
      return { indexMissing: true };
    }
    const { merchantId } = indexSnap.data();

    const oRef = orderRef(merchantId, orderId);
    const orderSnap = await tx.get(oRef);
    if (!orderSnap.exists) {
      return { orderMissing: true };
    }
    const order = { id: orderSnap.id, ...orderSnap.data() };

    const refundsRef = refundsCollection(merchantId, orderId);
    const refundsSnap = await tx.get(refundsRef);
    const refunds = refundsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    await applyFn({
      tx,
      order,
      orderRef: oRef,
      refunds,
      refundsCollectionRef: refundsRef,
      merchantId,
      orderId,
      serverTimestampValue: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(processedRef, { processedAt: admin.firestore.FieldValue.serverTimestamp() });

    return { duplicate: false, merchantId, orderId };
  });
}

/**
 * Refund-balance-safe creation (master-doc.md Section 19.3): inside a
 * single transaction, reads the order's `totalAmount` plus every existing
 * refund doc, computes the remaining refundable balance (counting both
 * `pending` and `completed` refunds against it, since a pending refund is
 * already committed money from the entrepreneur's perspective), and only
 * creates the new refund doc — status `pending` — if `amount` doesn't
 * exceed what's left. Returns `{ exceeded: true, remaining, order }` rather
 * than throwing when the balance check fails, so the caller
 * (refund.service.js) can map that to a clean 400 VALIDATION_ERROR instead
 * of a generic transaction failure.
 */
async function createRefundIfWithinBalance(merchantId, orderId, { amount, reason }) {
  return db().runTransaction(async (tx) => {
    const oRef = orderRef(merchantId, orderId);
    const orderSnap = await tx.get(oRef);
    if (!orderSnap.exists) {
      return { orderMissing: true };
    }
    const order = { id: orderSnap.id, ...orderSnap.data() };

    const refundsRef = refundsCollection(merchantId, orderId);
    const refundsSnap = await tx.get(refundsRef);
    const existingRefunds = refundsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const committedRefunds = existingRefunds
      .filter((r) => r.status === 'completed' || r.status === 'pending')
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    const remaining = Number((order.totalAmount - committedRefunds).toFixed(2));

    if (amount > remaining) {
      return { exceeded: true, remaining, order };
    }

    const refundDocRef = refundsRef.doc();
    const data = {
      amount,
      reason: reason || null,
      status: 'pending',
      // Not part of the documented Section 19.2 refund schema, but
      // necessary: the webhook only carries a surfboardRefundId, and an
      // order can have more than one refund in flight, so this is how the
      // webhook handler (applyWebhookEvent in payment.service.js) knows
      // which refund subdocument a refund.completed/refund.failed event
      // belongs to.
      surfboardRefundId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    tx.set(refundDocRef, data);

    return { exceeded: false, remaining, order, refund: { id: refundDocRef.id, ...data } };
  });
}

module.exports = {
  orderRef,
  refundsCollection,
  createPaymentIndex,
  getPaymentIndex,
  listRefunds,
  updateRefund,
  runWebhookTransaction,
  createRefundIfWithinBalance,
};
