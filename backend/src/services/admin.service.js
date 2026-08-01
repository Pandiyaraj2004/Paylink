const adminRepository = require('../repositories/admin.repository');
const merchantRepository = require('../repositories/merchant.repository');
const disputeRepository = require('../repositories/dispute.repository');
const orderRepository = require('../repositories/order.repository');
const notificationService = require('./notification.service');
const AppError = require('../utils/AppError');
const { serializeTimestamp } = require('../utils/serializeTimestamp');
const { netRevenue, REVENUE_ORDER_STATUSES } = require('../utils/revenue');

/**
 * Business logic behind the Admin Panel (master-doc.md Section 16, 22.9).
 * Ground-up Phase 11 build — see this repo's Phase 11 report for the full
 * rundown of what was built per page.
 *
 * ============================================================================
 * DEVIATION 1 (read this before touching merchant status transitions below):
 * There is no pre-launch admin approval anymore — a merchant goes `active`
 * the moment onboarding completes (merchant.service.js's
 * updateMerchantProfile). Merchant Management is therefore POST-LAUNCH
 * monitoring/enforcement, not a gate:
 *
 *   - suspendMerchant   — THE safeguard. Sets status 'suspended', which
 *     order.service.js's createOrder already blocks on via
 *     merchantService.isMerchantOpen() (only true for 'open'/'active') — no
 *     second enforcement mechanism needed or built here. Requires an
 *     internal note (Section 16.2).
 *   - reactivateMerchant — undoes a suspension. Only valid FROM 'suspended'.
 *   - approveMerchant — repurposed: no longer "let this merchant go live."
 *     Now a review affirmation — either a no-op re-affirmation of an
 *     already-active merchant (audit-logged, e.g. after investigating a
 *     complaint and finding nothing wrong) or, when the merchant is
 *     currently 'rejected', a reversal of that rejection (an appeal
 *     granted). NOT valid on a 'suspended' merchant — Reactivate is the
 *     dedicated path for that, keeping the two recovery flows distinct.
 *   - rejectMerchant — repurposed: no longer "deny pre-launch approval."
 *     Now a stronger-than-suspend, terminal enforcement action (e.g. a
 *     confirmed policy violation) requiring a documented reason — matching
 *     this endpoint's already-documented `{ reason }` request shape
 *     (Section 22.9) even though its meaning has changed.
 * ============================================================================
 */

const MERCHANT_STATUSES = ['pending_setup', 'active', 'open', 'closed', 'suspended', 'rejected'];
const DISPUTE_STATUSES = ['open', 'investigating', 'resolved'];
const RECENT_ONBOARD_WINDOW_DAYS = 7;
const DEFAULT_REPORT_WINDOW_DAYS = 90;
const DASHBOARD_TREND_WINDOW_DAYS = 30;

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function parsePagination(page, pageSize) {
  const parsedPage = page != null ? parseInt(page, 10) : 1;
  const parsedPageSize = pageSize != null ? parseInt(pageSize, 10) : 20;
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
    throw new AppError(400, 'VALIDATION_ERROR', 'pageSize must be a positive integer up to 100.');
  }
  return { page: parsedPage, pageSize: parsedPageSize };
}

/**
 * `from`/`to` query params, shared by Reports/Analytics/Refunds. Defaults to
 * a `defaultWindowDays`-day lookback ending now when unset, matching
 * SalesTrendChart's own bounded-window philosophy on the entrepreneur side.
 */
function parseDateRange(from, to, defaultWindowDays = DEFAULT_REPORT_WINDOW_DAYS) {
  const toDate = to != null ? new Date(to) : new Date();
  if (Number.isNaN(toDate.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'to must be a valid date.');
  }
  const fromDate = from != null ? new Date(from) : daysAgo(defaultWindowDays);
  if (Number.isNaN(fromDate.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from must be a valid date.');
  }
  return { fromDate, toDate };
}

function orderTimeMillis(order) {
  const iso = serializeTimestamp(order.createdAt);
  return iso ? new Date(iso).getTime() : 0;
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

function serializeMerchant(merchant) {
  return { ...merchant, createdAt: serializeTimestamp(merchant.createdAt) };
}

/* ------------------------------------------------------------------------ */
/* 16.1 Dashboard                                                            */
/* ------------------------------------------------------------------------ */

/**
 * GET /api/admin/summary (Section 16.1, 22.9-adjacent). "Pending approvals"
 * from the original doc doesn't apply post-Deviation-1 — repurposed as
 * "recently onboarded" (merchants created in the last 7 days), a genuinely
 * live, non-dead metric for a panel whose approval queue no longer exists.
 */
async function getSummary() {
  const [activeMerchantCount, recentlyOnboardedCount, openDisputesCount, orders, refunds] = await Promise.all([
    adminRepository.countMerchantsByStatus(['open', 'active']),
    adminRepository.countRecentMerchants(daysAgo(RECENT_ONBOARD_WINDOW_DAYS)),
    disputeRepository.countDisputesByStatus(['open', 'investigating']),
    adminRepository.getAllOrdersAcrossMerchants(),
    adminRepository.getAllRefundsAcrossMerchants(),
  ]);

  const refundsByOrderId = buildRefundsByOrderId(refunds);
  const trendStart = daysAgo(DASHBOARD_TREND_WINDOW_DAYS).getTime();
  const trendByDay = new Map();
  let totalVolume = 0;

  for (const order of orders) {
    const net = netRevenue(order, refundsByOrderId);
    totalVolume += net;
    const millis = orderTimeMillis(order);
    if (net > 0 && millis >= trendStart) {
      const day = new Date(millis).toISOString().slice(0, 10);
      trendByDay.set(day, (trendByDay.get(day) || 0) + net);
    }
  }

  const trend = Array.from(trendByDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, total]) => ({ date, total: Number(total.toFixed(2)) }));

  return {
    totalActiveMerchants: activeMerchantCount,
    recentlyOnboarded: recentlyOnboardedCount,
    openDisputes: openDisputesCount,
    totalVolume: Number(totalVolume.toFixed(2)),
    trend,
  };
}

/* ------------------------------------------------------------------------ */
/* 16.2 Merchant Management                                                  */
/* ------------------------------------------------------------------------ */

/** GET /api/admin/merchants (Section 22.9): `status`, `page`, `pageSize`. */
async function listMerchants({ status, page, pageSize } = {}) {
  if (status != null && !MERCHANT_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status must be one of ${MERCHANT_STATUSES.join(', ')}.`);
  }
  const { page: parsedPage, pageSize: parsedPageSize } = parsePagination(page, pageSize);

  const result = await adminRepository.listMerchants({ status: status || null, page: parsedPage, pageSize: parsedPageSize });
  return { ...result, items: result.items.map(serializeMerchant) };
}

async function getMerchantOr404(merchantId) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  return merchant;
}

/**
 * POST /api/admin/merchants/:id/suspend — NOT in Section 22.9 (suspension
 * is a new, post-Deviation-1 concept) but follows the exact same
 * request/response shape convention as approve/reject: `{ status }` back,
 * an internal note in (Section 16.2: "suspension requires an internal note
 * (admin-only)").
 */
async function suspendMerchant(merchantId, adminUid, note) {
  const merchant = await getMerchantOr404(merchantId);
  if (typeof note !== 'string' || !note.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'note is required to suspend a merchant.');
  }
  if (merchant.status === 'suspended') {
    throw new AppError(409, 'CONFLICT', 'This merchant is already suspended.');
  }

  const updated = await merchantRepository.updateMerchant(merchantId, { status: 'suspended' });
  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'merchant.suspended',
    targetId: merchantId,
    notes: note.trim(),
  });

  // Phase 13 (Section 27, Deviation 1): "Suspension notice" — repurposes
  // the old pre-launch "Merchant rejected" event. Best-effort: a
  // notification failure must never fail the suspension itself (Section
  // 30 business rule 8 — checkout is disabled the moment status flips,
  // regardless of whether the entrepreneur was successfully notified).
  try {
    await notificationService.notify({ merchantId, type: 'merchant_suspended' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin.service] merchant_suspended notification failed', err);
  }

  return { status: updated.status };
}

/** POST /api/admin/merchants/:id/reactivate — undoes suspendMerchant above. */
async function reactivateMerchant(merchantId, adminUid) {
  const merchant = await getMerchantOr404(merchantId);
  if (merchant.status !== 'suspended') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Only a suspended merchant can be reactivated.');
  }

  const updated = await merchantRepository.updateMerchant(merchantId, { status: 'active' });
  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'merchant.reactivated',
    targetId: merchantId,
    notes: null,
  });
  return { status: updated.status };
}

/** POST /api/admin/merchants/:id/approve — see module header for the repurposed meaning. */
async function approveMerchant(merchantId, adminUid) {
  const merchant = await getMerchantOr404(merchantId);
  if (merchant.status === 'suspended') {
    throw new AppError(409, 'CONFLICT', 'This merchant is suspended — use Reactivate, not Approve.');
  }

  const updated = await merchantRepository.updateMerchant(merchantId, { status: 'active' });
  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'merchant.approved',
    targetId: merchantId,
    notes: null,
  });
  return { status: updated.status };
}

/** POST /api/admin/merchants/:id/reject — see module header for the repurposed meaning. */
async function rejectMerchant(merchantId, adminUid, reason) {
  await getMerchantOr404(merchantId);
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reason is required to reject a merchant.');
  }

  const updated = await merchantRepository.updateMerchant(merchantId, { status: 'rejected' });
  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'merchant.rejected',
    targetId: merchantId,
    notes: reason.trim(),
  });
  return { status: updated.status };
}

/**
 * DELETE /api/admin/merchants/:id — new, genuinely destructive and
 * irreversible: permanently removes this merchant's document plus every
 * piece of Firestore data tied to it (adminRepository.deleteMerchantData —
 * see that function's own comment for the exact list). Deliberately does
 * NOT touch the owning Firebase Auth account/`users/{userId}` doc — the
 * entrepreneur's login survives; they'd simply land back at onboarding with
 * a clean slate if they signed in again.
 *
 * Guard: only a merchant that has NEVER taken a real payment (no order ever
 * reached `paid`/`partially_refunded`/`refunded` — REVENUE_ORDER_STATUSES,
 * the same definition Reports/Analytics/the Payout module already share)
 * may be hard-deleted. A merchant with real transaction history must be
 * handled via Suspend instead, which disables checkout while explicitly
 * preserving historical/financial records — this project's existing,
 * documented posture (master-doc.md's own FAQ: "historical data is
 * preserved, not deleted" on suspension). This keeps Delete a safe
 * test-data/cleanup tool rather than a way to erase real financial records.
 */
async function deleteMerchant(merchantId, adminUid) {
  const merchant = await getMerchantOr404(merchantId);

  const orders = await orderRepository.getAllOrders(merchantId);
  const hasRealPaymentHistory = orders.some((o) => REVENUE_ORDER_STATUSES.includes(o.status));
  if (hasRealPaymentHistory) {
    throw new AppError(
      409,
      'CONFLICT',
      'This merchant has real payment history and cannot be permanently deleted — use Suspend instead to disable their store while preserving financial records.'
    );
  }

  // Captured before the delete, since the merchant document itself won't
  // exist to reference afterward — this is what makes the audit-trail entry
  // below actually meaningful rather than just a dangling targetId.
  const auditSummary = {
    businessName: merchant.businessName || null,
    category: merchant.category || null,
    pageSlug: merchant.pageSlug || null,
    orderCount: orders.length,
  };

  const result = await adminRepository.deleteMerchantData(merchant);

  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'merchant.deleted',
    targetId: merchantId,
    notes: JSON.stringify(auditSummary),
  });

  return { status: 'deleted', merchantId, ...result };
}

/* ------------------------------------------------------------------------ */
/* 16.3 Reports & Analytics                                                  */
/* ------------------------------------------------------------------------ */

/**
 * GET /api/admin/reports (Section 22.9: `from`, `to`, `category`, `region`).
 * DOC-CONFLICT: the documented merchant schema (Section 19.2) has no
 * `region` field anywhere — only `category`. Accepted here for
 * forward-compatibility with the documented query-string shape but silently
 * ignored, exactly the same "don't invent an undocumented field" stance
 * merchant.service.js's getPublicPage comment already takes for a similar
 * gap.
 */
async function getReports({ from, to, category } = {}) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const [orders, refunds, merchants, settings] = await Promise.all([
    adminRepository.getAllOrdersAcrossMerchants(),
    adminRepository.getAllRefundsAcrossMerchants(),
    adminRepository.getAllMerchants(),
    adminRepository.getPlatformSettings(),
  ]);

  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const refundsByOrderId = buildRefundsByOrderId(refunds);
  const fromMillis = fromDate.getTime();
  const toMillis = toDate.getTime();

  const byMerchant = new Map();
  let totalVolume = 0;
  let totalOrders = 0;

  for (const order of orders) {
    const millis = orderTimeMillis(order);
    if (millis < fromMillis || millis > toMillis) continue;
    if (category && merchantById.get(order.merchantId)?.category !== category) continue;

    const net = netRevenue(order, refundsByOrderId);
    totalVolume += net;
    totalOrders += 1;

    const entry = byMerchant.get(order.merchantId) || {
      merchantId: order.merchantId,
      businessName: merchantById.get(order.merchantId)?.businessName || 'Unknown',
      volume: 0,
      orderCount: 0,
    };
    entry.volume += net;
    entry.orderCount += 1;
    byMerchant.set(order.merchantId, entry);
  }

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    totalVolume: Number(totalVolume.toFixed(2)),
    totalOrders,
    // Settings-driven derived figure (Section 16.6) — a real read, not a
    // display-only toggle: changing platformFeePercent in Settings changes
    // this number on the very next call.
    platformFeePercent: settings.platformFeePercent,
    estimatedPlatformRevenue: Number((totalVolume * (settings.platformFeePercent / 100)).toFixed(2)),
    byMerchant: Array.from(byMerchant.values())
      .map((entry) => ({ ...entry, volume: Number(entry.volume.toFixed(2)) }))
      .sort((a, b) => b.volume - a.volume),
  };
}

/**
 * GET /api/admin/analytics (Section 16.3's Analytics tab — same underlying
 * data as Reports, deeper cut): a daily volume trend plus a per-category
 * breakdown and platform-wide refund rate. Deliberately scoped to what's
 * derivable from existing order/refund data — no new analytics engine.
 */
async function getAnalytics({ from, to } = {}) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const [orders, refunds, merchants] = await Promise.all([
    adminRepository.getAllOrdersAcrossMerchants(),
    adminRepository.getAllRefundsAcrossMerchants(),
    adminRepository.getAllMerchants(),
  ]);

  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const refundsByOrderId = buildRefundsByOrderId(refunds);
  const fromMillis = fromDate.getTime();
  const toMillis = toDate.getTime();

  const trendByDay = new Map();
  const byCategory = new Map();
  let grossVolume = 0;
  let refundedVolume = 0;

  for (const order of orders) {
    const millis = orderTimeMillis(order);
    if (millis < fromMillis || millis > toMillis) continue;

    const net = netRevenue(order, refundsByOrderId);
    if (net > 0) {
      const day = new Date(millis).toISOString().slice(0, 10);
      trendByDay.set(day, (trendByDay.get(day) || 0) + net);

      const category = merchantById.get(order.merchantId)?.category || 'Uncategorized';
      byCategory.set(category, (byCategory.get(category) || 0) + net);
    }

    if (REVENUE_ORDER_STATUSES.includes(order.status)) {
      grossVolume += order.totalAmount;
    }
  }

  for (const refund of refunds) {
    const millis = refund.createdAt ? new Date(serializeTimestamp(refund.createdAt)).getTime() : 0;
    if (millis < fromMillis || millis > toMillis) continue;
    if (refund.status === 'completed' || refund.status === 'pending') {
      refundedVolume += refund.amount || 0;
    }
  }

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    trend: Array.from(trendByDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, total]) => ({ date, total: Number(total.toFixed(2)) })),
    byCategory: Array.from(byCategory.entries())
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total),
    refundRate: grossVolume > 0 ? Number((refundedVolume / grossVolume).toFixed(4)) : 0,
  };
}

/* ------------------------------------------------------------------------ */
/* 16.4 Refunds & Disputes                                                   */
/* ------------------------------------------------------------------------ */

/**
 * GET /api/admin/refunds (Section 16.4's Refunds tab) — platform-wide,
 * read-only, and flags merchants exceeding a configurable refund-rate
 * threshold (Section 16.6's `refundRateAlertThreshold` setting). The
 * `refundFlaggingEnabled` boolean feature flag gates whether flagging runs
 * at all — a real, load-bearing toggle, not a decorative one.
 */
async function getRefunds({ from, to } = {}) {
  const { fromDate, toDate } = parseDateRange(from, to);
  const [orders, refunds, merchants, settings] = await Promise.all([
    adminRepository.getAllOrdersAcrossMerchants(),
    adminRepository.getAllRefundsAcrossMerchants(),
    adminRepository.getAllMerchants(),
    adminRepository.getPlatformSettings(),
  ]);

  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const fromMillis = fromDate.getTime();
  const toMillis = toDate.getTime();

  const items = refunds
    .filter((r) => {
      const millis = r.createdAt ? new Date(serializeTimestamp(r.createdAt)).getTime() : 0;
      return millis >= fromMillis && millis <= toMillis;
    })
    .map((r) => ({
      ...r,
      createdAt: serializeTimestamp(r.createdAt),
      businessName: merchantById.get(r.merchantId)?.businessName || 'Unknown',
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let flaggedMerchants = [];
  if (settings.refundFlaggingEnabled) {
    const grossByMerchant = new Map();
    const refundedByMerchant = new Map();

    for (const order of orders) {
      if (!REVENUE_ORDER_STATUSES.includes(order.status)) continue;
      grossByMerchant.set(order.merchantId, (grossByMerchant.get(order.merchantId) || 0) + order.totalAmount);
    }
    for (const refund of refunds) {
      if (refund.status !== 'completed' && refund.status !== 'pending') continue;
      refundedByMerchant.set(refund.merchantId, (refundedByMerchant.get(refund.merchantId) || 0) + (refund.amount || 0));
    }

    for (const [merchantId, gross] of grossByMerchant.entries()) {
      const refunded = refundedByMerchant.get(merchantId) || 0;
      if (gross > 0 && refunded / gross > settings.refundRateAlertThreshold) {
        flaggedMerchants.push({
          merchantId,
          businessName: merchantById.get(merchantId)?.businessName || 'Unknown',
          refundRate: Number((refunded / gross).toFixed(4)),
        });
      }
    }
    flaggedMerchants.sort((a, b) => b.refundRate - a.refundRate);
  }

  return {
    items,
    total: items.length,
    flaggedMerchants,
    refundRateAlertThreshold: settings.refundRateAlertThreshold,
    refundFlaggingEnabled: settings.refundFlaggingEnabled,
  };
}

/** GET /api/admin/disputes (Section 16.4's Disputes tab). */
async function listDisputes({ status, page, pageSize } = {}) {
  if (status != null && !DISPUTE_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status must be one of ${DISPUTE_STATUSES.join(', ')}.`);
  }
  const { page: parsedPage, pageSize: parsedPageSize } = parsePagination(page, pageSize);

  const result = await disputeRepository.listDisputes({ status: status || null, page: parsedPage, pageSize: parsedPageSize });
  return {
    ...result,
    items: result.items.map((d) => ({
      ...d,
      createdAt: serializeTimestamp(d.createdAt),
      resolvedAt: serializeTimestamp(d.resolvedAt),
    })),
  };
}

/**
 * PATCH /api/admin/disputes/:id — resolution action (Section 16.4: "every
 * dispute resolution action requires a note, and resolved disputes are
 * locked from further edits"). Also allows moving open -> investigating
 * without a note yet (a legitimate intermediate triage step the doc's
 * status enum documents: open/investigating/resolved) — the note is only
 * mandatory once `status` becomes 'resolved'.
 */
async function resolveDispute(disputeId, adminUid, { status, resolutionNotes } = {}) {
  const dispute = await disputeRepository.getDisputeById(disputeId);
  if (!dispute) {
    throw new AppError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found.');
  }
  if (dispute.status === 'resolved') {
    throw new AppError(409, 'CONFLICT', 'This dispute is already resolved and can no longer be edited.');
  }
  if (status == null || !DISPUTE_STATUSES.includes(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status must be one of ${DISPUTE_STATUSES.join(', ')}.`);
  }
  if (status === 'resolved' && (typeof resolutionNotes !== 'string' || !resolutionNotes.trim())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'resolutionNotes is required to resolve a dispute.');
  }
  if (resolutionNotes != null && typeof resolutionNotes !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'resolutionNotes must be a string.');
  }

  const patch = { status };
  if (resolutionNotes != null) patch.resolutionNotes = resolutionNotes.trim();
  if (status === 'resolved') patch.resolvedAt = new Date().toISOString();

  const updated = await disputeRepository.updateDispute(disputeId, patch);
  await adminRepository.createAdminAction({
    adminId: adminUid,
    actionType: 'dispute.updated',
    targetId: disputeId,
    notes: resolutionNotes || null,
  });

  return {
    ...updated,
    createdAt: serializeTimestamp(updated.createdAt),
    resolvedAt: serializeTimestamp(updated.resolvedAt),
  };
}

/* ------------------------------------------------------------------------ */
/* 16.5 System (Logs / Monitoring)                                           */
/* ------------------------------------------------------------------------ */

/** GET /api/admin/logs (Section 16.5) — the append-only adminActions audit trail. */
async function listLogs({ page, pageSize } = {}) {
  const { page: parsedPage, pageSize: parsedPageSize } = parsePagination(page, pageSize);
  const result = await adminRepository.listAdminActions({ page: parsedPage, pageSize: parsedPageSize });
  return { ...result, items: result.items.map((a) => ({ ...a, createdAt: serializeTimestamp(a.createdAt) })) };
}

/**
 * GET /api/admin/monitoring (Section 16.5) — a live health-check dashboard,
 * NOT a real metrics-aggregation system. Section 16.5 asks for "API
 * latency, payment success rate, AI response times, error rates" — but no
 * request-timing or error data is persisted anywhere in this codebase today
 * (requestLogger.middleware.js only stamps a correlationId and logs to
 * stdout via morgan; nothing is written to Firestore). Building a real
 * metrics pipeline just for this tile is out-of-scope scope-creep for an
 * MVP admin panel, so this reports what's HONESTLY available instead:
 *   - Firebase / Surfboard connection health (isFirebaseReady,
 *     surfboard.service.js's already-built checkConnection()).
 *   - Which AI provider(s) are configured (env var presence only — no live
 *     call is made, deliberately, to avoid spending a real AI request just
 *     to render a health tile).
 *   - Payment success rate — genuinely DERIVABLE from real order data
 *     (paid vs. failed orders in the last 24h), so this one tile IS real.
 * API latency / error-rate tiles are not implemented; see the Phase 11
 * report for this call-out.
 */
async function getMonitoring() {
  // Required lazily to avoid a require-cycle at module-load time (both
  // files are plain CommonJS singletons with no circular dependency today,
  // but surfboard.service.js is a heavy module best not pulled in unless
  // this endpoint is actually hit).
  // eslint-disable-next-line global-require
  const surfboardService = require('./surfboard.service');
  // eslint-disable-next-line global-require
  const { isFirebaseReady } = require('../config/firebase');
  // eslint-disable-next-line global-require
  const env = require('../config/env');

  const [surfboardStatus, orders] = await Promise.all([
    surfboardService.checkConnection(),
    adminRepository.getAllOrdersAcrossMerchants(),
  ]);

  const since = daysAgo(1).getTime();
  const recentTerminalOrders = orders.filter((o) => {
    const millis = orderTimeMillis(o);
    return millis >= since && (o.status === 'paid' || o.status === 'failed');
  });
  const paidCount = recentTerminalOrders.filter((o) => o.status === 'paid').length;

  return {
    firebase: { ready: isFirebaseReady() },
    surfboard: surfboardStatus,
    aiProviders: {
      openRouterConfigured: !!env.OPENROUTER_API_KEY,
      geminiConfigured: !!env.GEMINI_API_KEY,
    },
    paymentSuccessRate24h: recentTerminalOrders.length > 0 ? Number((paidCount / recentTerminalOrders.length).toFixed(4)) : null,
    sampledOrders24h: recentTerminalOrders.length,
  };
}

/* ------------------------------------------------------------------------ */
/* 16.6 Settings                                                            */
/* ------------------------------------------------------------------------ */

/**
 * GET/PATCH /api/admin/platform-settings (Section 16.6). Deliberately
 * minimal — a single `platformSettings/config` document with four fields,
 * every one of them actually read somewhere in this file (see each field's
 * own call site above): `platformFeePercent` (Reports' estimated platform
 * revenue), `refundRateAlertThreshold` + `refundFlaggingEnabled` (Refunds
 * tab flagging), `maintenanceMode` (order.service.js's createOrder — a
 * platform-wide checkout kill-switch, the one setting here with a
 * merchant-facing effect; see that file's own comment). No toggle here does
 * nothing.
 *
 * NOTE for a future Phase 12: Phase 11's own doc section (16.6) already
 * covers "Platform Settings, Fees, Feature Flags" — if a later Phase 12
 * "Settings" pass is planned, it should NOT rebuild this; extend
 * DEFAULT_PLATFORM_SETTINGS / the validation below instead.
 */
async function getPlatformSettings() {
  return adminRepository.getPlatformSettings();
}

async function updatePlatformSettings(patch, adminUid) {
  const update = {};

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'platformFeePercent')) {
    const v = patch.platformFeePercent;
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 100) {
      throw new AppError(400, 'VALIDATION_ERROR', 'platformFeePercent must be a number between 0 and 100.');
    }
    update.platformFeePercent = v;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'refundRateAlertThreshold')) {
    const v = patch.refundRateAlertThreshold;
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'refundRateAlertThreshold must be a number between 0 and 1.');
    }
    update.refundRateAlertThreshold = v;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'maintenanceMode')) {
    if (typeof patch.maintenanceMode !== 'boolean') {
      throw new AppError(400, 'VALIDATION_ERROR', 'maintenanceMode must be a boolean.');
    }
    update.maintenanceMode = patch.maintenanceMode;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'refundFlaggingEnabled')) {
    if (typeof patch.refundFlaggingEnabled !== 'boolean') {
      throw new AppError(400, 'VALIDATION_ERROR', 'refundFlaggingEnabled must be a boolean.');
    }
    update.refundFlaggingEnabled = patch.refundFlaggingEnabled;
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Provide at least one of platformFeePercent, refundRateAlertThreshold, maintenanceMode, refundFlaggingEnabled.'
    );
  }

  const updated = await adminRepository.updatePlatformSettings(update);
  await adminRepository.createAdminAction({
    adminId: adminUid,
    // Section 16.6: "high-impact changes... logged with extra detail in the
    // audit trail" — the JSON-serialized diff IS that extra detail.
    actionType: 'settings.updated',
    targetId: 'platformSettings/config',
    notes: JSON.stringify(update),
  });
  return updated;
}

module.exports = {
  getSummary,
  listMerchants,
  suspendMerchant,
  reactivateMerchant,
  approveMerchant,
  rejectMerchant,
  deleteMerchant,
  getReports,
  getAnalytics,
  getRefunds,
  listDisputes,
  resolveDispute,
  listLogs,
  getMonitoring,
  getPlatformSettings,
  updatePlatformSettings,
};
