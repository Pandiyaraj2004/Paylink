/**
 * Thrown whenever surfboard.service.js cannot reach/use the Surfboard
 * payment provider — missing API credentials (`SURFBOARD_API_KEY`/
 * `SURFBOARD_API_SECRET`/`SURFBOARD_API_BASE_URL`/`SURFBOARD_MERCHANT_ID`/
 * `SURFBOARD_TERMINAL_ID` all blank, e.g. in an environment with no
 * Surfboard account configured), or (per master-doc.md Section 23.5) a
 * transient network failure that exhausted its retries.
 *
 * Every surfboard.service.js method throws this synchronously when
 * unconfigured, mirroring AiUnavailableError's exact shape/pattern for the
 * AI features. Callers (payment.service.js, refund.service.js) catch this
 * specifically and map it to 503 PROVIDER_UNAVAILABLE rather than letting
 * it bubble up as a generic 500.
 */
class SurfboardUnavailableError extends Error {
  constructor(message = 'Surfboard is temporarily unavailable.') {
    super(message);
    this.name = 'SurfboardUnavailableError';
  }
}

module.exports = SurfboardUnavailableError;
