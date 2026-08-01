const payoutService = require('../services/payout.service');

/**
 * Thin HTTP handlers for the Payout & Settlement Management module.
 * Controllers never contain business logic — see services/payout.service.js.
 * Merchant-scoped handlers are wired into routes/merchant.routes.js (same
 * pattern order.controller.js's functions already share that file);
 * admin-scoped handlers are wired into routes/admin.routes.js.
 */

/** GET /api/merchants/:id/payouts/summary — the Payouts page's headline totals. */
async function getMyPayoutSummary(req, res, next) {
  try {
    const result = await payoutService.getMerchantPayoutSummary(req.params.id, req.user.uid);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/merchants/:id/payouts — the Payouts page's history table. */
async function listMyPayouts(req, res, next) {
  try {
    const { status, page, pageSize } = req.query || {};
    const result = await payoutService.listMerchantPayouts(req.params.id, req.user.uid, { status, page, pageSize });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/payouts/summary — platform totals + per-merchant breakdown. */
async function adminGetSummary(req, res, next) {
  try {
    const result = await payoutService.adminGetSummary();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/payouts — Settlement Management's table. */
async function adminListPayouts(req, res, next) {
  try {
    const { status, merchantId, page, pageSize } = req.query || {};
    const result = await payoutService.adminListPayouts({ status, merchantId, page, pageSize });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** POST /api/admin/payouts/recalculate — manually runs the eligibility calculation. */
async function adminRecalculate(req, res, next) {
  try {
    const result = await payoutService.adminRecalculate();
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/admin/payouts/:id/mark-paid — the manual "Paid" action. */
async function adminMarkPaid(req, res, next) {
  try {
    const { note } = req.body || {};
    const result = await payoutService.markPayoutPaid(req.params.id, req.admin.adminId, note);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/admin/payouts/surfboard-settlements — optional Surfboard Settlement Reports cross-check. */
async function adminGetSettlementReports(req, res, next) {
  try {
    const { from, to } = req.query || {};
    const result = await payoutService.getSurfboardSettlementReports({ from, to });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyPayoutSummary,
  listMyPayouts,
  adminGetSummary,
  adminListPayouts,
  adminRecalculate,
  adminMarkPaid,
  adminGetSettlementReports,
};
