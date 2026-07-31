const orderRepository = require('../repositories/order.repository');
const paymentRepository = require('../repositories/payment.repository');
const merchantRepository = require('../repositories/merchant.repository');
const surfboardService = require('./surfboard.service');
const notificationService = require('./notification.service');
const SurfboardUnavailableError = require('../utils/SurfboardUnavailableError');
const AppError = require('../utils/AppError');
const env = require('../config/env');

/**
 * Payment Engine business logic (master-doc.md Section 22.5, 23, 25).
 * Only this service (plus refund.service.js) is permitted to call
 * surfboard.service.js (Section 20.2). Repositories never call Surfboard.
 */

const ALLOWED_METHODS = ['card', 'swish', 'wallet'];

// Real Surfboard webhook event types this handler understands (see
// guides/online-payments/integrations/webhooks.md's "Order and Payment
// Events" list) — only the payment-lifecycle subset PayLink needs (YAGNI:
// no Order Updated / Order Cancelled / Terminal Event handling).
const PAYMENT_EVENT_TYPES = [
  'order.paymentinitiated',
  'order.paymentprocessed',
  'order.paymentcompleted',
  'order.paymentfailed',
  'order.paymentcancelled',
];

// A refund/return order's referenceId is namespaced (see refund.service.js)
// so the SAME orderId can have both its original purchase order and one or
// more refund/return orders in flight, and the webhook for each is
// unambiguous without depending on the `data.type` field (which the real
// webhook payloads only populate on the `order.paymentcompleted` event —
// not on failed/cancelled/initiated/processed — so it can't be relied on
// as the sole disambiguator).
const REFUND_REFERENCE_PREFIX = 'refund:';

function parseReferenceId(referenceId) {
  if (typeof referenceId === 'string' && referenceId.startsWith(REFUND_REFERENCE_PREFIX)) {
    const [, orderId, refundId] = referenceId.split(':');
    return { orderId, refundId, isRefund: true };
  }
  return { orderId: referenceId, refundId: null, isRefund: false };
}

/** Builds Surfboard orderLines (minor-unit amounts) from a PayLink order's items + tip. */
function buildOrderLines(order, numericCurrency) {
  const lines = (order.items || []).map((item, index) => {
    const unitMinor = Math.round((item.price || 0) * 100);
    const quantity = item.quantity || 1;
    return {
      id: item.productId || `line-${index}`,
      name: item.name || 'Item',
      quantity,
      amount: { regular: unitMinor, total: unitMinor * quantity, currency: numericCurrency, tax: [] },
    };
  });

  if (order.tipAmount) {
    const tipMinor = Math.round(order.tipAmount * 100);
    lines.push({
      id: 'tip',
      name: 'Tip',
      quantity: 1,
      amount: { regular: tipMinor, total: tipMinor, currency: numericCurrency, tax: [] },
    });
  }

  return lines;
}

/**
 * Builds the `/pay/:slug/...` redirect URLs the Hosted Payment Page sends
 * the customer back to. Deviation from the original design: BOTH outcomes
 * now land back on the storefront root itself (`/pay/:slug?orderId=...`),
 * never a separate standalone page — PublicStore.tsx detects `orderId` on
 * load and shows the receipt/failure state as an overlay on top of the
 * still-mounted storefront (ReceiptOverlay.tsx), reusing the exact same
 * `useOrderReceipt` data-fetching Receipt.tsx already relies on. The
 * standalone `/pay/:slug/receipt/:orderId` route (Receipt.tsx) still exists
 * for a directly-shared receipt link, but is no longer where the Hosted
 * Payment Page itself redirects to. A failed/cancelled outcome's overlay
 * offers a "Try again" action that reopens the Pay Securely modal in
 * recovery mode against this SAME orderId, since the browser's in-memory
 * selection state doesn't survive a full top-level redirect off to
 * Surfboard's page and back.
 */
function buildRedirectUrls(merchant, orderId) {
  const slug = merchant?.pageSlug;
  if (!slug) return { redirectUrl: undefined, failureRedirectUrl: undefined };
  const base = env.SURFBOARD_REDIRECT_BASE_URL;
  const storefrontWithOrder = `${base}/pay/${slug}?orderId=${orderId}`;
  return {
    redirectUrl: storefrontWithOrder,
    failureRedirectUrl: storefrontWithOrder,
  };
}

// PayLink only ever collects a single free-text "Customer Phone Number"
// field (no separate country-code input), but Surfboard's documented
// `customer.person.phoneNumber` requires BOTH `code` (dialing code, no '+')
// and `number` (national subscriber number) as an object, not a plain
// string (api-md/orders-create-order.md). LIVE-VERIFIED: a naive "first 1-3
// digits after the +" split is WRONG and gets the whole order creation call
// rejected outright by Surfboard ("Invalid phone number") — e.g. Swedish
// "+46701234567" naively greedy-splits into code "467"/number "01234567"
// instead of the real code "46"/number "701234567", since "01234567" also
// happens to satisfy a generic "4+ digits" check. Matched instead against a
// small set of REAL calling codes (longest first, so a 3-digit code like
// Finland's 358 is never swallowed by a 2-digit code's greedy match) —
// deliberately not an exhaustive ~200-country table (YAGNI), covering
// PayLink's currently-supported markets (EUR/SEK/NOK) plus a few other
// common ones. Anything that doesn't match a known code is left out of the
// Surfboard payload entirely rather than guessed at.
const KNOWN_CALLING_CODES = ['420', '421', '358', '353', '351', '46', '47', '45', '49', '44', '33', '34', '39', '31', '32', '41', '43', '48', '30', '36', '1', '7'].sort(
  (a, b) => b.length - a.length
);

function splitPhoneNumber(phone) {
  if (!phone.startsWith('+')) return null;
  const digits = phone.slice(1);
  for (const code of KNOWN_CALLING_CODES) {
    if (digits.startsWith(code) && digits.length - code.length >= 4) {
      return { code, number: digits.slice(code.length) };
    }
  }
  return null;
}

/**
 * Builds Surfboard's `customer.person` object (api-md/orders-create-order.md)
 * from the raw customerName/customerPhone the Pay Securely modal collects
 * and order.service.js already stores on the order (master-doc.md Section
 * 19.5's hashed customerRef is the PayLink-side privacy control; passing the
 * raw values on to Surfboard's OWN hosted payment page is a legitimate,
 * separate use of data the customer just typed into that same checkout).
 * Returns undefined when there's nothing usable to send, so createOrder's
 * `customer` field is simply omitted rather than sent empty.
 */
function buildSurfboardCustomer(order) {
  const name = typeof order.customerName === 'string' ? order.customerName.trim() : '';
  const phone = typeof order.customerPhone === 'string' ? order.customerPhone.trim().replace(/[\s-]/g, '') : '';

  const person = {};

  if (name) {
    const [firstName, ...rest] = name.split(/\s+/);
    person.name = rest.length > 0 ? { firstName, lastName: rest.join(' ') } : { firstName };
  }

  const phoneNumber = splitPhoneNumber(phone);
  if (phoneNumber) {
    person.phoneNumber = phoneNumber;
  }

  return Object.keys(person).length > 0 ? { person } : undefined;
}

/**
 * POST /api/payments/create (master-doc.md Section 22.5). Public —
 * immediately follows order creation, before any customer auth exists.
 *
 * Real Surfboard flow, LIVE-VERIFIED against the demo API (this differs
 * from what the API reference alone would suggest): a single Create Order
 * call — with `controlFunctions.online.redirectUrl`/`failureRedirectUrl`
 * and `controlFunctions.initiatePaymentsOptions.paymentMethod` set to lock
 * in the customer's chosen method — returns a `paymentPageLink` directly;
 * that link IS the Hosted Payment Page the frontend redirects the customer
 * to (Checkout.tsx). A separate `POST /payments` ("Initiate Payment") call
 * was NOT needed here and, when tried, returned no `paymentUrl` at all
 * (just `paymentId`/`interAppJWT` — fields meaningful for an inter-app/SDK
 * flow, not this web redirect one); calling it eagerly here would also risk
 * a second, conflicting payment attempt once the customer actually submits
 * the hosted page. `initiatePayment` is still used, deliberately, by
 * refund.service.js's CARD_NP refund flow, which is a genuinely different
 * use of that endpoint.
 *
 * No `paymentId` exists yet at this point — Surfboard only creates one once
 * the customer interacts with the hosted page — so `payment.surfboardPaymentId`
 * stays null until the webhook (or the reconciliation job) reports it. This
 * is a genuine change from a synchronous captured/declined result: the
 * definitive outcome now only ever arrives via the webhook
 * (processSurfboardWebhookEvent below) once the customer completes (or
 * abandons) checkout on Surfboard's own page.
 */
// paymentDetails is accepted for API-shape symmetry but never read — no real
// card/Swish capture form exists to collect it against (Surfboard's hosted
// payment page owns that step); see frontend/src/api/payments.ts's type comment.
async function createPayment({ orderId, method, paymentDetails: _paymentDetails }) {
  if (!orderId || typeof orderId !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'orderId is required.');
  }
  if (!ALLOWED_METHODS.includes(method)) {
    throw new AppError(400, 'VALIDATION_ERROR', `method must be one of ${ALLOWED_METHODS.join(', ')}.`);
  }

  // Distinct from both ALLOWED_METHODS above (methods PayLink's UI could
  // ever offer) and surfboardService.mapPaymentMethod's unmapped-method
  // check below (methods Surfboard's API understands at all — 'wallet'
  // never maps, full stop): this is the narrower, config-driven set
  // actually ACTIVATED for this merchant in the Surfboard Console right now
  // (env.SURFBOARD_ACTIVE_PAYMENT_METHODS, live-verified: only 'card' is
  // activated today — Swish is not, even though Surfboard's API understands
  // it in general). Checked before any DB lookup or Surfboard call.
  if (!env.SURFBOARD_ACTIVE_PAYMENT_METHODS.includes(method)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `The "${method}" payment method is not currently available for this store. Available methods: ${env.SURFBOARD_ACTIVE_PAYMENT_METHODS.join(', ')}.`
    );
  }

  const merchantId = await orderRepository.resolveMerchantIdForOrder(orderId);
  if (!merchantId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  const order = await orderRepository.getOrderById(merchantId, orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  // Section 25.8 (Retry): a customer retry re-invokes this against the SAME
  // orderId, never a new order — but only while it's still pending. An
  // order that's already paid/cancelled/failed rejects here instead of
  // silently re-charging or re-attempting a closed checkout.
  if (order.status !== 'pending') {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `This order is no longer payable (current status: ${order.status}).`
    );
  }

  let surfboardMethod;
  try {
    surfboardMethod = surfboardService.mapPaymentMethod(method);
  } catch (_err) {
    // 'wallet' (or any future method the frontend offers before Surfboard
    // documents a matching paymentMethod) has no real mapping — a clean,
    // honest 400 rather than attempting a call Surfboard would reject.
    throw new AppError(400, 'VALIDATION_ERROR', `The "${method}" payment method is not yet supported by the payment provider.`);
  }

  let numericCurrency;
  try {
    numericCurrency = surfboardService.toNumericCurrency(order.currency);
  } catch (_err) {
    throw new AppError(400, 'VALIDATION_ERROR', `The "${order.currency}" currency is not yet supported by the payment provider.`);
  }

  const merchant = await merchantRepository.getMerchantById(merchantId);
  const { redirectUrl, failureRedirectUrl } = buildRedirectUrls(merchant, orderId);
  const totalMinor = Math.round(order.totalAmount * 100);

  let surfboardOrder;
  try {
    surfboardOrder = await surfboardService.createOrder({
      referenceId: orderId,
      orderLines: buildOrderLines(order, numericCurrency),
      totalOrderAmount: { regular: totalMinor, total: totalMinor, currency: numericCurrency, tax: [] },
      paymentMethod: surfboardMethod,
      redirectUrl,
      failureRedirectUrl,
      customer: buildSurfboardCustomer(order),
    });
  } catch (err) {
    if (err instanceof SurfboardUnavailableError) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Payment provider is temporarily unavailable. Please try again shortly.');
    }
    // A non-transient Surfboard-reported rejection (envelope status ERROR,
    // or a 4xx) means the payment could never even be started — mapped to
    // the one other documented error for this endpoint (Section 22.5 only
    // ever documents 402/503) rather than leaving the order stuck at
    // 'pending' with no way forward.
    await orderRepository.updateOrder(merchantId, orderId, {
      'payment.method': method,
      'payment.status': 'failed',
      status: 'failed',
    });
    throw new AppError(402, 'PAYMENT_DECLINED', 'The payment could not be started with the provider.');
  }

  await orderRepository.updateOrder(merchantId, orderId, {
    'payment.surfboardOrderId': surfboardOrder.orderId,
    'payment.method': method,
    'payment.status': 'initiated',
  });

  return {
    paymentStatus: 'PAYMENT_INITIATED',
    surfboardPaymentId: null,
    paymentUrl: surfboardOrder.paymentPageLink || null,
  };
}

/**
 * Business logic applied inside the webhook transaction (Section 25's
 * payment/refund reconciliation). Receives the transaction context from
 * paymentRepository.runWebhookTransaction (tx + doc refs already read) and
 * the real Surfboard event's `eventType`/`data`; performs the tx.update
 * calls the event type calls for, and returns a description of which
 * notification (if any) should be sent once the transaction commits.
 */
function applyWebhookEvent(ctx, { eventType, paymentId, refundId, isRefund }) {
  const { tx, order, orderRef, refunds, refundsCollectionRef, merchantId, orderId, serverTimestampValue } = ctx;

  // No paymentId exists yet at order/payment-creation time (see
  // createPayment above) — this is the first point PayLink actually learns
  // Surfboard's real paymentId for the original purchase, so it's synced
  // onto the order alongside whatever status field each branch below
  // already writes. A refund's own surfboardRefundId is instead captured
  // directly by refund.service.js right after its own initiatePayment call.
  const paymentIdPatch = !isRefund && paymentId ? { 'payment.surfboardPaymentId': paymentId } : {};

  if (isRefund) {
    const target =
      refunds.find((r) => refundId && r.id === refundId) || refunds.find((r) => r.status === 'pending');

    if (!target) {
      // Nothing to reconcile against (e.g. a stale/duplicate delivery whose
      // refund was already fully processed) — a safe no-op, not an error.
      return null;
    }

    const refundDocRef = refundsCollectionRef.doc(target.id);

    if (eventType === 'order.paymentcompleted') {
      tx.update(refundDocRef, { status: 'completed' });

      const totalRefunded =
        refunds.filter((r) => r.id !== target.id && r.status === 'completed').reduce((sum, r) => sum + (r.amount || 0), 0) +
        target.amount;

      const newOrderStatus = totalRefunded >= order.totalAmount ? 'refunded' : 'partially_refunded';
      tx.update(orderRef, { status: newOrderStatus });

      return { merchantId, orderId, type: 'refund_issued' };
    }

    if (eventType === 'order.paymentfailed' || eventType === 'order.paymentcancelled') {
      tx.update(refundDocRef, { status: 'failed' });
      return null;
    }

    // order.paymentinitiated / order.paymentprocessed — intermediate,
    // nothing to reconcile on the refund doc yet.
    return null;
  }

  // Original purchase order flow.
  if (eventType === 'order.paymentcompleted') {
    // Section 19.2/25.10: the `receipt` map is written exactly once, on
    // first successful capture, and is immutable thereafter.
    const receiptPatch = order.receipt
      ? {}
      : {
          receipt: {
            receiptUrl: `/receipt/${orderId}`,
            billPdfUrl: `/receipt/${orderId}`,
            issuedAt: serverTimestampValue,
          },
        };

    tx.update(orderRef, {
      status: 'paid',
      'payment.status': 'captured',
      'payment.capturedAt': serverTimestampValue,
      ...paymentIdPatch,
      ...receiptPatch,
    });

    return { merchantId, orderId, type: 'payment_success' };
  }

  if (eventType === 'order.paymentfailed') {
    tx.update(orderRef, { status: 'failed', 'payment.status': 'failed', ...paymentIdPatch });
    return null;
  }

  if (eventType === 'order.paymentcancelled') {
    // payment-lifecycle.md: a cancelled payment leaves the ORDER 'PENDING'
    // (retryable) at Surfboard's end, but PayLink has no distinct "still
    // payable after a cancel" UI state for an abandoned checkout — a
    // customer who cancels can retry via a fresh POST /api/payments/create
    // against the same still-'pending' order right up until this webhook
    // lands; once it lands, the order is simply closed as cancelled.
    tx.update(orderRef, { status: 'cancelled', 'payment.status': 'cancelled', ...paymentIdPatch });
    return null;
  }

  // order.paymentinitiated / order.paymentprocessed — intermediate states;
  // 'payment.status' already reflects 'initiated' from createPayment above,
  // and definitely no order.status flip yet, but this may be the first
  // event to actually carry Surfboard's real paymentId, so still worth a
  // write when there's something new to record.
  if (Object.keys(paymentIdPatch).length > 0) {
    tx.update(orderRef, paymentIdPatch);
  }
  return null;
}

/**
 * POST /api/webhooks/surfboard (master-doc.md Section 22.5, 25.9).
 * Idempotent, keyed on `metadata.eventId` (Section 19.2/19.3's
 * `processedWebhookEvents` collection). Resolves PayLink's order via
 * `data.referenceId` (PayLink's own orderId, or a `refund:`-prefixed
 * variant — see parseReferenceId above) rather than Surfboard's own
 * `data.orderId`.
 */
async function processSurfboardWebhookEvent(payload) {
  const { eventType, metadata, data } = payload || {};

  // Surfboard Console's "Test webhook" connectivity check
  // (web-guides/webhooks-notifications.md's "Testing Webhooks" section)
  // sends `{ eventType: "test.webhook", metadata: {...} }` with no `data` —
  // acknowledge it directly rather than rejecting it as an unrecognized
  // event type / missing referenceId.
  if (eventType === 'test.webhook') {
    return { processed: true, test: true };
  }

  const eventId = metadata?.eventId;

  if (!eventId || typeof eventId !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'metadata.eventId is required.');
  }
  if (!eventType || !PAYMENT_EVENT_TYPES.includes(eventType)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Unrecognized webhook event type: ${eventType}`);
  }
  if (!data || typeof data.referenceId !== 'string' || !data.referenceId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'data.referenceId is required.');
  }

  const { orderId, refundId, isRefund } = parseReferenceId(data.referenceId);

  let notifyContext = null;

  const result = await paymentRepository.runWebhookTransaction(eventId, orderId, async (ctx) => {
    notifyContext = applyWebhookEvent(ctx, { eventType, paymentId: data.paymentId, refundId, isRefund });
  });

  if (result.duplicate) {
    return { processed: false, reason: 'duplicate' };
  }
  if (result.indexMissing || result.orderMissing) {
    // No-op rather than an error: Surfboard's own redelivery would
    // otherwise keep retrying an event we can never resolve.
    return { processed: false, reason: result.indexMissing ? 'unknown_order' : 'order_missing' };
  }

  if (notifyContext) {
    try {
      await notificationService.notify(notifyContext);
    } catch (err) {
      // Best-effort: an in-app notification failure must never affect
      // payment/refund correctness (Section 27.1 is the safety net for
      // failed notification delivery, not this webhook handler).
      // eslint-disable-next-line no-console
      console.error('[payment.service] notification dispatch failed', err);
    }
  }

  return { processed: true };
}

module.exports = { createPayment, processSurfboardWebhookEvent };
