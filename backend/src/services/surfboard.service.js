const crypto = require('crypto');
const SurfboardUnavailableError = require('../utils/SurfboardUnavailableError');
const env = require('../config/env');

/**
 * Wraps ALL Surfboard API calls — no other file may reference Surfboard
 * directly except the services that call this one (payment.service.js,
 * refund.service.js, jobs/paymentReconciliation.job.js).
 *
 * This is a real integration against Surfboard Payments' documented Online
 * Payments API (server-to-server; PayLink's backend calls Surfboard
 * directly, the browser never does). Real demo/sandbox credentials are
 * read from `SURFBOARD_API_KEY` / `SURFBOARD_API_SECRET` /
 * `SURFBOARD_API_BASE_URL` / `SURFBOARD_MERCHANT_ID` / `SURFBOARD_TERMINAL_ID`
 * (backend/.env.local, gitignored). Every method below still fails fast
 * with SurfboardUnavailableError when any of those is blank, mirroring
 * ai.service.js's exact graceful-degradation pattern.
 *
 * Auth: every call carries three headers — `API-KEY`, `API-SECRET`,
 * `MERCHANT-ID` (not a bearer client token — that's a separate,
 * optional browser/mobile-only mechanism not needed here).
 *
 * Response envelope: every response body is `{ status: "SUCCESS"|"ERROR",
 * data: {...}, message: "..." }`. A 2xx HTTP status does NOT guarantee
 * `status === "SUCCESS"` — callSurfboard below checks both.
 */

// Transient network failures / 5xx / envelope-level ERROR-with-5xx are
// retried up to 3 times with exponential backoff (250ms/500ms/1000ms) —
// never applied to the clean "unconfigured" short-circuit, which fails
// fast by design, and never applied to a business-level rejection (a
// non-transient 4xx-shaped error, or a 2xx envelope reporting ERROR).
const RETRY_DELAYS_MS = [250, 500, 1000];

// PayLink's catalog only offers these currencies (see the CURRENCIES
// constant shared by frontend/src/pages/entrepreneur/AiSetupConcierge.tsx
// and frontend/src/pages/entrepreneur/Products/CatalogTab.tsx: ['EUR',
// 'SEK', 'NOK']) — mapped to Surfboard's required numeric ISO 4217 code
// (api-md/orders-create-order.md: "Currency (numeric ISO 4217 as string)").
// Deliberately NOT an exhaustive 180-country table — YAGNI.
const CURRENCY_NUMERIC_CODES = {
  EUR: '978',
  SEK: '752',
  NOK: '578',
};

// PayLink's own payment method enum -> Surfboard's documented
// `paymentMethod` values (api-md/payment-methods-fetch-all-payment-methods.md
// only documents 'CARD', 'SWISH', 'AMEX' as activatable methods for this
// merchant). PayLink's 'wallet' method has no real, documented Surfboard
// equivalent — intentionally left unmapped rather than guessed at; see
// mapPaymentMethod below and payment.service.js's handling of the gap.
const PAYMENT_METHOD_MAP = {
  card: 'CARD',
  swish: 'SWISH',
};

function getConfig() {
  const {
    SURFBOARD_API_KEY: apiKey,
    SURFBOARD_API_SECRET: apiSecret,
    SURFBOARD_API_BASE_URL: baseUrl,
    SURFBOARD_MERCHANT_ID: merchantId,
    SURFBOARD_TERMINAL_ID: terminalId,
    SURFBOARD_STORE_ID: storeId,
    SURFBOARD_CALLBACK_URL: callBackUrl,
    SURFBOARD_PARTNER_ID: partnerId,
  } = env;
  if (!apiKey || !apiSecret || !baseUrl || !merchantId || !terminalId) {
    return null;
  }
  return { apiKey, apiSecret, baseUrl, merchantId, terminalId, storeId, callBackUrl, partnerId };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Retries `fn` only on failures explicitly marked `err.transient = true`
 * (network errors / 5xx responses from `callSurfboard` below). A business
 * decline/rejection is never marked transient, so it propagates on the
 * first attempt instead of being retried 3 times for no reason.
 */
async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!err || !err.transient || attempt === RETRY_DELAYS_MS.length) {
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

/**
 * Low-level call helper. Talks to the real Surfboard demo/sandbox API.
 * Returns the full parsed envelope (`{ status, data, message }`) on
 * success; callers pull `.data` out of it.
 */
async function callSurfboard(config, method, path, body) {
  let response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'API-KEY': config.apiKey,
        'API-SECRET': config.apiSecret,
        'MERCHANT-ID': config.merchantId,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // Network-level failure (DNS, connection refused, timeout) — transient.
    const wrapped = new Error(`Surfboard request failed: ${err.message}`);
    wrapped.transient = true;
    throw wrapped;
  }

  if (response.status >= 500) {
    const wrapped = new Error(`Surfboard returned ${response.status}`);
    wrapped.transient = true;
    throw wrapped;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // 4xx — a business-level rejection (e.g., invalid request), not a
    // transient failure. Propagate immediately, no retry.
    const err = new Error(data.message || `Surfboard returned ${response.status}`);
    err.transient = false;
    err.surfboardResponse = data;
    err.status = response.status;
    throw err;
  }

  // guides/online-payments/integrations/api-architecture.md: "A 2XX HTTP
  // status indicates a successful response, but you should also check the
  // status attribute of the API response. If it is ERROR, refer to the
  // message attribute." — a 200/201 with status "ERROR" is still a
  // business-level rejection, never retried.
  if (data.status === 'ERROR') {
    const err = new Error(data.message || 'Surfboard returned status ERROR');
    err.transient = false;
    err.surfboardResponse = data;
    throw err;
  }

  return data;
}

/** alpha-3 ISO 4217 (PayLink's storage format) -> numeric ISO 4217 string (Surfboard's required format). */
function toNumericCurrency(alphaCurrency) {
  const numeric = CURRENCY_NUMERIC_CODES[alphaCurrency];
  if (!numeric) {
    const err = new Error(`No numeric ISO 4217 mapping configured for currency "${alphaCurrency}".`);
    err.transient = false;
    throw err;
  }
  return numeric;
}

/** PayLink's `method` ('card'|'swish'|'wallet') -> Surfboard's `paymentMethod` ('CARD'|'SWISH'). */
function mapPaymentMethod(paylinkMethod) {
  const mapped = PAYMENT_METHOD_MAP[paylinkMethod];
  if (!mapped) {
    const err = new Error(`"${paylinkMethod}" has no supported Surfboard payment method mapping.`);
    err.transient = false;
    err.unmappedMethod = true;
    throw err;
  }
  return mapped;
}

/**
 * Create Order (api-md/orders-create-order.md). Used both for the initial
 * purchase order (payment.service.js) and, with `type: 'return'` +
 * `purchaseOrderId`, for a refund/return order (refund.service.js) — per
 * guides/online-payments/post-payments/return-refunds: online refunds are
 * Card-Not-Present (CNP) refunds, modelled as a new "return" order against
 * the original order, followed by a CARD_NP payment initiation (see
 * initiatePayment below).
 *
 * `referenceId` is always PayLink's own identifier (see the callers) so the
 * webhook handler can resolve back to PayLink's data without a separate
 * index lookup.
 *
 * `controlFunctions.callBackUrl` (the "dynamic URL flow" in
 * guides/online-payments/integrations/webhooks.md — a per-order webhook
 * target, alternative to a statically-registered Console webhook) is
 * included automatically whenever `SURFBOARD_CALLBACK_URL` is configured.
 * It's deliberately NOT sent while that env var is blank (the case in this
 * local-dev environment): a `localhost` URL could never be reached by
 * Surfboard's servers, so sending one would be pointless and could look
 * like a broken integration rather than a deliberately-deferred one. Once
 * this app is deployed to a public HTTPS domain, setting
 * `SURFBOARD_CALLBACK_URL` turns this on with no further code change.
 * Signature verification (verifyWebhookSignature below) is unaffected
 * either way and already works today, independent of delivery.
 */
async function createOrder({
  referenceId,
  orderLines,
  totalOrderAmount,
  paymentMethod,
  redirectUrl,
  failureRedirectUrl,
  type,
  purchaseOrderId,
  customer,
}) {
  const config = getConfig();
  if (!config) {
    throw new SurfboardUnavailableError('Surfboard order creation is not configured.');
  }

  const body = {
    'terminal$id': config.terminalId,
    referenceId,
    ...(orderLines ? { orderLines } : {}),
    ...(totalOrderAmount ? { totalOrderAmount } : {}),
    ...(type ? { type } : {}),
    ...(purchaseOrderId ? { purchaseOrderId } : {}),
    ...(customer ? { customer } : {}),
    controlFunctions: {
      ...(paymentMethod ? { initiatePaymentsOptions: { paymentMethod } } : {}),
      ...(redirectUrl || failureRedirectUrl
        ? {
            online: {
              ...(redirectUrl ? { redirectUrl } : {}),
              ...(failureRedirectUrl ? { failureRedirectUrl } : {}),
            },
          }
        : {}),
      ...(config.callBackUrl ? { callBackUrl: config.callBackUrl } : {}),
    },
  };

  const envelope = await withRetry(() => callSurfboard(config, 'POST', '/orders', body));
  // LIVE-VERIFIED (not just per the API reference): when `controlFunctions.
  // online` is set, the real response is `{ orderId, paymentPageLink }` —
  // `paymentPageLink` IS the Hosted Payment Page URL, returned here
  // directly, no separate Initiate Payment call needed (see
  // payment.service.js's createPayment). A return/refund order (no
  // `online` control functions) instead comes back as just `{ orderId }`.
  return envelope.data;
}

/**
 * Initiate a Payment (api-md/payments-initiate-a-payment.md). LIVE-VERIFIED
 * this does NOT return a `paymentUrl` for a plain CARD purchase (only
 * `paymentId`/`interAppJWT`, meaningful for an inter-app/SDK flow, not a
 * web redirect) — createOrder's `paymentPageLink` is what the checkout
 * flow actually uses. This function is still exactly what
 * refund.service.js needs, though: `paymentMethod: 'CARD_NP'` +
 * `refundProcessingParams` against a return order is how a CNP refund is
 * actually triggered.
 */
async function initiatePayment({ orderId, paymentMethod, amount, refundProcessingParams }) {
  const config = getConfig();
  if (!config) {
    throw new SurfboardUnavailableError('Surfboard payment initiation is not configured.');
  }

  const body = { orderId, paymentMethod };
  if (amount != null) body.amount = amount;
  if (refundProcessingParams) body.refundProcessingParams = refundProcessingParams;

  const envelope = await withRetry(() => callSurfboard(config, 'POST', '/payments', body));
  return envelope.data; // { paymentId, paymentUrl, qr, qrLink, ... }
}

/**
 * Void a Payment. LIVE-VERIFIED DOC CONFLICT: web-guides/void-a-payment.md's
 * own step-by-step example shows `POST /payments/:paymentId/void`, but that
 * 404s against the real API — the formal api-md/payments-void-a-payment.md
 * reference has it as `PUT`, which is what actually works. Reverses a
 * completed payment before it settles (same day, before 23:00 UTC), with no
 * refund processing fee. Only valid for the FULL original payment amount;
 * there is no partial-void variant. refund.service.js tries this first for
 * a full-amount refund with no prior refunds on the order, since the CNP
 * return/refund flow only works on a SETTLED payment (`voidStatus:
 * 'CANNOT_VOID'` means it's already settled or not yet completed — the
 * caller falls back to the refund flow in that case).
 */
async function voidPayment({ paymentId }) {
  const config = getConfig();
  if (!config) {
    throw new SurfboardUnavailableError('Surfboard payment void is not configured.');
  }

  const envelope = await withRetry(() => callSurfboard(config, 'PUT', `/payments/${paymentId}/void`, {}));
  return envelope.data; // { voidStatus: 'VOIDED' | 'VOID_INITIATED' | 'CANNOT_VOID' }
}

/**
 * Fetch Order Status (api-md/orders-fetch-order-status.md) — used only by
 * jobs/paymentReconciliation.job.js to recover an order whose webhook
 * confirmation never arrived.
 */
async function getOrderStatus({ orderId }) {
  const config = getConfig();
  if (!config) {
    throw new SurfboardUnavailableError('Surfboard order status lookup is not configured.');
  }

  const envelope = await withRetry(() => callSurfboard(config, 'GET', `/orders/${orderId}/status`, null));
  return envelope.data; // { orderStatus, payments, paymentIds, transactions }
}

/**
 * Safe, read-only startup/health check (Steps 9-10): confirms the
 * configured credentials actually authenticate against the real API
 * without creating or mutating anything. `GET /merchants/:merchantId/
 * payment-methods` (api-md/payment-methods-fetch-all-payment-methods.md)
 * is the lightest documented authenticated GET available with only a
 * merchantId (no separate partnerId, which PayLink doesn't have).
 *
 * Never throws — returns `{ configured: false }` when unconfigured (the
 * expected state until SURFBOARD_WEBHOOK_CERTIFICATE etc. exist), or
 * `{ configured: true, ok, ... }` otherwise, so the caller (server.js) can
 * log a clear warning without ever blocking/crashing server boot — the
 * same graceful-degradation philosophy as isFirebaseReady().
 */
async function checkConnection() {
  const config = getConfig();
  if (!config) {
    return { configured: false };
  }

  try {
    const envelope = await callSurfboard(config, 'GET', `/merchants/${config.merchantId}/payment-methods`, null);
    return { configured: true, ok: true, paymentMethods: envelope.data };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

/**
 * Verifies an inbound webhook's signature
 * (guides/online-payments/integrations/webhooks.md): HMAC-SHA512, Base64
 * encoded, header `x-webhook-signature`, keyed by
 * `SURFBOARD_WEBHOOK_CERTIFICATE`, computed over the raw request body
 * exactly as received (never a re-serialized copy, since re-serializing
 * JSON can change whitespace and invalidate the signature).
 *
 * Returns `{ configured: false }` when the certificate isn't set at all
 * (currently the case — no certificate has been issued yet) — the caller
 * (payment.controller.js) maps this to 503, since silently skipping
 * signature verification would defeat a real security boundary. Otherwise
 * returns `{ configured: true, valid: boolean }`.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  const certificate = env.SURFBOARD_WEBHOOK_CERTIFICATE;
  if (!certificate) {
    return { configured: false, valid: false };
  }
  if (!signatureHeader || !rawBody) {
    return { configured: true, valid: false };
  }

  const expected = crypto.createHmac('sha512', certificate).update(rawBody).digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(String(signatureHeader), 'utf8');

  const valid = expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
  return { configured: true, valid };
}

/**
 * Fetch Settlement Reports (web-guides/settlements-reporting.md:
 * `GET /partners/:partnerId/merchants/:merchantId/reports`) — payout-batch
 * summaries (totalSale/totalRefund/fee/payout/settlementDate) for the whole
 * shared merchant account. Used only as a supplementary, read-only
 * cross-check on the Admin Settlement Management page
 * (payout.service.js's getSurfboardSettlementReports) — PayLink's own
 * per-entrepreneur payout ledger (payoutBatch.repository.js) is computed
 * entirely from PayLink's own order/refund data and never depends on this
 * call succeeding.
 *
 * This is PARTNER-level Surfboard access, a separate credential tier from
 * the merchant-level API-KEY/API-SECRET this file's other methods use — not
 * automatically included on a free/sandbox developer account. Fails the
 * same clean, gracefully-degrading way as checkConnection() when
 * unconfigured, rather than throwing a hard error the caller has to guard
 * against everywhere.
 */
async function getSettlementReports({ from, to } = {}) {
  const config = getConfig();
  if (!config || !config.partnerId) {
    return { configured: false };
  }

  try {
    const query = new URLSearchParams();
    if (from) query.set('startDate', from);
    if (to) query.set('endDate', to);
    const qs = query.toString();
    const envelope = await withRetry(() =>
      callSurfboard(
        config,
        'GET',
        `/partners/${config.partnerId}/merchants/${config.merchantId}/reports${qs ? `?${qs}` : ''}`,
        null
      )
    );
    return { configured: true, ok: true, reports: envelope.data };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

module.exports = {
  createOrder,
  initiatePayment,
  voidPayment,
  getOrderStatus,
  checkConnection,
  verifyWebhookSignature,
  toNumericCurrency,
  mapPaymentMethod,
  getSettlementReports,
};
