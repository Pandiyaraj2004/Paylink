import { useQuery } from '@tanstack/react-query';
import { getHelpArticles, type HelpArticle } from '@/api/help';

/**
 * Fetches `GET /api/help/articles` (master-doc.md Section 14.13) for the
 * Help page's FAQ accordion. Static, process-wide content — it's the same
 * list for every entrepreneur and only changes when the backend itself is
 * redeployed — so, like usePaymentOptions.ts, this uses a long `staleTime`
 * rather than useMerchant.ts's 30s (that hook tracks data that can genuinely
 * change within a session; this doesn't). No `merchantId`/`enabled` gate:
 * the Help page already lives behind ProtectedRoute, so by the time this
 * hook runs the entrepreneur is authenticated.
 */
export function useHelpArticles() {
  return useQuery<HelpArticle[]>({
    queryKey: ['help-articles'],
    queryFn: getHelpArticles,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
