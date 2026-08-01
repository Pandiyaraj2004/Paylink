import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminSummary,
  listAdminMerchants,
  suspendMerchant,
  reactivateMerchant,
  approveMerchant,
  rejectMerchant,
  deleteMerchant,
  getAdminReports,
  getAdminAnalytics,
  getAdminRefunds,
  listDisputes,
  resolveDispute,
  listAdminLogs,
  getAdminMonitoring,
  getPlatformSettings,
  updatePlatformSettings,
  type ListAdminMerchantsParams,
  type ReportsParams,
  type ListDisputesParams,
  type ResolveDisputePayload,
  type PlatformSettings,
} from '@/api/admin';

/** GET /api/admin/summary (master-doc.md Section 16.1) — polled like the entrepreneur Dashboard's own summary query. */
export function useAdminSummary() {
  return useQuery({
    queryKey: ['admin-summary'],
    queryFn: getAdminSummary,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** GET /api/admin/merchants (Section 22.9) — Merchant Management's table. */
export function useAdminMerchants(params: ListAdminMerchantsParams = {}) {
  return useQuery({
    queryKey: ['admin-merchants', params],
    queryFn: () => listAdminMerchants(params),
    staleTime: 10_000,
  });
}

/**
 * The four Merchant Management actions (Section 16.2 + Deviation 1) share
 * one invalidation target — the merchants list and the Dashboard summary
 * (active-merchant count) both need to reflect a status change immediately.
 */
export function useMerchantActions() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-merchants'] });
    queryClient.invalidateQueries({ queryKey: ['admin-summary'] });
  };

  const suspend = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => suspendMerchant(id, note),
    onSuccess: invalidate,
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => reactivateMerchant(id),
    onSuccess: invalidate,
  });
  const approve = useMutation({
    mutationFn: (id: string) => approveMerchant(id),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectMerchant(id, reason),
    onSuccess: invalidate,
  });
  // Irreversible — see api/admin.ts's deleteMerchant. Shares the same
  // invalidation as the other actions since it also changes the merchant
  // list and Dashboard's active-merchant count.
  const remove = useMutation({
    mutationFn: (id: string) => deleteMerchant(id),
    onSuccess: invalidate,
  });

  return { suspend, reactivate, approve, reject, remove };
}

/** GET /api/admin/reports (Section 16.3 Reports tab). */
export function useAdminReports(params: ReportsParams = {}) {
  return useQuery({
    queryKey: ['admin-reports', params],
    queryFn: () => getAdminReports(params),
    staleTime: 15_000,
  });
}

/** GET /api/admin/analytics (Section 16.3 Analytics tab). */
export function useAdminAnalytics(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['admin-analytics', params],
    queryFn: () => getAdminAnalytics(params),
    staleTime: 15_000,
  });
}

/** GET /api/admin/refunds (Section 16.4 Refunds tab). */
export function useAdminRefunds(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['admin-refunds', params],
    queryFn: () => getAdminRefunds(params),
    staleTime: 15_000,
  });
}

/** GET /api/admin/disputes (Section 16.4 Disputes tab). */
export function useAdminDisputes(params: ListDisputesParams = {}) {
  return useQuery({
    queryKey: ['admin-disputes', params],
    queryFn: () => listDisputes(params),
    staleTime: 10_000,
  });
}

/** PATCH /api/admin/disputes/:id (Section 16.4's resolution action). */
export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ResolveDisputePayload }) => resolveDispute(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      queryClient.invalidateQueries({ queryKey: ['admin-summary'] });
    },
  });
}

/** GET /api/admin/logs (Section 16.5 Logs tab) — the append-only adminActions audit trail. */
export function useAdminLogs(params: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ['admin-logs', params],
    queryFn: () => listAdminLogs(params),
    staleTime: 10_000,
  });
}

/** GET /api/admin/monitoring (Section 16.5 Monitoring tab) — live health-check dashboard, polled. */
export function useAdminMonitoring() {
  return useQuery({
    queryKey: ['admin-monitoring'],
    queryFn: getAdminMonitoring,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

/** GET/PATCH /api/admin/platform-settings (Section 16.6) — Admin role, same gate as every other /admin/* route (Section 24.6). */
export function usePlatformSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['platform-settings'],
    queryFn: getPlatformSettings,
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: (patch: Partial<PlatformSettings>) => updatePlatformSettings(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['platform-settings'], updated);
    },
  });

  return { ...query, update: update.mutateAsync, isUpdating: update.isPending };
}
