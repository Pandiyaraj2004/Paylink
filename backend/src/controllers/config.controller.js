const env = require('../config/env');

/**
 * GET /api/config/payment-options — public, read-only echo of which
 * payment methods/currencies are actually activated for the configured
 * Surfboard merchant account right now (see backend/.env.example's
 * SURFBOARD_ACTIVE_PAYMENT_METHODS/SURFBOARD_ACTIVE_CURRENCIES docs). No
 * service/repository layer — this is a thin echo of two env vars, not
 * business logic. The frontend uses this to restrict its payment-method
 * and currency selectors to what actually works, without hardcoding either
 * list — widening later (e.g. once Swish/EUR are activated in the Surfboard
 * Console) only requires updating the env vars and restarting the backend.
 */
function getPaymentOptions(req, res) {
  res.status(200).json({
    paymentMethods: env.SURFBOARD_ACTIVE_PAYMENT_METHODS,
    currencies: env.SURFBOARD_ACTIVE_CURRENCIES,
  });
}

module.exports = { getPaymentOptions };
