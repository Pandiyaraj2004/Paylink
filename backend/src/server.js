const app = require('./app');
const env = require('./config/env');
const surfboardService = require('./services/surfboard.service');
const { reconcileAuthorizedPayments } = require('./jobs/paymentReconciliation.job');

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] PayLink backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Startup visibility for Admin auth (master-doc.md Section 24.4-24.7) — a
// missing ADMIN_ACCESS_CODE/ADMIN_PASSWORD/ADMIN_JWT_SECRET means
// POST /api/auth/admin-login and every /api/admin/* route respond 503
// rather than ever accepting/verifying a login, so it's worth flagging
// loudly here rather than only discovering it on the first real admin
// login attempt. An empty ADMIN_JWT_SECRET in particular is called out on
// its own: signing tokens with a blank secret would be a real
// vulnerability, not just an incomplete config, so this never happens
// silently (env.js/adminAuth.middleware.js both treat it as unconfigured).
if (!env.ADMIN_ACCESS_CODE || !env.ADMIN_PASSWORD || !env.ADMIN_JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    '[admin-auth] ADMIN_ACCESS_CODE/ADMIN_PASSWORD/ADMIN_JWT_SECRET not fully configured — POST /api/auth/admin-login and every /api/admin/* route will respond 503 until all three are set (see backend/.env.example, master-doc.md Section 24.4).'
  );
}

/**
 * Runs jobs/paymentReconciliation.job.js on a plain `setInterval` — no cron
 * dependency is installed (nor needed for this phase). This is currently
 * the PRIMARY mechanism that closes the pending->paid/failed/cancelled
 * loop: real Surfboard webhook delivery needs a publicly reachable HTTPS
 * URL, which this app doesn't have yet (deferred to deploy time — see
 * SURFBOARD_CALLBACK_URL in .env.example/config/env.js). The webhook
 * endpoint itself (app.js/payment.controller.js) stays fully registered
 * and functional for whenever real delivery does arrive; this poll is a
 * stand-in for it until then, reusing the exact same idempotent
 * reconciliation path (see paymentReconciliation.job.js's own docs).
 *
 * A thrown error from one run is caught and logged here so it can never
 * kill the interval — the next tick still fires on schedule regardless of
 * how badly the previous one failed.
 */
const RECONCILIATION_INTERVAL_MS = env.PAYMENT_RECONCILIATION_POLL_INTERVAL_SECONDS * 1000;

setInterval(() => {
  reconcileAuthorizedPayments()
    .then((results) => {
      if (results.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[reconciliation] checked ${results.length} stale order(s) — ${results.filter((r) => r.reconciled).length} reconciled.`
        );
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[reconciliation] poll run threw unexpectedly — will retry next tick.', err.message);
    });
}, RECONCILIATION_INTERVAL_MS);

// eslint-disable-next-line no-console
console.log(
  `[reconciliation] polling jobs/paymentReconciliation.job.js every ${env.PAYMENT_RECONCILIATION_POLL_INTERVAL_SECONDS}s.`
);

// Startup validation for the Surfboard payment provider — a read-only,
// non-mutating check (surfboard.service.js's checkConnection), fired here
// so a misconfigured/unreachable provider is visible in the logs
// immediately rather than only surfacing on the first real checkout. Never
// blocks or delays server boot, and never throws/crashes the process —
// same graceful-degradation philosophy as config/firebase.js's
// isFirebaseReady() warning. Being unconfigured (SURFBOARD_API_KEY/
// SURFBOARD_API_SECRET/SURFBOARD_API_BASE_URL/SURFBOARD_MERCHANT_ID/
// SURFBOARD_TERMINAL_ID blank) is expected in an environment with no
// Surfboard account at all, so that case logs an info-level notice, not a
// warning — separately, the webhook endpoint has its own unconfigured
// check (SURFBOARD_WEBHOOK_CERTIFICATE) that responds 503 per-request
// rather than at startup, since it gates an inbound route, not an
// outbound call.
surfboardService
  .checkConnection()
  .then((result) => {
    if (!result.configured) {
      // eslint-disable-next-line no-console
      console.log('[surfboard] Not configured — payment/refund routes will respond 503 until SURFBOARD_* env vars are set.');
      return;
    }
    if (result.ok) {
      // eslint-disable-next-line no-console
      console.log('[surfboard] Connection check passed — credentials are valid against the configured API.');
    } else {
      // eslint-disable-next-line no-console
      console.warn('[surfboard] Configured but the connection check failed — payment/refund calls may fail.', result.error);
    }
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[surfboard] Connection check threw unexpectedly.', err.message);
  });
