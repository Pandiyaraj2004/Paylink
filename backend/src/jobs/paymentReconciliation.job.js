const { admin } = require('../config/firebase');
const surfboardService = require('../services/surfboard.service');
const paymentService = require('../services/payment.service');
const env = require('../config/env');

/**
 * master-doc.md Section 23.4: "PayLink additionally reconciles any
 * authorized-but-not-yet-captured payment via a scheduled polling job
 * (jobs/) after a configurable timeout, to avoid orders being stuck
 * indefinitely." None of the three files Section 20.1's folder tree names
 * (`recurringBilling.job.js`, `settlementPayout.job.js`,
 * `notificationRetry.job.js`) match this concern — `recurringBilling.job.js`
 * has no corresponding feature spec anywhere else in master-doc.md
 * (PayLink is one-time-payment only per Section 25's own framing;
 * "recurring billing" only ever appears as an FR-21/roadmap future item),
 * so it's left untouched rather than repurposed. This file is added new.
 *
 * SCOPING NOTE: this is exported as a plain callable function, NOT wired to
 * any scheduler. No cron/scheduling dependency (e.g. node-cron,
 * node-schedule) is installed in this project, and adding one is out of
 * scope for this backend-only phase. A future session can invoke
 * `reconcileAuthorizedPayments()` from whatever scheduling mechanism is
 * chosen later (in-process cron, a cloud scheduler HTTP trigger, etc.) —
 * this file only implements the polling logic itself, ready to be called.
 *
 * Real Surfboard flow: polls `GET /orders/:orderId/status`
 * (api-md/orders-fetch-order-status.md) using the Surfboard orderId stored
 * on the PayLink order at `payment.surfboardOrderId` (set by
 * payment.service.js's createPayment), then — if a terminal orderStatus is
 * now available — feeds a synthesized event through the exact same
 * idempotent webhook-reconciliation path (`payment.service.js`'s
 * `processSurfboardWebhookEvent`) that a real webhook delivery would use,
 * so this job can never cause a different state transition than the
 * webhook itself would, only recover from one never arriving at all.
 */

function db() {
  return admin.firestore();
}

function getTimeoutMinutes(override) {
  if (override != null) return override;
  return env.PAYMENT_RECONCILIATION_TIMEOUT_MINUTES;
}

/**
 * Finds orders whose payment is stuck at `initiated` (the state between
 * Surfboard's synchronous order+payment creation and its webhook-confirmed
 * outcome) older than `timeoutMinutes`. Uses a collection-group query
 * (Section 19.4) since this job is platform-wide, not scoped to one
 * merchant — this requires a composite collection-group index on
 * (`payment.status`, `createdAt`) to be configured in
 * `firestore.indexes.json` before this can run against a real project (no
 * such file exists yet anywhere in this repo, so none is added here).
 */
async function findStaleAuthorizedOrders(timeoutMinutes) {
  const cutoff = new Date(Date.now() - getTimeoutMinutes(timeoutMinutes) * 60 * 1000);

  const snap = await db()
    .collectionGroup('orders')
    .where('payment.status', '==', 'initiated')
    .where('createdAt', '<=', cutoff)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    merchantId: doc.ref.parent.parent.id,
    ...doc.data(),
  }));
}

/**
 * Maps Surfboard's real terminal `orderStatus` values
 * (web-guides/payment-lifecycle.md) to the webhook `eventType` that would
 * have reported the same outcome, so this job can reuse
 * processSurfboardWebhookEvent's exact reconciliation logic. Returns null
 * for a still-open/non-terminal status (`PENDING`,
 * `PARTIAL_PAYMENT_COMPLETED`, `PAYMENT_PROCESSED`) — nothing to reconcile
 * yet, leave it for the next poll (or a real webhook).
 */
function mapOrderStatusToEventType(orderStatus) {
  if (orderStatus === 'PAYMENT_COMPLETED') return 'order.paymentcompleted';
  if (orderStatus === 'PAYMENT_CANCELLED') return 'order.paymentcancelled';
  return null;
}

async function reconcileAuthorizedPayments(timeoutMinutes) {
  const staleOrders = await findStaleAuthorizedOrders(timeoutMinutes);
  const results = [];

  for (const order of staleOrders) {
    const surfboardOrderId = order.payment?.surfboardOrderId;
    if (!surfboardOrderId) {
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const statusResult = await surfboardService.getOrderStatus({ orderId: surfboardOrderId });
      const eventType = mapOrderStatusToEventType(statusResult.orderStatus);

      if (!eventType) {
        results.push({
          orderId: order.id,
          merchantId: order.merchantId,
          reconciled: false,
          error: `Order still ${statusResult.orderStatus} at Surfboard — will retry next poll.`,
        });
        // eslint-disable-next-line no-continue
        continue;
      }

      const payment = (statusResult.payments || [])[0] || {};

      // eslint-disable-next-line no-await-in-loop
      await paymentService.processSurfboardWebhookEvent({
        eventType,
        // Deterministic, stable eventId so re-running this job before the
        // real webhook ever arrives is itself idempotent, same guarantee
        // Section 25.9 requires of webhook redelivery.
        metadata: { eventId: `reconcile_${surfboardOrderId}_${eventType}` },
        data: {
          orderId: surfboardOrderId,
          referenceId: order.id,
          paymentId: payment.paymentId || order.payment?.surfboardPaymentId,
          paymentStatus: payment.paymentStatus,
          paymentMethod: payment.paymentMethod,
        },
      });
      results.push({ orderId: order.id, merchantId: order.merchantId, reconciled: true });
    } catch (err) {
      results.push({ orderId: order.id, merchantId: order.merchantId, reconciled: false, error: err.message });
    }
  }

  return results;
}

module.exports = { reconcileAuthorizedPayments, findStaleAuthorizedOrders };
