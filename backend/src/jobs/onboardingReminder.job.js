const { admin } = require('../config/firebase');
const notificationService = require('../services/notification.service');
const env = require('../config/env');

/**
 * Phase 13 (master-doc.md Section 27) "Reminder" event — SCOPED DOWN from
 * whatever a fuller reminder system might look like, and this file's own
 * header explains why:
 *
 * Section 27's table lists no event literally named "Reminder". Its only
 * reminder-shaped rows are "Recurring charge upcoming" and "Recurring
 * charge failed" — but those don't apply here: PayLink has no recurring
 * billing feature at all. `jobs/recurringBilling.job.js` is an untouched
 * stub, and `jobs/paymentReconciliation.job.js`'s own header already
 * established in an earlier phase that "PayLink is one-time-payment only
 * per Section 25's own framing" (recurring billing only ever appears as a
 * roadmap/FR-21 future item, e.g. Persona 2's "recurring billing setup" —
 * a wishlist need, not a shipped feature).
 *
 * The one genuine, already-real condition in today's data model that a
 * "reminder" honestly fits is a merchant stuck at `pending_setup` —
 * started onboarding (an AI Setup Concierge session, or manual signup) but
 * never finished it, so the store never went live (merchant.service.js's
 * updateMerchantProfile only flips status to `active` once branding lands
 * on a still-pending_setup store). That's exactly the shape
 * paymentReconciliation.job.js already polls for (a status stuck past a
 * configurable age), so this file mirrors that same pattern: find stale
 * `pending_setup` merchants, fire one `onboarding_reminder` notification
 * each via the same notify() path every other event in this phase uses.
 *
 * SCOPING NOTE (same as paymentReconciliation.job.js): exported as a plain
 * callable function, NOT wired to any scheduler. No cron/scheduling
 * dependency is installed in this project; a future session can invoke
 * `sendOnboardingReminders()` from whatever scheduling mechanism is chosen
 * later. This file only implements the polling + notify logic, ready to be
 * called — building a full elaborate scheduler was explicitly out of scope
 * for an event the source doc doesn't even name, let alone specify a cron
 * cadence for.
 */

function db() {
  return admin.firestore();
}

const DEFAULT_STALE_AFTER_DAYS = env.ONBOARDING_REMINDER_STALE_DAYS;

function getStaleAfterDays(override) {
  return override != null ? override : DEFAULT_STALE_AFTER_DAYS;
}

/**
 * Finds top-level `merchants/*` docs still at `pending_setup` whose
 * `createdAt` is older than `staleAfterDays`. A plain (non-collection-group)
 * query is enough here — unlike paymentReconciliation.job.js's `orders`
 * collection-group query, `merchants` is already a top-level collection.
 */
async function findStalePendingSetupMerchants(staleAfterDays) {
  const cutoff = new Date(Date.now() - getStaleAfterDays(staleAfterDays) * 24 * 60 * 60 * 1000);

  const snap = await db()
    .collection('merchants')
    .where('status', '==', 'pending_setup')
    .where('createdAt', '<=', cutoff)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function sendOnboardingReminders(staleAfterDays) {
  const staleMerchants = await findStalePendingSetupMerchants(staleAfterDays);
  const results = [];

  for (const merchant of staleMerchants) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify({ merchantId: merchant.id, type: 'onboarding_reminder' });
      results.push({ merchantId: merchant.id, sent: true });
    } catch (err) {
      results.push({ merchantId: merchant.id, sent: false, error: err.message });
    }
  }

  return results;
}

module.exports = { sendOnboardingReminders, findStalePendingSetupMerchants };
