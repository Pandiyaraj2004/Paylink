const express = require('express');
const merchantController = require('../controllers/merchant.controller');
const orderController = require('../controllers/order.controller');
const notificationController = require('../controllers/notification.controller');
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

// PATCH /api/merchants/:id/settings (master-doc.md Section 14.12) — Language
// tab, separate from the profile PATCH above. Bank details used to live on
// this same endpoint; that's been reverted — see /:id/payout below.
router.patch('/:id/settings', authMiddleware, requireRole('entrepreneur'), merchantController.updateMerchantSettings);

// GET/PATCH /api/merchants/:id/payout (master-doc.md Section 14.12/19.2) —
// Bank Details tab, writing to the separately-secured
// merchants/{id}/payout/details subcollection (Section 30 rule 12:
// deliberately excluded from onboarding, entered here for the first time
// whenever the entrepreneur is ready).
router.get('/:id/payout', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchantPayout);
router.patch('/:id/payout', authMiddleware, requireRole('entrepreneur'), merchantController.updateMerchantPayout);

// GET/POST /api/merchants/:id/gallery, DELETE .../gallery/:imageId
// (master-doc.md Section 14.14) — the standalone Profile page's gallery grid.
router.get('/:id/gallery', authMiddleware, requireRole('entrepreneur'), merchantController.listGallery);
router.post('/:id/gallery', authMiddleware, requireRole('entrepreneur'), merchantController.addGalleryImage);
router.delete('/:id/gallery/:imageId', authMiddleware, requireRole('entrepreneur'), merchantController.deleteGalleryImage);

// PATCH /api/merchants/:id/status
router.patch('/:id/status', authMiddleware, requireRole('entrepreneur'), merchantController.updateMerchantStatus);

// GET /api/merchants/:id/notifications (master-doc.md Section 14.7) —
// Notifications tab's history list.
router.get('/:id/notifications', authMiddleware, requireRole('entrepreneur'), notificationController.listNotifications);

// GET /api/merchants/:id/summary
router.get('/:id/summary', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchantSummary);

// GET /api/merchants/:id/orders (master-doc.md Section 22.4) — lives here,
// not in order.routes.js, because its URL prefix is /api/merchants, not
// /api/orders; mirrors how product.routes.js's /:id/products routes share
// this same /api/merchants prefix via a separate router file.
router.get('/:id/orders', authMiddleware, requireRole('entrepreneur'), orderController.listOrders);

// GET /api/merchants/:id/transactions (master-doc.md Section 14.4's own API
// Calls line) — the Transactions tab's raw ledger, derived from the same
// orders + refunds data as /:id/orders above.
router.get('/:id/transactions', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchantTransactions);

// GET /api/merchants/:id/customers (master-doc.md Section 14.9) — repeat
// customers list, grouped by the same customerRef hashCustomerRef() writes
// on every order.
router.get('/:id/customers', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchantCustomers);

// GET /api/merchants/:id/reviews (master-doc.md Section 14.11) — star
// ratings + written reviews the entrepreneur's customers have left.
router.get('/:id/reviews', authMiddleware, requireRole('entrepreneur'), merchantController.getMerchantReviews);

module.exports = router;
