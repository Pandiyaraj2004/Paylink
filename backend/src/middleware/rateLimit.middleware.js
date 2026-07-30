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

module.exports = { authLimiter, aiLimiter };
