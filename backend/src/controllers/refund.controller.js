const refundService = require('../services/refund.service');

/**
 * Thin HTTP handler for POST /api/payments/:id/refund (master-doc.md
 * Section 22.6). Controllers never contain business logic — see
 * refund.service.js.
 */
async function createRefund(req, res, next) {
  try {
    const { amount, reason } = req.body || {};
    const result = await refundService.createRefund({
      orderId: req.params.id,
      uid: req.user.uid,
      amount,
      reason,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createRefund };
