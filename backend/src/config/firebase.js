const path = require('path');
const admin = require('firebase-admin');
const env = require('./env');

/**
 * Initializes the Firebase Admin app. Credential resolution order:
 *   1. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY env vars
 *      (preferred — no secret file needed at all, works as-is in any deploy env)
 *   2. GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_PATH env var
 *      (path to a JSON file, e.g. for local dev convenience)
 *   3. ./firebase-service-account.json sitting next to this file (dev fallback only;
 *      this file must never be committed — see .gitignore)
 *
 * Any failure here is caught and logged as a warning rather than crashing
 * the process — isFirebaseReady is exported so callers (health check,
 * auth middleware) can react to Firebase being unavailable instead of
 * relying on an unhandled throw.
 */
let app = null;
let isFirebaseReady = false;
let initError = null;

function loadCredential() {
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    };
  }
  const credPath = env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (credPath) {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path.resolve(credPath));
  }
  // eslint-disable-next-line global-require
  return require('./firebase-service-account.json');
}

try {
  const serviceAccount = loadCredential();
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  isFirebaseReady = true;
} catch (err) {
  initError = err;
  // eslint-disable-next-line no-console
  console.warn(
    '[firebase] Admin SDK failed to initialize — Firebase-dependent routes will respond 503.',
    err.message
  );
}

module.exports = {
  admin,
  app,
  isFirebaseReady: () => isFirebaseReady,
  initError: () => initError,
};
