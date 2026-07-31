const express = require('express');
const configController = require('../controllers/config.controller');

const router = express.Router();

// GET /api/config/payment-options — public, no auth (mirrors
// health.routes.js's no-auth pattern). Not merchant-scoped, so it doesn't
// belong under /api/merchants — this is process-wide Surfboard-account
// config, the same for every merchant on this deployment (Section 23's
// single-shared-merchant model).
router.get('/payment-options', configController.getPaymentOptions);

module.exports = router;
