const express = require('express');
const disputeController = require('../controllers/dispute.controller');

const router = express.Router();

// POST /api/disputes — Public, no auth (master-doc.md Section 15.4: "Fully
// public" — a customer without a PayLink account is the one filing this).
router.post('/', disputeController.createDispute);

module.exports = router;
