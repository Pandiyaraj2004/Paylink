const path = require('path');

// Final production audit (env consolidation): this repo previously carried
// BOTH a `backend/.env` (accumulated stale/duplicate variables from an
// earlier Surfboard integration attempt, never actually read by any code)
// and this file, `.env.local` — both gitignored, neither committed. `.env`
// has been removed as the redundant one; `.env.local` is now the single
// real local/runtime env file, holding actual secrets (Surfboard demo
// credentials, admin credentials, AI provider keys). Firebase Admin SDK
// credentials aren't in either — they resolve via the JSON-file fallback,
// see config/firebase.js's loadCredential(). `dotenv.config()` below is a
// graceful no-op if `backend/.env` doesn't exist (e.g. in production, where
// real secrets come from the platform's own env injection instead), so this
// call is safe to leave in for that scenario without requiring the file to
// exist locally.
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), override: true });

/**
 * Splits a comma-separated env var into a trimmed, non-empty, cased array.
 * Shared by SURFBOARD_ACTIVE_PAYMENT_METHODS/SURFBOARD_ACTIVE_CURRENCIES
 * below so every caller reads an already-parsed array instead of each
 * re-splitting the same raw CSV string.
 */
function parseCsvList(raw, casing) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (casing === 'lower' ? s.toLowerCase() : s.toUpperCase()));
}

/**
 * Typed-ish app configuration, loaded once from process.env via dotenv.
 */
const env = {
  PORT: parseInt(process.env.PORT, 10) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  // ⚠️ Dev-only default. Before any real deployment, set this to the real
  // production frontend origin(s) — never leave it as localhost, and never
  // widen it to '*' (the `cors` package would then reject credentialed
  // requests anyway, since this is used with `credentials: true`, app.js).
  // Only a single origin is supported today; if the frontend is ever served
  // from more than one origin (e.g. a bare domain + `www.`), this needs a
  // comma-separated list + splitting, same pattern as SURFBOARD_ACTIVE_*
  // below (parseCsvList), rather than the single string used here.
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  // Stored in .env with literal \n escapes (PEM newlines don't survive dotenv otherwise).
  FIREBASE_PRIVATE_KEY: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  // AI provider (Phase 9): OpenRouter is tried first; Gemini is the fallback
  // if OpenRouter is unconfigured or its call fails. ANTHROPIC_API_KEY stays
  // supported as a last-resort legacy path in ai.service.js but is no longer
  // the primary provider.
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  SURFBOARD_API_KEY: process.env.SURFBOARD_API_KEY || '',
  SURFBOARD_API_SECRET: process.env.SURFBOARD_API_SECRET || '',
  SURFBOARD_API_BASE_URL: process.env.SURFBOARD_API_BASE_URL || '',
  SURFBOARD_MERCHANT_ID: process.env.SURFBOARD_MERCHANT_ID || '',
  SURFBOARD_STORE_ID: process.env.SURFBOARD_STORE_ID || '',
  SURFBOARD_TERMINAL_ID: process.env.SURFBOARD_TERMINAL_ID || '',
  SURFBOARD_WEBHOOK_CERTIFICATE: process.env.SURFBOARD_WEBHOOK_CERTIFICATE || '',
  SURFBOARD_REDIRECT_BASE_URL: process.env.SURFBOARD_REDIRECT_BASE_URL || 'http://localhost:5173',
  // Dynamic per-order webhook callback (guides/online-payments/integrations/
  // webhooks.md's "dynamic URL flow" — controlFunctions.callBackUrl on
  // createOrder, an alternative to a statically-registered Console
  // webhook). Deliberately blank until this app is deployed to a public
  // HTTPS domain — a localhost URL here would be unreachable from
  // Surfboard's servers and would just look like a bug, so
  // surfboard.service.js omits the field entirely while this is unset.
  SURFBOARD_CALLBACK_URL: process.env.SURFBOARD_CALLBACK_URL || '',
  PAYMENT_RECONCILIATION_TIMEOUT_MINUTES: parseInt(process.env.PAYMENT_RECONCILIATION_TIMEOUT_MINUTES, 10) || 30,
  // How often jobs/paymentReconciliation.job.js's polling loop runs (server.js).
  // This is the PRIMARY mechanism that closes the pending->paid loop right
  // now (Console webhook delivery needs a public URL, deferred to deploy
  // time — see SURFBOARD_CALLBACK_URL above). No cron dependency installed;
  // a plain setInterval is enough for this phase.
  PAYMENT_RECONCILIATION_POLL_INTERVAL_SECONDS: parseInt(process.env.PAYMENT_RECONCILIATION_POLL_INTERVAL_SECONDS, 10) || 60,
  // Payment methods actually ACTIVATED for this Surfboard merchant account
  // right now — a narrower, config-driven subset of what surfboard.service.js's
  // PAYMENT_METHOD_MAP merely knows how to translate (that map describes what
  // Surfboard's API *understands* in general; this describes what's
  // *activated* for THIS account, live-verified against the demo API: only
  // CARD today, Swish is not yet activated). Read by payment.service.js
  // (rejects a not-yet-activated method before ever calling Surfboard) and by
  // GET /api/config/payment-options (drives the frontend's method picker).
  // Widen later by setting this env var + restarting — no code change needed.
  SURFBOARD_ACTIVE_PAYMENT_METHODS: parseCsvList(process.env.SURFBOARD_ACTIVE_PAYMENT_METHODS || 'card', 'lower'),
  // Order currencies actually ACCEPTED for this Surfboard merchant account
  // right now (live-verified: EUR/NOK both fail with a real Surfboard error,
  // `OR_0004: currency code not associated with this merchant` — only SEK
  // works). Read by product.service.js (rejects a non-active currency on
  // catalog items) and GET /api/config/payment-options (drives the
  // frontend's currency selectors). Widen later the same way as above.
  SURFBOARD_ACTIVE_CURRENCIES: parseCsvList(process.env.SURFBOARD_ACTIVE_CURRENCIES || 'SEK', 'upper'),
  // Days a merchant may sit at `pending_setup` before
  // jobs/onboardingReminder.job.js's poll (Phase 13, Section 27's
  // scoped-down "Reminder" event) considers it stale enough to nudge.
  // Defaults to 3 if unset.
  ONBOARDING_REMINDER_STALE_DAYS: parseInt(process.env.ONBOARDING_REMINDER_STALE_DAYS, 10) || 3,
  // Admin authentication (master-doc.md Section 24.4-24.7). Admin does NOT
  // use Firebase at all — a simple Access Code + Password pair, checked
  // directly against these two values, plus a separate ADMIN_JWT_SECRET the
  // backend signs its own short-lived admin session token with (see
  // adminAuth.middleware.js / auth.service.js's handleAdminLogin).
  //
  // These are development-only placeholders, not a production design
  // (Section 24.4's own warning): "Shipping the hardcoded pandisabi/pandisabi
  // pair to production would be a critical security failure." Before any
  // real deployment, replace ADMIN_ACCESS_CODE/ADMIN_PASSWORD with a
  // securely hashed, database-stored credential (bcrypt/argon2, never
  // plaintext) or a proper internal-only identity provider, and rotate
  // ADMIN_JWT_SECRET to a freshly generated value that is never committed to
  // source control — an empty/blank secret here is a real vulnerability, not
  // just an incomplete config.
  ADMIN_ACCESS_CODE: process.env.ADMIN_ACCESS_CODE || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || '',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

module.exports = env;
