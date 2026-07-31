const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

/**
 * Rate limiter for login/auth-adjacent endpoints (Section 28.3):
 * 5 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
  },
});

/**
 * Rate limiter for AI-adjacent endpoints (Section 22.8, 28.3):
 * ~20 requests per 15 minutes per IP, to control AI API cost exposure.
 */
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
  },
});

/**
 * Rate limiter for the public checkout path (final production audit finding
 * — previously the highest-severity gap: `POST /api/orders` and
 * `POST /api/payments/create` are both fully public/unauthenticated,
 * Firestore-writing, and the latter calls the paid third-party Surfboard API
 * with up to 3 retries on transient failure. 30 requests per 15 minutes per
 * IP is generous for a legitimate customer browsing/retrying a purchase,
 * while still bounding the cost/abuse exposure of an unauthenticated
 * endpoint that can drive real third-party API traffic.
 */
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
  },
});

/**
 * Rate limiter for other public, unauthenticated write endpoints that don't
 * hit a third-party API but are still Firestore-writing and open to
 * spam/abuse: `POST /api/orders/:id/rating` (already guarded by "one rating
 * per order," this adds a per-IP volume bound too) and `POST /api/disputes`.
 */
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'));
  },
});

module.exports = { authLimiter, aiLimiter, checkoutLimiter, publicWriteLimiter };
