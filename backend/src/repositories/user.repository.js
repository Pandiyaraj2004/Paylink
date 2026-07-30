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

module.exports = { getUserById, createUser };
