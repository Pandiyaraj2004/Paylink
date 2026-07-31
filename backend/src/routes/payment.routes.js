const express = require('express');
const paymentController = require('../controllers/payment.controller');
const refundController = require('../controllers/refund.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

// POST /api/payments/create — Public, immediately follows order creation;
// no auth token exists yet for an anonymous checkout customer (Section 22.5).
router.post('/create', paymentController.createPayment);

// POST /api/payments/:id/refund — Authenticated (owner). master-doc.md
// Section 19.3 names the responsible service file refund.service.js even
// though Section 20.1's folder tree omits it entirely (and lists
// refund.controller.js without a matching refund.routes.js) — wired here,
// on the documented /api/payments/:id/refund path, rather than creating a
// new route file not in that tree.
router.post('/:id/refund', authMiddleware, requireRole('entrepreneur'), refundController.createRefund);

// NOTE: POST /api/webhooks/surfboard is registered directly in app.js, not
// here — its URL prefix (/api/webhooks) differs from this router's mount
// point (/api/payments), and Section 20.1 documents no separate
// webhook.routes.js file. See app.js for the signature-verified wiring.
module.exports = router;
