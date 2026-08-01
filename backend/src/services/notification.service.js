const { admin } = require('../config/firebase');
const merchantRepository = require('../repositories/merchant.repository');
const userRepository = require('../repositories/user.repository');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');
const { serializeTimestamp } = require('../utils/serializeTimestamp');

/**
 * Creates in-app notification documents under `users/{userId}/notifications`
 * (master-doc.md Section 19.2, 27) for the entrepreneur who owns a given
 * merchant. Section 20.1's folder tree lists no dedicated
 * notification.repository.js, so — same as merchant.repository.js owns
 * `merchants/*` and payment.repository.js owns the payment-adjacent
 * collections — this service is the sole data-access point for
 * `users/*\/notifications`, since nothing else in the documented tree owns it.
 *
 * Phase 13: real Firebase Cloud Messaging (FCM) push is now also fired here,
 * best-effort, alongside every in-app write (see sendPush below) — every
 * `notify()` call site gets both channels "for free" instead of every
 * caller having to remember to separately invoke a push function. Email is
 * still NOT implemented: no email provider (SendGrid, SES, etc.) is
 * configured anywhere in this project, and wiring one up is a new
 * third-party integration decision explicitly out of scope for this phase
 * (the user chose to skip it for now) — flagged here rather than
 * fabricated. `jobs/notificationRetry.job.js` (Section 27.1, "retries
 * failed sends") is therefore still left as a stub: in-app writes either
 * succeed or don't, and a failed push send is already handled inline below
 * (pruning a confirmed-invalid token) rather than needing a generic retry
 * queue.
 */
function db() {
  return admin.firestore();
}

const MESSAGES = {
  payment_success: 'You just received a new payment.',
  refund_issued: 'A refund has been issued for one of your orders.',
  // Phase 13 (Section 27, Deviation 1): repurposes the old pre-launch
  // "Merchant approved" event — there's no approval queue anymore
  // (merchant.service.js's updateMerchantProfile flips pending_setup ->
  // active the moment onboarding/branding completes), so this fires at
  // that exact transition instead, as a welcome/launch notice.
  store_live: 'Your store is live! Customers can now find and pay you on your PayLink page.',
  // Repurposes the old pre-launch "Merchant rejected" event — fires when
  // Admin suspends a merchant post-launch (admin.service.js's
  // suspendMerchant), Section 30 business rule 8 ("suspension immediately
  // disables checkout... without deleting any historical data").
  merchant_suspended: 'Your store has been suspended by PayLink. Checkout is disabled until this is resolved — check your email or contact support for details.',
  // "Reminder" (Section 27): the table lists no event literally named
  // "Reminder", and the only reminder-shaped rows there ("Recurring charge
  // upcoming/failed") don't apply — PayLink has no recurring billing
  // feature at all (jobs/recurringBilling.job.js is an untouched stub;
  // paymentReconciliation.job.js's own header already establishes "PayLink
  // is one-time-payment only per Section 25's own framing"). The one
  // genuine reminder-worthy condition that DOES exist in today's data
  // model is a merchant stuck at `pending_setup` (never finished
  // onboarding) — see jobs/onboardingReminder.job.js for the scoped-down
  // trigger this message is used by.
  onboarding_reminder: 'You still have a few steps left to finish setting up your store — jump back into the AI Setup Concierge to go live.',
  // Payout & Settlement Management (master-doc.md Section 25.5) — fires when
  // an admin manually marks an eligible payout batch as paid
  // (payout.service.js's markPayoutPaid).
  payout_paid: 'A payout has been marked as paid to your linked bank account. Check your Payouts page for details.',
};

/**
 * Best-effort FCM push (Phase 13) to every device token registered on the
 * user's `users/{uid}.fcmTokens` array (POST /api/users/me/fcm-token). Never
 * throws — a push failure must never fail the in-app write it accompanies,
 * same "notification delivery is not a payment-correctness concern"
 * principle notify()'s callers already rely on (Section 27.1 is the
 * documented safety net for delivery failures, not this function).
 *
 * Uses `sendEachForMulticast` (one call for however many devices a user has
 * registered — Section 19.2 doesn't specify single vs. multi-device, so
 * this assumes multi-device is possible) and prunes any token FCM reports
 * as confirmed-invalid (unregistered/invalid), so a stale token from an
 * uninstalled app or cleared browser data doesn't keep silently failing
 * forever.
 */
async function sendPush(userId, content) {
  let user;
  try {
    user = await userRepository.getUserById(userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notification.service] could not load user for push', err);
    return;
  }

  const tokens = Array.isArray(user?.fcmTokens) ? user.fcmTokens : [];
  if (tokens.length === 0) {
    // Nothing registered yet — the expected state until a) the frontend has
    // a VAPID key configured (VITE_FIREBASE_VAPID_KEY, currently unset — see
    // .env.example) and b) the user has granted Notification permission.
    // Silently no-op rather than log noise on every single notify() call.
    return;
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title: 'PayLink', body: content },
    });

    const invalidTokens = [];
    response.responses.forEach((result, i) => {
      if (!result.success) {
        const code = result.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          invalidTokens.push(tokens[i]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await userRepository.removeFcmTokens(userId, invalidTokens);
    }
  } catch (err) {
    // A transient FCM outage or a not-yet-configured messaging sender ID —
    // never let this bubble up into the in-app notification path.
    // eslint-disable-next-line no-console
    console.error('[notification.service] push send failed', err);
  }
}

/**
 * @param {{ merchantId: string, type: keyof typeof MESSAGES, orderId?: string }} params
 */
async function notify({ merchantId, type, orderId }) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant || !merchant.userId) {
    // No owner to notify (shouldn't happen in practice) — never throw here,
    // since a missing notification must never fail the payment/refund
    // reconciliation it's a side effect of.
    return null;
  }

  const baseMessage = MESSAGES[type] || 'You have a new notification.';
  const content = orderId ? `${baseMessage} (order ${orderId})` : baseMessage;

  const docRef = db().collection('users').doc(merchant.userId).collection('notifications').doc();
  const data = {
    type,
    channel: 'in_app',
    content,
    status: 'sent',
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await docRef.set(data);

  // Fire-and-forget-but-awaited: sendPush never throws (see its own
  // try/catch), so awaiting it here just means the push attempt has been
  // made before notify() resolves, without ever risking the in-app write
  // above being reported as failed because of a push-side problem.
  await sendPush(merchant.userId, content);

  return { id: docRef.id, ...data };
}

// Section 14.7's validation line: "notifications older than 90 days are
// archived, not deleted." No archival job/field exists yet, so this is
// computed on read rather than stored: the list endpoint below marks each
// entry `archived: true`/`false` based on age, and the document itself is
// never touched or removed.
const ARCHIVE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * GET /api/merchants/:id/notifications (master-doc.md Section 14.7). Reads
 * `users/{userId}/notifications` — the exact same subcollection/shape
 * `notify()` above already writes to — reverse-chronological by `sentAt`.
 * `merchantId` -> `userId` is resolved the same ownership-checked way every
 * other merchant-scoped endpoint does.
 */
async function listNotifications(merchantId, uid) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);

  const snap = await db()
    .collection('users')
    .doc(merchant.userId)
    .collection('notifications')
    .orderBy('sentAt', 'desc')
    .limit(100)
    .get();

  const now = Date.now();
  const items = snap.docs.map((doc) => {
    const data = doc.data();
    const sentAtMillis = data.sentAt?.toMillis ? data.sentAt.toMillis() : null;
    return {
      id: doc.id,
      type: data.type,
      channel: data.channel,
      content: data.content,
      status: data.status,
      sentAt: serializeTimestamp(data.sentAt),
      read: !!data.read,
      archived: sentAtMillis != null ? now - sentAtMillis > ARCHIVE_AFTER_MS : false,
    };
  });

  return { items, total: items.length };
}

/**
 * PATCH /api/notifications/:id/read (master-doc.md Section 14.7). No
 * `merchantId` in the URL — a notification lives under
 * `users/{authenticated uid}/notifications`, so "ownership" here is simply
 * "this is the caller's own subcollection," not a merchant-ownership check.
 */
async function markNotificationRead(uid, notificationId) {
  const docRef = db().collection('users').doc(uid).collection('notifications').doc(notificationId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  }
  await docRef.update({ read: true });
  const updated = snap.data();
  return { id: notificationId, ...updated, read: true, sentAt: serializeTimestamp(updated.sentAt) };
}

module.exports = { notify, listNotifications, markNotificationRead };
