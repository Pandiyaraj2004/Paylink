import { useQuery } from '@tanstack/react-query';
import { getPaymentOptions, type PaymentOptions } from '@/api/config';

/**
 * Fetches `GET /api/config/payment-options` — drives Checkout.tsx's
 * payment-method tabs and AiSetupConcierge.tsx/CatalogTab.tsx's currency
 * selectors, so none of them hardcode a list that could drift from what
 * Surfboard will actually accept (backend/src/config/env.js's
 * SURFBOARD_ACTIVE_PAYMENT_METHODS/SURFBOARD_ACTIVE_CURRENCIES).
 *
 * This is process-wide config, not per-merchant/per-session data — it only
 * changes when the backend is redeployed/restarted with different env vars,
 * so a long `staleTime` is appropriate (effectively "for the session",
 * unlike useMerchant.ts's 30s or usePublicPage's 15s — those track data that
 * can genuinely change within a session). No `merchantId`/auth dependency,
 * so this can be called from public, unauthenticated pages (Checkout.tsx)
 * as well as the authenticated entrepreneur pages.
 */
export function usePaymentOptions() {
  return useQuery<PaymentOptions>({
    queryKey: ['payment-options'],
    queryFn: getPaymentOptions,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
