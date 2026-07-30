const express = require('express');
const merchantController = require('../controllers/merchant.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

// GET /api/merchants/:slug/public-page — Public, no auth (master-doc.md
// Section 22.2, 15.1). Declared before the authenticated `/:id*` routes so
// it's unambiguously reachable without a token; the path shape (2 segments,
// literal "public-page" suffix) never collides with `/:id/status` or
// `/:id/summary` below regardless of registration order.
router.get('/:slug/public-page', merchantController.getPublicPage);

// GET /api/merchants/:id
router.get('/:id', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchant);

// PATCH /api/merchants/:id
router.patch('/:id', authMiddleware, requireRole('entrepreneur'), merchantController.updateMerchant);

// PATCH /api/merchants/:id/status
router.patch('/:id/status', authMiddleware, requireRole('entrepreneur'), merchantController.updateMerchantStatus);

// GET /api/merchants/:id/summary
router.get('/:id/summary', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchantSummary);

module.exports = router;
