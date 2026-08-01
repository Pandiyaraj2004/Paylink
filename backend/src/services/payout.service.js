const payoutBatchRepository = require('../repositories/payoutBatch.repository');
const orderRepository = require('../repositories/order.repository');
const merchantRepository = require('../repositories/merchant.repository');
const adminRepository = require('../repositories/admin.repository');
const surfboardService = require('./surfboard.service');
const notificationService = require('./notification.service');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');
const { serializeTimestamp } = require('../utils/serializeTimestamp');
const { REVENUE_ORDER_STATUSES, netRevenue } = require('../utils/revenue');
const env = require('../config/env');

/**
 * Business logic behind the Payout & Settlement Management module — added
 * on top of the existing, unmodified Surfboard payment/webhook/refund flow
 * (payment.service.js, refund.service.js, surfboard.service.js) purely as a
 * read/aggregate layer over it. Nothing here writes to `orders`,
 * `refunds`, or any existing merchant field; every new fact this module
 * tracks lives in the two new collections `payoutBatch.repository.js` owns
 * (`payoutBatches`, `payoutCursors`).
 *
 * THE MODEL: an entrepreneur's paid orders are periodically bundled into
 * `payoutBatches/{id}` documents — "how much they're owed for a stretch of
 * newly-captured orders" — which move through exactly three states:
 *
 *   pending  -> eligible  -> paid
 *
 *   - pending:  netAmount has been calculated (gross paid orders minus their
 *               committed refunds) but the reserve period hasn't elapsed and
 *               Surfboard hasn't confirmed settlement yet.
 *   - eligible: the reserve period has elapsed (or Surfboard's own Order
 *               Status API confirmed every underlying payment settled,
 *               whichever comes first) — this money is real and ready to
 *               pay out.
 *   - paid:     an admin has manually confirmed the transfer happened
 *               (outside this system today — see executeBankTransfer below).
 *
 * A refund that lands AFTER a batch is already 'paid' is a known,
 * documented gap (a "claw-back" scenario) — this module nets refunds at
 * CALCULATION time only, matching the literal ask ("calculate... from paid
 * orders minus refunds"), not a full payout-lifecycle reconciliation. See
 * README for this call-out.
 *
 * calculateEligiblePayouts() is the single entry point jobs/settlementPayout.job.js
 * calls — no scheduler is wired up (same "plain callable function" posture
 * as jobs/paymentReconciliation.job.js), so it runs on-demand via the Admin
 * Settlement Management page's "Recalculate" action today.
 */

const BATCH_STATUSES = ['pending', 'eligible', 'paid'];

function toMillis(value) {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'string' || value instanceof Date) {
    const millis = new Date(value).getTime();
    return Number.isNaN(millis) ? null : millis;
  }
  return null;
}

function buildRefundsByOrderId(refunds) {
  const map = new Map();
  for (const refund of refunds) {
    const list = map.get(refund.orderId) || [];
    list.push(refund);
    map.set(refund.orderId, list);
  }
  return map;
}

function serializeBatch(batch) {
  return {
    ...batch,
    createdAt: serializeTimestamp(batch.createdAt),
    updatedAt: serializeTimestamp(batch.updatedAt),
  };
}

function summarizeBatches(batches) {
  const totals = { pending: 0, eligible: 0, paid: 0 };
  const counts = { pending: 0, eligible: 0, paid: 0 };
  for (const batch of batches) {
    if (!(batch.status in totals)) continue;
    totals[batch.status] += batch.netAmount || 0;
    counts[batch.status] += 1;
  }
  return {
    pendingBalance: Number(totals.pending.toFixed(2)),
    eligibleBalance: Number(totals.eligible.toFixed(2)),
    totalPaidLifetime: Number(totals.paid.toFixed(2)),
    pendingBatchCount: counts.pending,
    eligibleBatchCount: counts.eligible,
    paidBatchCount: counts.paid,
  };
}

/**
 * Best-effort settlement check against Surfboard's own Fetch Order Status
 * API (surfboardService.getOrderStatus) for every order in a batch — "using
 * available... Order Status APIs where applicable" per the module's brief.
 * Never throws: a Surfboard-side failure (unconfigured, network error,
 * sandbox not populating settlementStatus) just means this check is
 * inconclusive (`checked: false`), and calculateEligiblePayouts falls back
 * to the reserve-period timer alone — the same graceful-degradation
 * philosophy as every other surfboard.service.js caller in this codebase.
 */
async function checkBatchSettlement(batch) {
  let anyChecked = false;
  let allSettled = true;

  for (const orderId of batch.orderIds || []) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const order = await orderRepository.getOrderById(batch.merchantId, orderId);
      const surfboardOrderId = order?.payment?.surfboardOrderId;
      if (!surfboardOrderId) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const statusResult = await surfboardService.getOrderStatus({ orderId: surfboardOrderId });
      const transactions = statusResult.transactions || [];
      if (transactions.length === 0) {
        // eslint-disable-next-line no-continue
        continue;
      }
      anyChecked = true;
      if (!transactions.every((t) => t.settlementStatus === 'SETTLED')) {
        allSettled = false;
      }
    } catch (_err) {
      // Inconclusive for this order — reserve-period fallback decides instead.
    }
  }

  return { checked: anyChecked, allSettled: anyChecked && allSettled };
}

/**
 * The core calculation job (see module header). Two passes:
 *   1. Recheck every 'pending' batch for promotion to 'eligible'.
 *   2. Bundle each merchant's newly-captured orders (since their cursor)
 *      into a fresh 'pending' batch.
 * Both passes are independent per merchant/batch — one merchant's Surfboard
 * lookup failing never blocks another's, or the batch-creation pass.
 */
async function calculateEligiblePayouts() {
  const nowMillis = Date.now();
  const reserveMs = env.PAYOUT_RESERVE_DAYS * 24 * 60 * 60 * 1000;
  const summary = { batchesCreated: 0, batchesPromoted: 0, merchantsProcessed: 0 };

  // --- Pass 1: promote pending -> eligible ---------------------------------
  const pendingBatches = await payoutBatchRepository.listPendingBatches();
  for (const batch of pendingBatches) {
    const periodEndMillis = toMillis(batch.periodEnd);
    const reserveElapsed = periodEndMillis != null && nowMillis >= periodEndMillis + reserveMs;

    // eslint-disable-next-line no-await-in-loop
    const settlement = await checkBatchSettlement(batch);

    if (reserveElapsed || settlement.allSettled) {
      // eslint-disable-next-line no-await-in-loop
      await payoutBatchRepository.updateBatch(batch.id, {
        status: 'eligible',
        eligibleAt: new Date().toISOString(),
        settlementChecked: settlement.checked,
        settlementConfirmed: settlement.allSettled,
      });
      summary.batchesPromoted += 1;
    } else if (settlement.checked) {
      // eslint-disable-next-line no-await-in-loop
      await payoutBatchRepository.updateBatch(batch.id, {
        settlementChecked: settlement.checked,
        settlementConfirmed: settlement.allSettled,
      });
    }
  }

  // --- Pass 2: bundle newly-captured orders into new pending batches ------
  const [orders, refunds] = await Promise.all([
    adminRepository.getAllOrdersAcrossMerchants(),
    adminRepository.getAllRefundsAcrossMerchants(),
  ]);
  const refundsByOrderId = buildRefundsByOrderId(refunds);

  const ordersByMerchant = new Map();
  for (const order of orders) {
    if (!REVENUE_ORDER_STATUSES.includes(order.status)) continue;
    if (!order.payment?.capturedAt) continue; // never actually captured — nothing to bundle
    const list = ordersByMerchant.get(order.merchantId) || [];
    list.push(order);
    ordersByMerchant.set(order.merchantId, list);
  }

  for (const [merchantId, merchantOrders] of ordersByMerchant.entries()) {
    summary.merchantsProcessed += 1;
    // eslint-disable-next-line no-await-in-loop
    const cursorMillis = await payoutBatchRepository.getCursor(merchantId);

    const candidates = merchantOrders
      .map((order) => ({ order, capturedMillis: toMillis(order.payment.capturedAt) }))
      .filter((c) => c.capturedMillis != null && c.capturedMillis > cursorMillis)
      .sort((a, b) => a.capturedMillis - b.capturedMillis);

    if (candidates.length === 0) continue; // eslint-disable-line no-continue

    let gross = 0;
    let refundedTotal = 0;
    let currency = null;
    let maxCapturedMillis = cursorMillis;
    const orderIds = [];

    for (const { order, capturedMillis } of candidates) {
      const net = netRevenue(order, refundsByOrderId);
      gross += order.totalAmount;
      refundedTotal += Math.max(0, order.totalAmount - net);
      orderIds.push(order.id);
      currency = currency || order.currency;
      if (capturedMillis > maxCapturedMillis) maxCapturedMillis = capturedMillis;
    }

    const netAmount = Number((gross - refundedTotal).toFixed(2));

    // Always advance the cursor, even for a fully-refunded (netAmount <= 0)
    // stretch of orders — they've been considered and must never be
    // re-bundled on the next run, whether or not they produced a batch.
    if (netAmount <= 0) {
      // eslint-disable-next-line no-await-in-loop
      await payoutBatchRepository.setCursor(merchantId, maxCapturedMillis);
      continue; // eslint-disable-line no-continue
    }

    // eslint-disable-next-line no-await-in-loop
    await payoutBatchRepository.createBatch({
      merchantId,
      status: 'pending',
      periodStart: new Date(candidates[0].capturedMillis).toISOString(),
      periodEnd: new Date(maxCapturedMillis).toISOString(),
      orderIds,
      orderCount: orderIds.length,
      currency: currency || 'SEK',
      grossAmount: Number(gross.toFixed(2)),
      refundedAmount: Number(refundedTotal.toFixed(2)),
      netAmount,
      settlementChecked: false,
      settlementConfirmed: false,
      eligibleAt: null,
      paidAt: null,
      paidBy: null,
      paidNote: null,
    });
    summary.batchesCreated += 1;

    // eslint-disable-next-line no-await-in-loop
    await payoutBatchRepository.setCursor(merchantId, maxCapturedMillis);
  }

  return summary;
}

/* ------------------------------------------------------------------------ */
/* Merchant Dashboard — Payouts page                                        */
/* ------------------------------------------------------------------------ */

/** GET /api/merchants/:id/payouts/summary — the Payouts page's headline totals. */
async function getMerchantPayoutSummary(merchantId, uid) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);

  const batches = await payoutBatchRepository.getAllBatchesForMerchant(merchantId);
  const currency = batches.find((b) => b.currency)?.currency || null;

  return { ...summarizeBatches(batches), currency, reserveDays: env.PAYOUT_RESERVE_DAYS };
}

/** GET /api/merchants/:id/payouts — the Payouts page's history table. */
async function listMerchantPayouts(merchantId, uid, { status, page, pageSize } = {}) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);

  if (status != null && !BATCH_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status must be one of ${BATCH_STATUSES.join(', ')}.`);
  }

  const parsedPage = page != null ? parseInt(page, 10) : 1;
  const parsedPageSize = pageSize != null ? parseInt(pageSize, 10) : 20;
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pageSize must be a positive integer up to 100.');
  }

  const result = await payoutBatchRepository.listBatchesForMerchant(merchantId, {
    status: status || null,
    page: parsedPage,
    pageSize: parsedPageSize,
  });
  return { ...result, items: result.items.map(serializeBatch) };
}

/* ------------------------------------------------------------------------ */
/* Admin — Settlement Management page                                       */
/* ------------------------------------------------------------------------ */

/** GET /api/admin/payouts/summary — platform totals + per-merchant breakdown. */
async function adminGetSummary() {
  const [batches, merchants] = await Promise.all([
    payoutBatchRepository.getAllBatches(),
    adminRepository.getAllMerchants(),
  ]);
  const merchantById = new Map(merchants.map((m) => [m.id, m]));

  const byMerchantMap = new Map();
  for (const batch of batches) {
    const entry = byMerchantMap.get(batch.merchantId) || {
      merchantId: batch.merchantId,
      businessName: merchantById.get(batch.merchantId)?.businessName || 'Unknown',
      pendingBalance: 0,
      eligibleBalance: 0,
      totalPaidLifetime: 0,
      currency: batch.currency || null,
    };
    if (batch.status === 'pending') entry.pendingBalance += batch.netAmount || 0;
    if (batch.status === 'eligible') entry.eligibleBalance += batch.netAmount || 0;
    if (batch.status === 'paid') entry.totalPaidLifetime += batch.netAmount || 0;
    byMerchantMap.set(batch.merchantId, entry);
  }

  const byMerchant = Array.from(byMerchantMap.values())
    .map((entry) => ({
      ...entry,
      pendingBalance: Number(entry.pendingBalance.toFixed(2)),
      eligibleBalance: Number(entry.eligibleBalance.toFixed(2)),
      totalPaidLifetime: Number(entry.totalPaidLifetime.toFixed(2)),
    }))
    .sort((a, b) => b.eligibleBalance + b.pendingBalance - (a.eligibleBalance + a.pendingBalance));

  return { ...summarizeBatches(batches), byMerchant };
}

/** GET /api/admin/payouts — Settlement Management's table, platform-wide. */
async function adminListPayouts({ status, merchantId, page, pageSize } = {}) {
  if (status != null && !BATCH_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status must be one of ${BATCH_STATUSES.join(', ')}.`);
  }
  const parsedPage = page != null ? parseInt(page, 10) : 1;
  const parsedPageSize = pageSize != null ? parseInt(pageSize, 10) : 20;
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pageSize must be a positive integer up to 100.');
  }

  const [result, merchants] = await Promise.all([
    payoutBatchRepository.listAllBatches({
      status: status || null,
      merchantId: merchantId || null,
      page: parsedPage,
      pageSize: parsedPageSize,
    }),
    adminRepository.getAllMerchants(),
  ]);
  const merchantById = new Map(merchants.map((m) => [m.id, m]));

  return {
    ...result,
    items: result.items.map((batch) => ({
      ...serializeBatch(batch),
      businessName: merchantById.get(batch.merchantId)?.businessName || 'Unknown',
    })),
  };
}

/**
 * POST /api/admin/payouts/recalculate — manually triggers
 * calculateEligiblePayouts() (no scheduler is wired up, see module header).
 */
async function adminRecalculate() {
  return calculateEligiblePayouts();
}

/**
 * PATCH /api/admin/payouts/:id/mark-paid — the manual "Paid" action. Only
 * valid from 'eligible' (never 'pending' — nothing to pay yet — and never
 * re-payable once already 'paid').
 */
async function markPayoutPaid(payoutId, adminUid, note) {
  const batch = await payoutBatchRepository.getBatchById(payoutId);
  if (!batch) {
    throw new AppError(404, 'PAYOUT_NOT_FOUND', 'Payout batch not found.');
  }
  if (batch.status === 'paid') {
    throw new AppError(409, 'CONFLICT', 'This payout has already been marked as paid.');
  }
  if (batch.status !== 'eligible') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Only an eligible payout can be marked as paid.');
  }
  if (note != null && typeof note !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'note must be a string.');
  }

  const updated = await payoutBatchRepository.updateBatch(payoutId, {
    status: 'paid',
    paidAt: new Date().toISOString(),
    paidBy: adminUid,
    paidNote: note?.trim() || null,
  });

  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'payout.paid',
    targetId: payoutId,
    notes: note?.trim() || null,
  });

  // Best-effort — a notification failure must never fail the payout record
  // itself, same posture as every other notify() call site in this codebase.
  try {
    await notificationService.notify({ merchantId: batch.merchantId, type: 'payout_paid' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[payout.service] payout_paid notification failed', err);
  }

  return serializeBatch(updated);
}

/**
 * GET /api/admin/payouts/surfboard-settlements — optional, read-only
 * cross-check against Surfboard's own Settlement Reports API. Gracefully
 * returns `{ configured: false }` when no partner-level credential is
 * available (see surfboardService.getSettlementReports's own comment) —
 * this module's core eligibility/history features never depend on it.
 */
async function getSurfboardSettlementReports({ from, to } = {}) {
  return surfboardService.getSettlementReports({ from, to });
}

/**
 * PLACEHOLDER — intentionally unimplemented. This is the one seam a future
 * session should fill in once a real bank-transfer provider is chosen (a
 * banking API, Wise, a local payout rail — Surfboard itself has no such
 * API, confirmed separately). Not called anywhere today: markPayoutPaid
 * above is a manual admin record of a transfer done OUTSIDE this system,
 * per this module's explicit brief ("Do not integrate a real bank transfer
 * provider yet"). Wiring this in later means calling it from
 * markPayoutPaid (or a new "Pay Now" action) instead of trusting the
 * admin's note alone.
 */
async function executeBankTransfer(/* batch */) {
  throw new AppError(501, 'NOT_IMPLEMENTED', 'No bank-transfer provider is integrated yet — mark payouts as Paid manually.');
}

module.exports = {
  calculateEligiblePayouts,
  getMerchantPayoutSummary,
  listMerchantPayouts,
  adminGetSummary,
  adminListPayouts,
  adminRecalculate,
  markPayoutPaid,
  getSurfboardSettlementReports,
  executeBankTransfer,
};
