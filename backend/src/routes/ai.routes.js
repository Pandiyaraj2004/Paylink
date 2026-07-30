const express = require('express');
const aiController = require('../controllers/ai.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { aiLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// POST /api/ai/setup-concierge
router.post('/setup-concierge', aiLimiter, authMiddleware, requireRole('entrepreneur'), aiController.setupConcierge);

// POST /api/ai/earnings-assistant
router.post(
  '/earnings-assistant',
  aiLimiter,
  authMiddleware,
  requireRole('entrepreneur'),
  aiController.earningsAssistant
);

module.exports = router;
