import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  getAdminPayoutSummary,
  getMerchantPayoutSummary,
  getSurfboardSettlementReports,
  listAdminPayouts,
  listMerchantPayouts,
  markPayoutPaid,
  recalculatePayouts,
  type ListAdminPayoutsParams,
  type ListPayoutsParams,
} from '@/api/payouts';

/* -------------------------------------------------------------------- */
/* Merchant Dashboard — Payouts page                                     */
/* -------------------------------------------------------------------- */

/** GET /api/merchants/:id/payouts/summary — the Payouts page's headline totals. */
export function useMerchantPayoutSummary() {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-payout-summary', merchantId],
    queryFn: () => getMerchantPayoutSummary(merchantId as string),
    enabled: !!merchantId,
    staleTime: 15_000,
  });
}

/** GET /api/merchants/:id/payouts — the Payouts page's history table. */
export function useMerchantPayouts(params: ListPayoutsParams = {}) {
  const { merchantId } = useAuth();
  return useQuery({
    queryKey: ['merchant-payouts', merchantId, params],
    queryFn: () => listMerchantPayouts(merchantId as string, params),
    enabled: !!merchantId,
    staleTime: 15_000,
  });
}

/* -------------------------------------------------------------------- */
/* Admin — Settlement Management page                                    */
/* -------------------------------------------------------------------- */

/** GET /api/admin/payouts/summary — platform totals + per-merchant breakdown. */
export function useAdminPayoutSummary() {
  return useQuery({
    queryKey: ['admin-payout-summary'],
    queryFn: getAdminPayoutSummary,
    staleTime: 15_000,
  });
}

/** GET /api/admin/payouts — Settlement Management's table. */
export function useAdminPayouts(params: ListAdminPayoutsParams = {}) {
  return useQuery({
    queryKey: ['admin-payouts', params],
    queryFn: () => listAdminPayouts(params),
    staleTime: 10_000,
  });
}

/** POST /api/admin/payouts/recalculate — manual trigger since no scheduler is wired up yet. */
export function useRecalculatePayouts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recalculatePayouts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payout-summary'] });
    },
  });
}

/** PATCH /api/admin/payouts/:id/mark-paid — the manual "Paid" action. */
export function useMarkPayoutPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => markPayoutPaid(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payout-summary'] });
    },
  });
}

/** GET /api/admin/payouts/surfboard-settlements — optional Surfboard Settlement Reports cross-check. */
export function useSurfboardSettlements() {
  return useQuery({
    queryKey: ['admin-surfboard-settlements'],
    queryFn: () => getSurfboardSettlementReports(),
    staleTime: 60_000,
  });
}
