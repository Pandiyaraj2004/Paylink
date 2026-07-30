const merchantService = require('../services/merchant.service');

/**
 * Thin HTTP handlers for /api/merchants/:id* (master-doc.md Section 22.2).
 * Controllers never contain business logic — see merchant.service.js.
 */

async function getMerchant(req, res, next) {
  try {
    const merchant = await merchantService.getMerchant(req.params.id, req.user.uid);
    return res.status(200).json(merchant);
  } catch (err) {
    return next(err);
  }
}

async function updateMerchant(req, res, next) {
  try {
    const updated = await merchantService.updateMerchantProfile(req.params.id, req.user.uid, req.body || {});
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

async function updateMerchantStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    const updated = await merchantService.updateMerchantStatus(req.params.id, req.user.uid, status);
    return res.status(200).json({ status: updated.status });
  } catch (err) {
    return next(err);
  }
}

async function getMerchantSummary(req, res, next) {
  try {
    const summary = await merchantService.getMerchantSummary(req.params.id, req.user.uid);
    return res.status(200).json(summary);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/merchants/:slug/public-page (master-doc.md Section 22.2). Public
 * — no auth/role middleware on this route. Section 20.4 calls for this
 * response to be CDN/edge-cached for 30s in production; setting
 * Cache-Control here is the trivial, app-level part of that — no actual
 * CDN/edge infrastructure is built as part of this.
 */
async function getPublicPage(req, res, next) {
  try {
    const page = await merchantService.getPublicPage(req.params.slug);
    res.set('Cache-Control', 'public, max-age=30');
    return res.status(200).json(page);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getMerchant, updateMerchant, updateMerchantStatus, getMerchantSummary, getPublicPage };
