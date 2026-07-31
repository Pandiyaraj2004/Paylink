const express = require('express');
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

// POST /api/orders — Public (customer checkout, master-doc.md Section 22.4).
router.post('/', orderController.createOrder);

// GET /api/orders/:id/receipt — Public via unique order link (Section 22.7,
// 15.3: "no login required, but not discoverable/guessable" — knowing the
// long, random orderId IS the access control here, so no auth middleware
// is applied; an authenticated owner reaches the same public data).
router.get('/:id/receipt', orderController.getReceipt);

// GET /api/orders/:id/bill-pdf — same access model as receipt above.
router.get('/:id/bill-pdf', orderController.getBillPdf);

// POST /api/orders/:id/rating — same access model (Section 15.3).
router.post('/:id/rating', orderController.submitRating);

// PATCH /api/orders/:id/fulfil — Authenticated (owner).
router.patch('/:id/fulfil', authMiddleware, requireRole('entrepreneur'), orderController.fulfilOrder);

// NOTE: GET /api/merchants/:id/orders is registered in merchant.routes.js,
// not here — its URL prefix (/api/merchants) differs from this router's
// mount point (/api/orders), following the same shared-prefix pattern
// product.routes.js already uses alongside merchant.routes.js.
module.exports = router;
