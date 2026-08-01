const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { authLimiter, sessionLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// POST /api/auth/session — fires on every app load for an already-signed-in
// user, not a manual login attempt, so it gets its own more generous limiter
// (see rateLimit.middleware.js's sessionLimiter comment) rather than sharing
// authLimiter's tight login/admin-login budget.
router.post('/session', sessionLimiter, authMiddleware, authController.createSession);

// POST /api/auth/admin-login (master-doc.md Section 16.0/24.4) — Public;
// this endpoint IS the admin login check, not a route an admin reaches
// after authenticating. Rate-limited with the same authLimiter as /session
// since there's no account-lockout/reset flow for Admin to fall back on
// (Section 16.0).
router.post('/admin-login', authLimiter, authController.adminLogin);

module.exports = router;
