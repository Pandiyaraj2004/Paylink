const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// POST /api/auth/session
router.post('/session', authLimiter, authMiddleware, authController.createSession);

module.exports = router;
