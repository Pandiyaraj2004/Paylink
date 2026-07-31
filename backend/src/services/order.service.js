const merchantRepository = require('../repositories/merchant.repository');
const productRepository = require('../repositories/product.repository');
const orderRepository = require('../repositories/order.repository');
const paymentRepository = require('../repositories/payment.repository');
const adminRepository = require('../repositories/admin.repository');
const merchantService = require('./merchant.service');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');
const { serializeTimestamp } = require('../utils/serializeTimestamp');
const { hashCustomerRef } = require('../utils/hashCustomerRef');
const env = require('../config/env');

// Only these statuses can ever have a refund against them (Section 22.6) —
// fetching the refunds subcollection for every other order would just be
// wasted reads (Phase 8's Orders/Transactions/Refunds tabs share this list).
const REFUNDABLE_STATUSES = ['paid', 'refunded', 'partially_refunded'];

/**
 * Business logic behind the Order Engine endpoints (master-doc.md Section
 * 22.4). Section 20.1's folder tree lists `controllers/order.controller.js`
 * and `routes/order.routes.js` but no `services/order.service.js` — the
 * same documented-tree gap the prompt already calls out for
 * `refund.service.js` (Section 19.3). Per Section 20.2's strict layering
 * ("controllers... call exactly one service method"), order.controller.js
 * needs a service layer just as much as refund.controller.js does, so this
 * file is added for the same reason.
 */

const NOTE_MAX_LEN = 200;
const ORDER_STATUSES = ['pending', 'paid', 'refunded', 'partially_refunded', 'cancelled', 'failed'];
const DEFAULT_CURRENCY = 'EUR'; // matches every worked currency example elsewhere in master-doc.md

function assertNote(note) {
  if (note == null) return;
  if (typeof note !== 'string' || note.length > NOTE_MAX_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `note must be a string up to ${NOTE_MAX_LEN} characters.`);
  }
}

function assertTip(tip) {
  if (tip == null) return 0;
  if (typeof tip !== 'number' || Number.isNaN(tip) || tip < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'tip must be a number >= 0.');
  }
  return tip;
}

const CUSTOMER_FIELD_MAX_LEN = 100;

/**
 * Customer Name / Customer Phone — collected by the "Pay Securely" modal
 * (separate fields; the two are never conflated the way an earlier
 * wireframe mislabeled them). Optional at the API layer since not every
 * caller collects them yet, capped at the same length as other free-text
 * order fields.
 */
function assertCustomerField(value, fieldName) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > CUSTOMER_FIELD_MAX_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a string up to ${CUSTOMER_FIELD_MAX_LEN} characters.`);
  }
  return value || null;
}

/**
 * Section 15.1's own Future Improvements note says the Public Store is
 * "currently single-item-or-amount per transaction" (no multi-item cart
 * yet), which is why the documented POST /api/orders body only ever
 * carries a single meaningful selection: either a catalog `items` array or
 * a top-level `customAmount`, never both. Combined with Section 19.3's
 * per-item constraint ("exactly one of productId or customAmount per order
 * item"), the natural reading for this request shape is: exactly one of
 * (non-empty `items`) or (a `customAmount`) must be provided.
 */
async function buildOrderItems(merchantId, { items, customAmount }) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const hasCustomAmount = customAmount !== undefined && customAmount !== null;

  if (hasItems === hasCustomAmount) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Provide either items or a customAmount for this order, not both and not neither.'
    );
  }

  if (hasCustomAmount) {
    if (typeof customAmount !== 'number' || Number.isNaN(customAmount) || customAmount <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'customAmount must be a number > 0.');
    }

    // No merchant-level currency field exists in the documented schema
    // (Section 19.2) — only products carry one. For a pure custom-amount
    // order (no catalog item to borrow a currency from), fall back to any
    // existing product's currency, and only default to EUR if the merchant
    // has no products at all yet.
    const products = await productRepository.listProducts(merchantId);
    const currency = products[0]?.currency || DEFAULT_CURRENCY;

    return {
      orderItems: [{ productId: null, name: 'Custom amount', price: customAmount, quantity: 1, customAmount }],
      currency,
    };
  }

  const orderItems = [];
  let currency = null;

  // Sequential, not Promise.all — a VALIDATION_ERROR/PRODUCT_NOT_FOUND on
  // item N should surface before firing off reads for items N+1..end.
  for (let index = 0; index < items.length; index += 1) {
    const rawItem = items[index];
    if (!rawItem || typeof rawItem !== 'object' || typeof rawItem.productId !== 'string' || !rawItem.productId) {
      throw new AppError(400, 'VALIDATION_ERROR', `items[${index}].productId is required.`);
    }
    const { quantity } = rawItem;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `items[${index}].quantity must be a positive integer.`);
    }

    // eslint-disable-next-line no-await-in-loop
    const product = await productRepository.getProductById(merchantId, rawItem.productId);
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `items[${index}].productId does not exist.`);
    }

    if (currency == null) currency = product.currency;
    orderItems.push({ productId: product.id, name: product.name, price: product.price, quantity, customAmount: null });
  }

  return { orderItems, currency: currency || DEFAULT_CURRENCY };
}

/**
 * POST /api/orders (master-doc.md Section 22.4). Public — customer
 * checkout. Order is created in `pending` status (Section 25.2: "so an
 * abandoned checkout still leaves an auditable trail").
 */
async function createOrder({ merchantId, items, customAmount, note, tip, customerName, customerPhone }) {
  if (!merchantId || typeof merchantId !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'merchantId is required.');
  }

  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  if (!merchantService.isMerchantOpen(merchant)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'This store is not currently taking orders.');
  }

  // Platform-wide kill-switch (master-doc.md Section 16.6 Settings,
  // `maintenanceMode`) — a second, platform-level checkout gate alongside
  // the per-merchant isMerchantOpen check above; per-merchant Suspend
  // (Section 16.2) remains the primary safeguard, this is an additional
  // incident-response lever for the whole platform at once. Fails OPEN
  // (never blocks checkout) on any error reading the setting — same
  // graceful-degradation philosophy as isFirebaseReady()/checkConnection()
  // elsewhere in this codebase, so a Firestore hiccup here can never take
  // checkout down by itself.
  const platformSettings = await adminRepository.getPlatformSettings().catch(() => ({ maintenanceMode: false }));
  if (platformSettings.maintenanceMode) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'PayLink is temporarily down for maintenance. Please try again shortly.');
  }

  assertNote(note);
  const tipAmount = assertTip(tip);
  const customerNameValue = assertCustomerField(customerName, 'customerName');
  const customerPhoneValue = assertCustomerField(customerPhone, 'customerPhone');

  const { orderItems, currency } = await buildOrderItems(merchantId, { items, customAmount });

  // Product-currency validation at create/update time (product.service.js)
  // only blocks NEW unsupported-currency products — it can't retroactively
  // fix a product saved before SURFBOARD_ACTIVE_CURRENCIES existed or was
  // narrowed. Without this check, an order for a stale unsupported-currency
  // product would still be created here and only fail later, confusingly,
  // as a generic "payment declined" once it actually reaches Surfboard.
  if (!env.SURFBOARD_ACTIVE_CURRENCIES.includes(currency)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `This store isn't currently set up to accept payments in ${currency}. Please contact the seller.`
    );
  }

  const itemsTotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalAmount = Number((itemsTotal + tipAmount).toFixed(2));

  const created = await orderRepository.createOrder(merchantId, {
    // Section 19.5's hashed cross-order customer identity — stored
    // ALONGSIDE the raw display fields below (which the Pay Securely modal
    // deliberately collects/shows to the merchant), not instead of them.
    // Kept even though it duplicates customerPhone today: a stable,
    // privacy-conscious key is what actually backs the "repeat customer"
    // grouping this field exists for (ai.service.js's computeRepeatCustomers,
    // and the future Customers page in 14.6).
    customerRef: hashCustomerRef(customerPhoneValue),
    customerName: customerNameValue,
    customerPhone: customerPhoneValue,
    items: orderItems,
    totalAmount,
    currency,
    status: 'pending',
    note: note || null,
    tipAmount,
    payment: { surfboardOrderId: null, surfboardPaymentId: null, method: null, status: 'pending', capturedAt: null },
    receipt: null,
    rating: null,
    // Not in Section 19.2's order status enum — a deliberate, separate
    // field (see PATCH /api/orders/:id/fulfil in order.service.js below)
    // rather than overloading `status`, which tracks payment state only.
    fulfilmentStatus: 'unfulfilled',
  });

  return { orderId: created.id, totalAmount: created.totalAmount, currency: created.currency };
}

/** GET /api/merchants/:id/orders (master-doc.md Section 22.4). Authenticated (owner). */
async function listOrders(merchantId, uid, { status, from, to, customerRef, page, pageSize } = {}) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);

  if (status != null && !ORDER_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status must be one of ${ORDER_STATUSES.join(', ')}.`);
  }

  const parsedPage = page != null ? parseInt(page, 10) : 1;
  const parsedPageSize = pageSize != null ? parseInt(pageSize, 10) : 20;
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pageSize must be a positive integer up to 100.');
  }

  let fromDate = null;
  let toDate = null;
  if (from != null) {
    fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'from must be a valid date.');
    }
  }
  if (to != null) {
    toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new AppError(400, 'VALIDATION_ERROR', 'to must be a valid date.');
    }
  }

  const result = await orderRepository.listOrders(merchantId, {
    status: status || null,
    from: fromDate,
    to: toDate,
    customerRef: customerRef || null,
    page: parsedPage,
    pageSize: parsedPageSize,
  });

  // Enriched with each order's refunds so the merchant Orders/Transactions/
  // Refunds tabs (Section 14.4) can share this one query rather than three
  // separate endpoints — only fetched for orders that could actually have
  // one (REFUNDABLE_STATUSES above).
  const items = await Promise.all(
    result.items.map(async (order) => {
      const refunds = REFUNDABLE_STATUSES.includes(order.status)
        ? await paymentRepository.listRefunds(merchantId, order.id)
        : [];
      return {
        ...order,
        createdAt: serializeTimestamp(order.createdAt),
        refunds: refunds.map((r) => ({ ...r, createdAt: serializeTimestamp(r.createdAt) })),
      };
    })
  );

  return { ...result, items };
}

/**
 * PATCH /api/orders/:id/fulfil (master-doc.md Section 22.4). Authenticated
 * (owner). See the `fulfilmentStatus` note in createOrder above for why
 * this is a separate field from the payment `status` enum.
 */
async function fulfilOrder(orderId, uid) {
  const merchantId = await orderRepository.resolveMerchantIdForOrder(orderId);
  if (!merchantId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  const merchant = await merchantRepository.getMerchantById(merchantId);
  assertOwnership(merchant, uid);

  const order = await orderRepository.getOrderById(merchantId, orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  await orderRepository.updateOrder(merchantId, orderId, { fulfilmentStatus: 'fulfilled' });
  return { status: 'fulfilled' };
}

/**
 * Shared data assembly for the receipt/bill endpoints (Section 22.7). Both
 * are "Public via unique order link, or Authenticated (owner)" — since
 * knowing the (long, random, unguessable) orderId is itself sufficient
 * access per Section 15.3 ("no login required, but not discoverable/
 * guessable"), both routes are wired public with no auth middleware; an
 * authenticated owner viewing their own Orders page reaches the same data
 * through the same, already-public, path.
 *
 * IMPORTANT DOC-CONFLICT RESOLUTION (see report): Section 22.7/25.10
 * describe receiptUrl/billPdfUrl as backend-generated document URLs, but
 * Section 21.8 (already implemented) allocates jsPDF as client-side-only,
 * "regenerated on demand, never persisted server-side" — consistent with
 * the no-Cloud-Storage/no-Blaze-plan constraint (Section 36 Risks). These
 * two endpoints therefore return the ORDER DATA needed to render the
 * receipt/bill client-side, plus a frontend route string in place of a
 * literal file URL, so a follow-up frontend session can generate the PDF
 * via jsPDF from this data.
 */
async function loadOrderPublicData(orderId) {
  const merchantId = await orderRepository.resolveMerchantIdForOrder(orderId);
  if (!merchantId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  let order = await orderRepository.getOrderById(merchantId, orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  // Active Checkout-Time Reconciliation:
  // If the local order status is still 'pending' but we have initiated a Surfboard payment,
  // actively check with Surfboard's API to see if the status is resolved. This avoids
  // customers being stuck on a "loading" state when webhooks are delayed/unreachable.
  if (order.status === 'pending' && order.payment?.surfboardOrderId) {
    // Run reconciliation in the background (fire-and-forget) to avoid blocking the HTTP response.
    // This allows the frontend to transition immediately to "Confirming payment..." and receive
    // the resolved status on the very first 1s poll.
    (async () => {
      try {
        const surfboardService = require('./surfboard.service');
        const paymentService = require('./payment.service');
        const surfboardOrderId = order.payment.surfboardOrderId;
        const statusResult = await surfboardService.getOrderStatus({ orderId: surfboardOrderId });
        
        const mapOrderStatusToEventType = (orderStatus) => {
          if (orderStatus === 'PAYMENT_COMPLETED') return 'order.paymentcompleted';
          if (orderStatus === 'PAYMENT_CANCELLED') return 'order.paymentcancelled';
          if (orderStatus === 'PAYMENT_FAILED') return 'order.paymentfailed';
          return null;
        };

        const eventType = mapOrderStatusToEventType(statusResult.orderStatus);

        if (eventType) {
          const payment = (statusResult.payments || [])[0] || {};
          await paymentService.processSurfboardWebhookEvent({
            eventType,
            metadata: { eventId: `active_reconcile_${surfboardOrderId}_${eventType}` },
            data: {
              orderId: surfboardOrderId,
              referenceId: orderId,
              paymentId: payment.paymentId || order.payment?.surfboardPaymentId,
              paymentStatus: payment.paymentStatus,
              paymentMethod: payment.paymentMethod,
            },
          });
        }
      } catch (err) {
        console.warn(`[active-reconciliation] background run failed for order ${orderId}:`, err.message);
      }
    })();
  }

  const merchant = await merchantRepository.getMerchantById(merchantId);

  return {
    orderId,
    items: order.items,
    totalAmount: order.totalAmount,
    currency: order.currency,
    tipAmount: order.tipAmount,
    note: order.note,
    customerName: order.customerName || null,
    customerPhone: order.customerPhone || null,
    status: order.status,
    createdAt: serializeTimestamp(order.createdAt),
    issuedAt: order.receipt?.issuedAt || null,
    merchant: merchant
      ? {
          businessName: merchant.businessName,
          tagline: merchant.tagline,
          logoBase64: merchant.logoBase64,
          photoBase64: merchant.photoBase64,
          phone: merchant.phone || null,
          email: merchant.email || null,
          address: merchant.address || null,
        }
      : null,
    transactionId: order.payment?.surfboardPaymentId || order.payment?.surfboardOrderId || null,
    paymentMethod: order.payment?.method || null,
  };
}

/** GET /api/orders/:id/receipt (master-doc.md Section 22.7). */
async function getReceiptData(orderId) {
  const data = await loadOrderPublicData(orderId);
  return { receiptUrl: `/receipt/${orderId}`, ...data };
}

/** GET /api/orders/:id/bill-pdf (master-doc.md Section 22.7). */
async function getBillPdfData(orderId) {
  const data = await loadOrderPublicData(orderId);
  return { billPdfUrl: `/receipt/${orderId}`, ...data };
}

/**
 * POST /api/orders/:id/rating (master-doc.md Section 15.3, 22.7's sibling
 * endpoint — listed in 15.3's API Calls line but not itself broken out under
 * 22.7; same access model as the receipt/bill endpoints above: public via
 * the unique, unguessable order link). "One rating per order, visible only
 * on that entrepreneur's own page, never used for cross-platform discovery"
 * — enforced by rejecting a second submission once `order.rating` is set,
 * and by this data never being exposed through any other merchant's or
 * public listing endpoint.
 */
async function submitRating(orderId, { stars, comment }) {
  const merchantId = await orderRepository.resolveMerchantIdForOrder(orderId);
  if (!merchantId) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
  const order = await orderRepository.getOrderById(merchantId, orderId);
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new AppError(400, 'VALIDATION_ERROR', 'stars must be an integer from 1 to 5.');
  }
  if (comment != null && (typeof comment !== 'string' || comment.length > NOTE_MAX_LEN)) {
    throw new AppError(400, 'VALIDATION_ERROR', `comment must be a string up to ${NOTE_MAX_LEN} characters.`);
  }
  if (order.rating) {
    throw new AppError(409, 'CONFLICT', 'This order has already been rated.');
  }

  const rating = { stars, comment: comment || null, createdAt: new Date().toISOString() };
  await orderRepository.updateOrder(merchantId, orderId, { rating });

  // Cached ratingAverage/ratingCount (Section 19.2) — recalculated
  // incrementally here rather than by scanning every order on every
  // submission. Best-effort, non-fatal: same spirit as merchant.service.js's
  // store_live notification — a failure to update this cache must never
  // fail the rating submission itself, since the order write above already
  // succeeded.
  try {
    const merchant = await merchantRepository.getMerchantById(merchantId);
    const oldCount = merchant.ratingCount || 0;
    const oldAverage = merchant.ratingAverage || 0;
    const newCount = oldCount + 1;
    const newAverage = (oldAverage * oldCount + stars) / newCount;
    await merchantRepository.updateMerchant(merchantId, {
      ratingAverage: Number(newAverage.toFixed(2)),
      ratingCount: newCount,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[order.service] rating aggregate update failed', err);
  }

  return { rating };
}

module.exports = {
  createOrder,
  listOrders,
  fulfilOrder,
  getReceiptData,
  getBillPdfData,
  submitRating,
};
