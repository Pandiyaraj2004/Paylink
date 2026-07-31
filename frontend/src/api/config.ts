import { apiClient } from './client';

/**
 * GET /api/config/payment-options response — which payment methods/
 * currencies are actually activated for the configured Surfboard merchant
 * account right now (backend/src/config/env.js's SURFBOARD_ACTIVE_PAYMENT_METHODS/
 * SURFBOARD_ACTIVE_CURRENCIES). `paymentMethods` are lowercase (e.g.
 * 'card'), `currencies` are alpha-3 ISO 4217 (e.g. 'SEK').
 */
export interface PaymentOptions {
  paymentMethods: string[];
  currencies: string[];
}

/**
 * GET /api/config/payment-options — public, no auth. Process-wide config,
 * not merchant-scoped: the same response for every merchant on this
 * deployment (Section 23's single-shared-merchant model).
 */
export async function getPaymentOptions(): Promise<PaymentOptions> {
  const { data } = await apiClient.get<PaymentOptions>('/config/payment-options');
  return data;
}
