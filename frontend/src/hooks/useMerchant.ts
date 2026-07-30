import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  getMerchant,
  getMerchantSummary,
  getPublicPage,
  patchMerchant,
  setMerchantStatus,
  type Merchant,
  type MerchantPatchPayload,
  type PublicPage,
} from '@/api/merchants';

/**
 * Fetches/caches the current entrepreneur's merchant profile via React
 * Query (master-doc.md Section 21.2/21.3). `merchantId` comes from
 * AuthContext, populated by POST /api/auth/session on first login.
 */
export function useMerchant() {
  const { merchantId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<Merchant>({
    queryKey: ['merchant', merchantId],
    queryFn: () => getMerchant(merchantId as string),
    enabled: !!merchantId,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: MerchantPatchPayload) => patchMerchant(merchantId as string, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['merchant', merchantId], updated);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: 'open' | 'closed') => setMerchantStatus(merchantId as string, status),
    onSuccess: (_res, status) => {
      queryClient.setQueryData<Merchant | undefined>(['merchant', merchantId], (prev) =>
        prev ? { ...prev, status } : prev
      );
    },
  });

  return {
    merchant: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    updateMerchant: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    setStoreStatus: statusMutation.mutateAsync,
    isTogglingStatus: statusMutation.isPending,
  };
}

/** Standalone summary query — kept separate so Dashboard can refetch it independently. */
export function useMerchantSummary() {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-summary', merchantId],
    queryFn: () => getMerchantSummary(merchantId as string),
    enabled: !!merchantId,
    staleTime: 15_000,
  });
}

/**
 * Fetches `GET /api/merchants/:slug/public-page` (master-doc.md Section
 * 22.2/14.5). Section 14.5's own API Calls line marks this as "(for the
 * preview)" — meaning both the Products page's Catalog tab (initial item
 * list) and its Preview & Share tab source their data from this single
 * query, keyed by slug so product mutations can invalidate it directly.
 */
export function usePublicPage(slug: string | null | undefined) {
  return useQuery<PublicPage>({
    queryKey: ['public-page', slug],
    queryFn: () => getPublicPage(slug as string),
    enabled: !!slug,
    staleTime: 15_000,
  });
}
