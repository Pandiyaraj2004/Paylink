const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access ONLY for users/{uid}. No business logic here —
 * see services/auth.service.js for the rules around when/how these are used.
 */
function db() {
  return admin.firestore();
}

async function getUserById(uid) {
  const snap = await db().collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createUser(uid, data) {
  await db().collection('users').doc(uid).set(data);
  return { id: uid, ...data };
}

/**
 * Phase 13 (Section 27 push): adds one FCM device token to
 * `users/{uid}.fcmTokens` (an array, not a subcollection — Section 19.2
 * documents no dedicated fcmTokens collection, and a handful of device
 * tokens per user is small/simple enough to live directly on the user doc,
 * same reasoning as every other small array field elsewhere in this
 * schema). `{ merge: true }` + `arrayUnion` so this is idempotent
 * (re-registering the same token is a no-op) and safe even if `users/{uid}`
 * somehow doesn't exist yet.
 */
async function addFcmToken(uid, token) {
  await db()
    .collection('users')
    .doc(uid)
    .set({ fcmTokens: admin.firestore.FieldValue.arrayUnion(token) }, { merge: true });
}

/**
 * Prunes confirmed-invalid tokens (notification.service.js's sendPush) so a
 * stale token from an uninstalled app / cleared browser data doesn't keep
 * silently failing on every future push forever.
 */
async function removeFcmTokens(uid, tokens) {
  if (!tokens || tokens.length === 0) return;
  await db()
    .collection('users')
    .doc(uid)
    .update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens) });
}

module.exports = { getUserById, createUser, addFcmToken, removeFcmTokens };
