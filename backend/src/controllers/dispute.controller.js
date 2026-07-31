const disputeService = require('../services/dispute.service');

/**
 * Thin HTTP handler for POST /api/disputes (master-doc.md Section 15.4).
 * Controllers never contain business logic — see dispute.service.js.
 */
async function createDispute(req, res, next) {
  try {
    const { orderId, merchantId, name, email, message } = req.body || {};
    const result = await disputeService.createDispute({ orderId, merchantId, name, email, message });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createDispute };
