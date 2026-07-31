const express = require('express');
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/users/me/fcm-token (Phase 13, master-doc.md Section 27 push) —
// registers the authenticated caller's own FCM device token. No
// requireRole gate: any authenticated account (entrepreneur today; admin or
// customer accounts in the future) may register a token for its own user
// doc, and no merchant/ownership check applies since there's no merchantId
// in this request at all.
router.post('/me/fcm-token', authMiddleware, userController.registerFcmToken);

module.exports = router;
