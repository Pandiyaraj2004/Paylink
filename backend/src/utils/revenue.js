/**
 * Single source of truth for "how much of an order counts as revenue" —
 * shared by merchant.service.js's Dashboard summary and ai.service.js's AI
 * Earnings Assistant so the two can never quote different numbers for the
 * same period. An order only contributes once it's actually been charged
 * (pending/failed/cancelled are attempts, not money in hand), net of every
 * pending+completed refund against it — the same "committed refunds"
 * definition payment.repository.js's createRefundIfWithinBalance uses for
 * the balance check.
 */
const REVENUE_ORDER_STATUSES = ['paid', 'partially_refunded', 'refunded'];

function netRevenue(order, refundsByOrderId) {
  if (!REVENUE_ORDER_STATUSES.includes(order.status)) return 0;
  const refunds = refundsByOrderId.get(order.id) || [];
  const committed = refunds
    .filter((r) => r.status === 'pending' || r.status === 'completed')
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  return Math.max(0, order.totalAmount - committed);
}

/** Fetches refunds only for orders that could actually have one — skips a wasted read per pending/failed/cancelled order. */
async function loadRefundsByOrderId(paymentRepository, merchantId, orders) {
  const revenueOrders = orders.filter((o) => REVENUE_ORDER_STATUSES.includes(o.status));
  const entries = await Promise.all(
    revenueOrders.map(async (o) => [o.id, await paymentRepository.listRefunds(merchantId, o.id)])
  );
  return new Map(entries);
}

module.exports = { REVENUE_ORDER_STATUSES, netRevenue, loadRefundsByOrderId };
