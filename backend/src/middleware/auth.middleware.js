const { admin, isFirebaseReady } = require('../config/firebase');
const AppError = require('../utils/AppError');

/**
 * Verifies the Firebase ID token in the Authorization header
 * (`Bearer <token>`) via admin.auth().verifyIdToken(), and attaches
 * req.user = { uid, email, ...decodedToken } on success.
 *
 * If Firebase Admin failed to initialize, responds 503 SERVICE_UNAVAILABLE
 * instead of throwing, per master-doc.md Section 24.2 / 20.3.
 */
async function authMiddleware(req, res, next) {
  if (!isFirebaseReady()) {
    return next(
      new AppError(503, 'SERVICE_UNAVAILABLE', 'Authentication service is temporarily unavailable.')
    );
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'INVALID_TOKEN', 'Missing or malformed Authorization header.'));
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      ...decodedToken,
    };
    return next();
  } catch (err) {
    return next(new AppError(401, 'INVALID_TOKEN', 'The provided Firebase ID token is invalid or expired.'));
  }
}

module.exports = authMiddleware;
