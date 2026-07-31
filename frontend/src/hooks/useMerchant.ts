import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  addGalleryImage,
  deleteGalleryImage,
  getMerchant,
  getMerchantCustomers,
  getMerchantPayout,
  getMerchantReviews,
  getMerchantSummary,
  getMerchantTransactions,
  getPublicPage,
  listGalleryImages,
  patchMerchant,
  patchMerchantPayout,
  patchMerchantSettings,
  setMerchantStatus,
  type GalleryImage,
  type ListMerchantTransactionsParams,
  type Merchant,
  type MerchantPatchPayload,
  type MerchantPayoutPayload,
  type MerchantSettingsPayload,
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

  // PATCH /api/merchants/:id/settings (master-doc.md Section 14.7's Payout &
  // Language tab) — kept as its own mutation since it's a genuinely separate
  // endpoint from the profile PATCH above, same split the backend makes.
  const settingsMutation = useMutation({
    mutationFn: (payload: MerchantSettingsPayload) => patchMerchantSettings(merchantId as string, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['merchant', merchantId], updated);
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
    updateMerchantSettings: settingsMutation.mutateAsync,
    isUpdatingSettings: settingsMutation.isPending,
  };
}

/**
 * GET/PATCH /api/merchants/:id/payout (master-doc.md Section 14.12/19.2's
 * Bank Details tab) — kept as its own hook/query (not folded into
 * useMerchant above) since payout/details is a genuinely separate,
 * separately-secured Firestore subcollection, not a field on the Merchant
 * document useMerchant's query already caches. Deliberately not
 * `enabled: !!merchant` — this tab is reachable independent of the main
 * merchant fetch's timing, and the empty `{ completed: false }` response is
 * itself a normal, valid state for a newly onboarded store.
 */
export function useMerchantPayout() {
  const { merchantId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['merchant-payout', merchantId],
    queryFn: () => getMerchantPayout(merchantId as string),
    enabled: !!merchantId,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (payload: MerchantPayoutPayload) => patchMerchantPayout(merchantId as string, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['merchant-payout', merchantId], updated);
    },
  });

  return {
    payout: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    savePayout: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/**
 * GET/POST/DELETE /api/merchants/:id/gallery (master-doc.md Section 14.14) —
 * the standalone Profile page's drag-to-reorder gallery grid, backed by its
 * own `gallery` subcollection (Section 19.2), not an array field on Merchant.
 */
export function useGallery() {
  const { merchantId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<GalleryImage[]>({
    queryKey: ['merchant-gallery', merchantId],
    queryFn: () => listGalleryImages(merchantId as string),
    enabled: !!merchantId,
    staleTime: 15_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['merchant-gallery', merchantId] });

  const addMutation = useMutation({
    mutationFn: (payload: { imageBase64: string; order?: number }) =>
      addGalleryImage(merchantId as string, payload),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (imageId: string) => deleteGalleryImage(merchantId as string, imageId),
    onSuccess: invalidate,
  });

  return {
    images: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    addImage: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    removeImage: deleteMutation.mutateAsync,
    isRemoving: deleteMutation.isPending,
  };
}

/**
 * Standalone summary query — kept separate so Dashboard can refetch it
 * independently. Polls in the background (master-doc.md: "Automatically
 * update Dashboard, Revenue, Orders, Transactions, Analytics, Recent
 * Activity... without requiring manual refresh where possible") — Section
 * 20.4/21.2 never document websockets or Firestore real-time listeners, so
 * a `refetchInterval` is the documented-consistent way to satisfy this
 * without inventing new real-time infrastructure. React Query keeps the
 * previous data visible during a background refetch (no loading flicker) —
 * `summaryLoading` in Dashboard.tsx only reflects the *initial* fetch.
 */
export function useMerchantSummary() {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-summary', merchantId],
    queryFn: () => getMerchantSummary(merchantId as string),
    enabled: !!merchantId,
    staleTime: 15_000,
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * GET /api/merchants/:id/transactions (master-doc.md Section 14.4) — backs
 * the Transactions tab's raw ledger view. Kept as its own query (rather than
 * reusing useMerchantOrders) since it's a genuinely different, dedicated
 * endpoint returning payment/refund events, not orders.
 */
export function useMerchantTransactions(params: ListMerchantTransactionsParams = {}) {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-transactions', merchantId, params],
    queryFn: () => getMerchantTransactions(merchantId as string, params),
    enabled: !!merchantId,
    staleTime: 10_000,
  });
}

/**
 * GET /api/merchants/:id/customers (master-doc.md Section 14.9) — the
 * Customers page's repeat-customer list. Spans the merchant's full order
 * history, so a longer staleTime than useMerchantSummary is fine — this
 * isn't a number that needs to feel "live."
 */
export function useMerchantCustomers() {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-customers', merchantId],
    queryFn: () => getMerchantCustomers(merchantId as string),
    enabled: !!merchantId,
    staleTime: 30_000,
  });
}

/** GET /api/merchants/:id/reviews (master-doc.md Section 14.11) — the Reviews page. */
export function useMerchantReviews() {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-reviews', merchantId],
    queryFn: () => getMerchantReviews(merchantId as string),
    enabled: !!merchantId,
    staleTime: 30_000,
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
