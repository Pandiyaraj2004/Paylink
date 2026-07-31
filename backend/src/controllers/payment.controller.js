const paymentService = require('../services/payment.service');
const surfboardService = require('../services/surfboard.service');
const AppError = require('../utils/AppError');

/**
 * Thin HTTP handlers for the Payment Engine (master-doc.md Section 22.5).
 * Controllers never contain business logic — see payment.service.js.
 */

/** POST /api/payments/create — Public (immediately follows order creation). */
async function createPayment(req, res, next) {
  try {
    const { orderId, method, paymentDetails } = req.body || {};
    const result = await paymentService.createPayment({ orderId, method, paymentDetails });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/webhooks/surfboard — signature-verified, not a Firebase JWT
 * (master-doc.md Section 22.5, 24). Registered directly in app.js (see the
 * NOTE there and in payment.routes.js for why), but the handler lives here
 * alongside the rest of the Payment Engine's HTTP layer.
 *
 * Real signature header is `x-webhook-signature` (HMAC-SHA512, Base64 —
 * see surfboard.service.js's verifyWebhookSignature), not the previously
 * invented `x-surfboard-signature`/SHA256 scheme.
 */
async function handleSurfboardWebhook(req, res, next) {
  try {
    const signatureHeader = req.headers['x-webhook-signature'];
    const verification = surfboardService.verifyWebhookSignature(req.rawBody, signatureHeader);

    if (!verification.configured) {
      // A real security boundary — never processed silently when unset.
      return next(new AppError(503, 'PROVIDER_UNAVAILABLE', 'Webhook signature verification is not configured.'));
    }
    if (!verification.valid) {
      return next(new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature.'));
    }

    const result = await paymentService.processSurfboardWebhookEvent(req.body || {});
    return res.status(200).json({ received: true, ...result });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createPayment, handleSurfboardWebhook };
