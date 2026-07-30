/**
 * Thrown whenever an AI feature (Setup Concierge or Earnings Assistant,
 * master-doc.md Section 10) cannot produce a usable result — missing API
 * key, upstream API error, timeout, or malformed/unparseable JSON output.
 *
 * AI features are additive, never a hard dependency (Section 10.1 / 26.7),
 * so callers catch this specifically and degrade gracefully rather than
 * letting it bubble up as a generic 500.
 */
class AiUnavailableError extends Error {
  constructor(message = 'AI service is temporarily unavailable.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

module.exports = AiUnavailableError;
