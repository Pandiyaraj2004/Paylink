const express = require('express');
const disputeController = require('../controllers/dispute.controller');
const { publicWriteLimiter } = require('../middleware/rateLimit.middleware');

const router = express.Router();

// POST /api/disputes — Public, no auth (master-doc.md Section 15.4: "Fully
// public" — a customer without a PayLink account is the one filing this).
// Rate-limited (final production audit finding, Section 28.3): unauthenticated
// + Firestore-writing, otherwise wide open to spam.
router.post('/', publicWriteLimiter, disputeController.createDispute);

module.exports = router;
