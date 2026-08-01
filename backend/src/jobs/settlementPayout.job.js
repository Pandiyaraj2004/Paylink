const payoutService = require('../services/payout.service');

/**
 * Payout & Settlement Management (master-doc.md Section 25.5): "PayLink
 * holds a brief reserve per Surfboard's standard settlement terms before
 * releasing entrepreneur payouts... on a configurable cycle (e.g., weekly),
 * managed by jobs/settlementPayout.job.js." All of the actual calculation
 * logic (bundling newly-captured orders into payout batches, promoting a
 * batch from pending to eligible once the reserve elapses or Surfboard's
 * own Order Status API confirms settlement) lives in
 * services/payout.service.js's calculateEligiblePayouts() — this file is a
 * thin, callable wrapper around it, matching payout.service.js's own
 * "clean service interface" design goal.
 *
 * SCOPING NOTE (same posture as jobs/paymentReconciliation.job.js): exported
 * as a plain callable function, NOT wired to any scheduler — no cron/
 * scheduling dependency is installed in this project. Today this runs via
 * the Admin Settlement Management page's "Recalculate" action
 * (POST /api/admin/payouts/recalculate -> payoutController.adminRecalculate
 * -> payoutService.adminRecalculate -> this same calculateEligiblePayouts()
 * call). A future session can wire this same function into whatever
 * scheduling mechanism is chosen later (in-process cron, a cloud scheduler
 * HTTP trigger, etc.) to run it automatically on a fixed cycle instead.
 */
async function runSettlementPayoutCycle() {
  return payoutService.calculateEligiblePayouts();
}

module.exports = { runSettlementPayoutCycle };
