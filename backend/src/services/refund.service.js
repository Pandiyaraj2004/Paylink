const orderRepository = require('../repositories/order.repository');
const paymentRepository = require('../repositories/payment.repository');
const merchantRepository = require('../repositories/merchant.repository');
const surfboardService = require('./surfboard.service');
const SurfboardUnavailableError = require('../utils/SurfboardUnavailableError');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');

/**
 * master-doc.md Section 19.3 names this file explicitly ("Refund amount
 * can't exceed remaining balance | Enforced in the backend service layer
 * (refund.service.js)...") even though Section 20.1's folder tree omits it
 * (and lists `refund.controller.js` without a matching `refund.routes.js`
 * or `refund.service.js`). Created here per 19.3's explicit naming, wired
 * into payment.routes.js per the documented `/api/payments/:id/refund`
 * path rather than inventing a new route file.
 */

// Section 29.4: bounded retries on Firestore transaction contention before
// surfacing 409 CONFLICT. The Admin SDK's runTransaction already retries
// internally on ABORTED errors; this outer bound covers the case where
// contention persists past those internal retries too.
const MAX_TRANSACTION_ATTEMPTS = 3;

// Only an order that was actually charged can be refunded — pending/failed/
// cancelled orders never reached Surfboard, so there's nothing to reverse.
// The balance check in createRefundIfWithinBalance alone doesn't catch this
// (an unpaid order's totalAmount still reads as "remaining balance").
const REFUNDABLE_ORDER_STATUSES = ['paid', 'partially_refunded'];

function isContentionError(err) {
  return err?.code === 10 || err?.code === 'aborted' || /ABORTED/i.test(err?.message || '');
}

/**
 * POST /api/payments/:id/refund (master-doc.md Section 22.6). Authenticated
 * (owner). `:id` here is the orderId (see payment.routes.js) — the
 * documented request/response shapes never mention a separate "payment id"
 * distinct from the order, and every other endpoint in this phase
 * (payments/create, receipt, bill-pdf, fulfil) is keyed on orderId too.
 */
async function createRefund({ orderId, uid, amount, reason }) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'amount must be a number > 0.');
  }
  if (reason != null && typeof reason !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'reason must be a string.');
  }

  const merchantId = await orderRepository.resolveMerchantIdForOrder(orderId);
  if (!merchantId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  const merchant = await merchantRepository.getMerchantById(merchantId);
  assertOwnership(merchant, uid);

  const existingOrder = await orderRepository.getOrderById(merchantId, orderId);
  if (!existingOrder) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  if (!REFUNDABLE_ORDER_STATUSES.includes(existingOrder.status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Orders with status "${existingOrder.status}" can't be refunded.`);
  }

  let result;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await paymentRepository.createRefundIfWithinBalance(merchantId, orderId, {
        amount,
        reason: reason || null,
      });
      break;
    } catch (err) {
      if (attempt >= MAX_TRANSACTION_ATTEMPTS || !isContentionError(err)) {
        throw new AppError(409, 'CONFLICT', 'Too many concurrent refund requests on this order — please try again.');
      }
    }
  }

  if (result.orderMissing) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  if (result.exceeded) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `amount exceeds the remaining refundable balance (${result.remaining}).`
    );
  }

  const { order, refund } = result;

  const surfboardOrderId = order.payment?.surfboardOrderId;
  const surfboardPaymentId = order.payment?.surfboardPaymentId;

  try {
    if (!surfboardOrderId) {
      throw new SurfboardUnavailableError('No Surfboard order is on record for this order — nothing to refund against.');
    }

    /**
     * LIVE-VERIFIED (web-guides/void-a-payment.md): "Void — payment
     * completed but not yet settled (same day, before 23:00 UTC). Refund —
     * payment has settled (next day or later)." The CNP return/refund flow
     * below only works on a SETTLED payment; attempting it same-day fails
     * with `PS_0068: Cannot refund amount ... as there are no card payments
     * in the purchase order`. Void has no partial variant, so it's only
     * attempted when this refund covers the ENTIRE, still-unrefunded order
     * (i.e. the first and only refund action on it) — `result.remaining` is
     * the balance before this refund, so `remaining === order.totalAmount`
     * confirms nothing has been refunded yet.
     */
    const isWholeUnrefundedOrder = amount === result.remaining && result.remaining === order.totalAmount;
    let voidStatus = null;

    if (isWholeUnrefundedOrder && surfboardPaymentId) {
      try {
        const voidResult = await surfboardService.voidPayment({ paymentId: surfboardPaymentId });
        voidStatus = voidResult.voidStatus;
      } catch (voidErr) {
        if (voidErr instanceof SurfboardUnavailableError) throw voidErr;
        // Any other void failure (including a network/5xx retry exhaustion)
        // — fall back to the standard refund flow below rather than fail
        // outright, matching Surfboard's own documented CANNOT_VOID
        // handling ("process a full refund as needed").
      }
    }

    if (voidStatus === 'VOIDED' || voidStatus === 'VOID_INITIATED') {
      // A void is immediate and definitive when VOIDED — no return order,
      // no CARD_NP payment, no webhook to wait on, so the order itself is
      // updated to 'refunded' right here (isWholeUnrefundedOrder guarantees
      // this covers the entire order). VOID_INITIATED is async; there's no
      // webhook event type mapped for it (unlike the CNP refund flow's
      // referenceId-based correlation), so both the refund and the order
      // are left as-is (`pending`/`paid`) with no automatic follow-up — a
      // known gap, not silently pretended fixed.
      const status = voidStatus === 'VOIDED' ? 'completed' : 'pending';
      await paymentRepository.updateRefund(merchantId, orderId, refund.id, { status });
      if (voidStatus === 'VOIDED') {
        await orderRepository.updateOrder(merchantId, orderId, { status: 'refunded' });
      }
      return { refundId: refund.id, status };
    }

    // Not eligible for void, or Surfboard returned CANNOT_VOID (already
    // settled, or not yet completed) — standard CNP refund/return-order
    // flow (guides/online-payments/post-payments/return-refunds). Two
    // calls, both via surfboard.service.js:
    //   1. Create a "return" order (type: 'return', purchaseOrderId: the
    //      original purchase's Surfboard orderId).
    //   2. Initiate a payment against that return order with
    //      paymentMethod: 'CARD_NP' and refundProcessingParams.
    // The referenceId is namespaced (`refund:{orderId}:{refundId}`, not just
    // orderId) so the webhook handler can tell a refund event apart from a
    // purchase event on the same order (payment.service.js's
    // parseReferenceId).
    //
    // LIVE-VERIFIED DOC CONFLICT: the return-refunds guide states
    // "orderLines is not needed" when using totalOrderAmount for a return
    // order — the real API disagrees and rejects a return order with
    // totalOrderAmount alone as `ERROR: Mandatory Properties missing
    // orderLines`. A single synthetic orderLines entry covering the full
    // refund amount is sent alongside totalOrderAmount, using the same
    // `amount` field shape (not the guide examples' `itemAmount`, which
    // doesn't match the formal API reference or the already-working
    // purchase-order path in payment.service.js's buildOrderLines).
    const numericCurrency = surfboardService.toNumericCurrency(order.currency);
    const amountMinor = Math.round(amount * 100);

    const returnOrder = await surfboardService.createOrder({
      referenceId: `refund:${orderId}:${refund.id}`,
      type: 'return',
      purchaseOrderId: surfboardOrderId,
      orderLines: [
        {
          id: 'refund',
          name: 'Refund',
          quantity: 1,
          amount: { regular: amountMinor, total: amountMinor, currency: numericCurrency, tax: [] },
        },
      ],
      totalOrderAmount: { regular: amountMinor, total: amountMinor, currency: numericCurrency, tax: [] },
    });

    // LIVE-VERIFIED DOC CONFLICT: `purchasePaymentId` is documented as
    // "required only when the original order was paid partially" (i.e. the
    // ORIGINAL purchase itself was split across multiple partial payments,
    // not this refund being partial) — never true for PayLink, which has no
    // split-payment feature. Sending it anyway causes the real API to
    // reject the refund with `PS_0017: Payment(s) do not belong to the
    // specified purchase order(s)`, so it's omitted entirely here.
    const refundPayment = await surfboardService.initiatePayment({
      orderId: returnOrder.orderId,
      paymentMethod: 'CARD_NP',
      refundProcessingParams: {
        refundReason: 'OTHER',
        otherReason: reason || 'Merchant-initiated refund via PayLink',
      },
    });

    await paymentRepository.updateRefund(merchantId, orderId, refund.id, {
      surfboardRefundId: refundPayment.paymentId || null,
    });
  } catch (err) {
    // The refund request never actually reached (or was rejected by) the
    // provider — mark it failed for an auditable trail rather than leaving
    // it silently "pending" forever (same philosophy as orders staying
    // `pending` on an abandoned checkout, Section 25.2).
    await paymentRepository.updateRefund(merchantId, orderId, refund.id, { status: 'failed' });
    if (err instanceof SurfboardUnavailableError) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Refund provider is temporarily unavailable.');
    }
    // PS_0068 — the payment hasn't settled yet (same-day) and this refund
    // isn't eligible for Void (partial, or a prior refund already exists on
    // this order) — the only real option today is to wait for settlement.
    if (/no card payments in the purchase order/i.test(err.message || '')) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        "This payment hasn't settled yet. Same-day payments can only be refunded in full; partial refunds (or a second refund on this order) become available once it settles, usually the next day."
      );
    }
    throw err;
  }

  // Result arrives via the webhook (Section 23) — this response is
  // provisional per the documented contract.
  return { refundId: refund.id, status: 'pending' };
}

module.exports = { createRefund };
