// Reserved for Phase 6+ — settlement payout job. See master-doc.md Section 20.1.
//
// Deliberately left as a stub in this Phase 6 pass (Order/Payment/Webhook/
// Refund/Receipt backend) — deprioritized in favor of the Order Engine,
// Payment Engine, webhook processing, refund balance-checking transaction,
// and receipt data endpoints, which are this phase's primary scope.
//
// master-doc.md Section 25.5: "PayLink holds a brief reserve per
// Surfboard's standard settlement terms before releasing entrepreneur
// payouts... on a configurable cycle (e.g., weekly), managed by
// jobs/settlementPayout.job.js." Sketch of what a real implementation
// would do, for a future session:
//   1. Collection-group query (Section 19.4) across every merchant's
//      `orders` for status === 'paid' with `payment.capturedAt` older than
//      the configured settlement reserve period (e.g. 7 days) and not yet
//      marked as paid out (would need a new `payoutStatus`/`payoutAt`-style
//      field on the order, or a separate `payouts/{payoutId}` collection —
//      neither exists in the documented Section 19.2 schema today, so this
//      would need its own schema-gap resolution before implementation).
//   2. Group matching orders by merchantId, sum totalAmount minus any
//      completed refunds against each, to get each entrepreneur's payable
//      balance for the cycle.
//   3. Call a (currently undocumented, and un-designed here) Surfboard
//      payout/transfer API via surfboard.service.js — Section 23's table
//      lists no "Payout"/"Transfer" Surfboard API the way it lists
//      Payment Processing/Refund Operations, so this also needs surfacing
//      to Surfboard's real API docs (or a deliberate scope decision) before
//      it can be built for real, not just implemented speculatively.
//   4. Mark the settled orders accordingly and notify each entrepreneur
//      (notification.service.js), mirroring the payment/refund
//      notification pattern already implemented for Phase 6.
//
// Exported as nothing yet — no scheduler dependency is installed either
// (same scoping note as jobs/paymentReconciliation.job.js).
