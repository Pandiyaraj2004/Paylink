const express = require('express');
const adminController = require('../controllers/admin.controller');
const payoutController = require('../controllers/payout.controller');
const adminAuthMiddleware = require('../middleware/adminAuth.middleware');

const router = express.Router();

// Every /api/admin/* route requires a verified admin session token —
// applied once at the router level rather than per-route (master-doc.md
// Section 24.4-24.6: Admin authenticates via Access Code + Password, not
// Firebase, and there is only ONE admin role in this revision — the
// earlier `senior_admin` tier and its extra Settings-only gate are gone,
// folded into this single baseline check per Section 24.6).
router.use(adminAuthMiddleware);

// 16.1 Dashboard
router.get('/summary', adminController.getSummary);

// 16.2 Merchant Management (Section 22.9 + Deviation 1 — see admin.service.js header)
router.get('/merchants', adminController.listMerchants);
router.post('/merchants/:id/approve', adminController.approveMerchant);
router.post('/merchants/:id/reject', adminController.rejectMerchant);
router.post('/merchants/:id/suspend', adminController.suspendMerchant);
router.post('/merchants/:id/reactivate', adminController.reactivateMerchant);

// 16.3 Reports & Analytics
router.get('/reports', adminController.getReports);
router.get('/analytics', adminController.getAnalytics);

// 16.4 Refunds & Disputes
router.get('/refunds', adminController.getRefunds);
router.get('/disputes', adminController.listDisputes);
router.patch('/disputes/:id', adminController.resolveDispute);

// 16.5 System (Logs / Monitoring)
router.get('/logs', adminController.listLogs);
router.get('/monitoring', adminController.getMonitoring);

// 16.6 Settings — Section 16.6: "Permissions: Admin role (Section 24.4's
// Access Code + Password login)." No narrower gate than the router's
// baseline above; the earlier senior_admin-only restriction on these two
// routes is gone along with the role itself (Section 24.6).
router.get('/platform-settings', adminController.getPlatformSettings);
router.patch('/platform-settings', adminController.updatePlatformSettings);

// Payout & Settlement Management (master-doc.md Section 25.5, new) — the
// Settlement Management page. `/summary` and `/surfboard-settlements` are
// registered before the parameterized `/:id/mark-paid` route only for
// readability grouping — Express has no ambiguity here regardless of order
// since none of these paths share the same segment shape.
router.get('/payouts/summary', payoutController.adminGetSummary);
router.get('/payouts/surfboard-settlements', payoutController.adminGetSettlementReports);
router.get('/payouts', payoutController.adminListPayouts);
router.post('/payouts/recalculate', payoutController.adminRecalculate);
router.patch('/payouts/:id/mark-paid', payoutController.adminMarkPaid);

module.exports = router;
