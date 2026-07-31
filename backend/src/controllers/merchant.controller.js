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

/** PATCH /api/merchants/:id/settings (master-doc.md Section 14.7) — Payout & Language tab. */
async function updateMerchantSettings(req, res, next) {
  try {
    const updated = await merchantService.updateMerchantSettings(req.params.id, req.user.uid, req.body || {});
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

/** GET /api/merchants/:id/transactions (master-doc.md Section 14.4). */
async function getMerchantTransactions(req, res, next) {
  try {
    const { from, to } = req.query || {};
    const result = await merchantService.getMerchantTransactions(req.params.id, req.user.uid, { from, to });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/merchants/:id/customers (master-doc.md Section 14.9) — repeat customers list. */
async function getMerchantCustomers(req, res, next) {
  try {
    const customers = await merchantService.getMerchantCustomers(req.params.id, req.user.uid);
    return res.status(200).json({ items: customers });
  } catch (err) {
    return next(err);
  }
}

/** GET /api/merchants/:id/reviews (master-doc.md Section 14.11) — star ratings + written reviews. */
async function getMerchantReviews(req, res, next) {
  try {
    const result = await merchantService.getMerchantReviews(req.params.id, req.user.uid);
    return res.status(200).json(result);
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

/** GET /api/merchants/:id/payout (master-doc.md Section 14.12) — Bank Details tab's empty/filled state. */
async function getMerchantPayout(req, res, next) {
  try {
    const payout = await merchantService.getMerchantPayout(req.params.id, req.user.uid);
    return res.status(200).json(payout);
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/merchants/:id/payout (master-doc.md Section 14.12/19.2) — Bank Details tab. */
async function updateMerchantPayout(req, res, next) {
  try {
    const updated = await merchantService.updateMerchantPayout(req.params.id, req.user.uid, req.body || {});
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/merchants/:id/gallery (master-doc.md Section 14.14) — Profile page's gallery grid. */
async function listGallery(req, res, next) {
  try {
    const images = await merchantService.listGallery(req.params.id, req.user.uid);
    return res.status(200).json({ items: images });
  } catch (err) {
    return next(err);
  }
}

/** POST /api/merchants/:id/gallery (master-doc.md Section 14.14). */
async function addGalleryImage(req, res, next) {
  try {
    const created = await merchantService.addGalleryImage(req.params.id, req.user.uid, req.body || {});
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/merchants/:id/gallery/:imageId (master-doc.md Section 14.14). */
async function deleteGalleryImage(req, res, next) {
  try {
    await merchantService.deleteGalleryImage(req.params.id, req.user.uid, req.params.imageId);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMerchant,
  updateMerchant,
  updateMerchantSettings,
  updateMerchantStatus,
  getMerchantSummary,
  getMerchantTransactions,
  getMerchantCustomers,
  getMerchantReviews,
  getPublicPage,
  getMerchantPayout,
  updateMerchantPayout,
  listGallery,
  addGalleryImage,
  deleteGalleryImage,
};
