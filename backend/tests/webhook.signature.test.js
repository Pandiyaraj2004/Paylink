const crypto = require('crypto');
const env = require('../src/config/env');
const surfboardService = require('../src/services/surfboard.service');

/**
 * Verifies surfboard.service.js's `verifyWebhookSignature` against the REAL
 * `SURFBOARD_WEBHOOK_CERTIFICATE` from backend/.env.local
 * (guides/online-payments/integrations/webhooks.md's HMAC-SHA512/Base64
 * signature algorithm, keyed by that certificate). This is pure, local
 * crypto — no network access and no live webhook delivery required, so it
 * is fully testable right now even though real inbound delivery from
 * Surfboard needs a public HTTPS URL this app doesn't have yet (see
 * SURFBOARD_CALLBACK_URL in .env.example — deferred to deploy time).
 *
 * The "real certificate" block below is skipped (not failed) in any
 * environment where that certificate isn't actually configured, matching
 * this project's existing graceful-degradation pattern for every other
 * optional integration (Firebase, AI, and Surfboard itself).
 */
const hasCertificate = !!env.SURFBOARD_WEBHOOK_CERTIFICATE;
const describeIfConfigured = hasCertificate ? describe : describe.skip;

function samplePayload() {
  return {
    eventType: 'order.paymentcompleted',
    metadata: { eventId: 'sig-test-evt-1', created: Date.now(), retryAttempt: 0 },
    data: { orderId: 'sb-order-1', referenceId: 'order-1', paymentId: 'sp-1', paymentStatus: 'PAYMENT_COMPLETED' },
  };
}

function sign(certificate, body) {
  return crypto.createHmac('sha512', certificate).update(body).digest('base64');
}

describeIfConfigured('verifyWebhookSignature — real certificate (HMAC-SHA512/Base64)', () => {
  const rawBody = Buffer.from(JSON.stringify(samplePayload()), 'utf8');

  it('reports configured: true when the certificate is set', () => {
    const result = surfboardService.verifyWebhookSignature(rawBody, sign(env.SURFBOARD_WEBHOOK_CERTIFICATE, rawBody));
    expect(result.configured).toBe(true);
  });

  it('accepts a correctly-signed real payload', () => {
    const signature = sign(env.SURFBOARD_WEBHOOK_CERTIFICATE, rawBody);
    expect(surfboardService.verifyWebhookSignature(rawBody, signature)).toEqual({ configured: true, valid: true });
  });

  it('rejects a payload with an entirely wrong signature', () => {
    expect(surfboardService.verifyWebhookSignature(rawBody, 'not-a-real-signature==')).toEqual({
      configured: true,
      valid: false,
    });
  });

  it('rejects a tampered body against a signature computed for the original body', () => {
    const signature = sign(env.SURFBOARD_WEBHOOK_CERTIFICATE, rawBody);
    const tampered = { ...samplePayload() };
    tampered.data.paymentStatus = 'PAYMENT_FAILED';
    const tamperedBody = Buffer.from(JSON.stringify(tampered), 'utf8');

    expect(surfboardService.verifyWebhookSignature(tamperedBody, signature)).toEqual({
      configured: true,
      valid: false,
    });
  });

  it('rejects when the signature header is missing entirely', () => {
    expect(surfboardService.verifyWebhookSignature(rawBody, undefined)).toEqual({ configured: true, valid: false });
  });

  it('rejects a signature generated with the wrong certificate', () => {
    const wrongSignature = sign('not-the-real-certificate', rawBody);
    expect(surfboardService.verifyWebhookSignature(rawBody, wrongSignature)).toEqual({
      configured: true,
      valid: false,
    });
  });
});

describe('verifyWebhookSignature — unconfigured certificate (graceful degradation)', () => {
  it('reports configured: false when the certificate is blank, regardless of signature — never silently accepts unverified', () => {
    const original = env.SURFBOARD_WEBHOOK_CERTIFICATE;
    env.SURFBOARD_WEBHOOK_CERTIFICATE = '';
    try {
      const result = surfboardService.verifyWebhookSignature(Buffer.from('{}'), 'anything-at-all');
      expect(result).toEqual({ configured: false, valid: false });
    } finally {
      env.SURFBOARD_WEBHOOK_CERTIFICATE = original;
    }
  });
});
