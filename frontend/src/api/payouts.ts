import { apiClient } from './client';

/**
 * Payout & Settlement Management module (master-doc.md Section 25.5, new).
 * Every batch moves through exactly three states — see the backend's
 * payout.service.js module header for the full model:
 *
 *   pending  -> eligible  -> paid
 *
 * `pending`: calculated, but the settlement reserve hasn't elapsed yet.
 * `eligible`: safe to pay — reserve elapsed, or Surfboard confirmed
 * settlement early. `paid`: an admin has manually recorded the transfer
 * (no real bank-transfer provider is integrated yet — see backend's
 * payout.service.js `executeBankTransfer` placeholder).
 */
export type PayoutBatchStatus = 'pending' | 'eligible' | 'paid';

export interface PayoutBatch {
  id: string;
  merchantId: string;
  status: PayoutBatchStatus;
  periodStart: string;
  periodEnd: string;
  orderIds: string[];
  orderCount: number;
  currency: string;
  grossAmount: number;
  refundedAmount: number;
  netAmount: number;
  settlementChecked: boolean;
  settlementConfirmed: boolean;
  eligibleAt: string | null;
  paidAt: string | null;
  paidBy: string | null;
  paidNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only present on the admin-wide list (GET /api/admin/payouts), not the merchant's own. */
  businessName?: string;
}

export interface PayoutSummary {
  pendingBalance: number;
  eligibleBalance: number;
  totalPaidLifetime: number;
  pendingBatchCount: number;
  eligibleBatchCount: number;
  paidBatchCount: number;
  currency: string | null;
  reserveDays: number;
}

export interface ListPayoutsParams {
  status?: PayoutBatchStatus;
  page?: number;
  pageSize?: number;
}

export interface ListPayoutsResponse {
  items: PayoutBatch[];
  total: number;
  page: number;
  pageSize: number;
}

/* -------------------------------------------------------------------- */
/* Merchant Dashboard — Payouts page                                     */
/* -------------------------------------------------------------------- */

/** GET /api/merchants/:id/payouts/summary — the Payouts page's headline totals. */
export async function getMerchantPayoutSummary(merchantId: string): Promise<PayoutSummary> {
  const { data } = await apiClient.get<PayoutSummary>(`/merchants/${merchantId}/payouts/summary`);
  return data;
}

/** GET /api/merchants/:id/payouts — the Payouts page's history table. */
export async function listMerchantPayouts(
  merchantId: string,
  params: ListPayoutsParams = {}
): Promise<ListPayoutsResponse> {
  const { data } = await apiClient.get<ListPayoutsResponse>(`/merchants/${merchantId}/payouts`, { params });
  return data;
}

/* -------------------------------------------------------------------- */
/* Admin — Settlement Management page                                    */
/* -------------------------------------------------------------------- */

export interface AdminPayoutMerchantBreakdown {
  merchantId: string;
  businessName: string;
  pendingBalance: number;
  eligibleBalance: number;
  totalPaidLifetime: number;
  currency: string | null;
}

export interface AdminPayoutSummary extends PayoutSummary {
  byMerchant: AdminPayoutMerchantBreakdown[];
}

/** GET /api/admin/payouts/summary — platform totals + per-merchant breakdown. */
export async function getAdminPayoutSummary(): Promise<AdminPayoutSummary> {
  const { data } = await apiClient.get<AdminPayoutSummary>('/admin/payouts/summary');
  return data;
}

export interface ListAdminPayoutsParams extends ListPayoutsParams {
  merchantId?: string;
}

/** GET /api/admin/payouts — Settlement Management's table, platform-wide. */
export async function listAdminPayouts(params: ListAdminPayoutsParams = {}): Promise<ListPayoutsResponse> {
  const { data } = await apiClient.get<ListPayoutsResponse>('/admin/payouts', { params });
  return data;
}

export interface RecalculatePayoutsResponse {
  batchesCreated: number;
  batchesPromoted: number;
  merchantsProcessed: number;
}

/** POST /api/admin/payouts/recalculate — manually runs the eligibility calculation (no scheduler is wired up yet). */
export async function recalculatePayouts(): Promise<RecalculatePayoutsResponse> {
  const { data } = await apiClient.post<RecalculatePayoutsResponse>('/admin/payouts/recalculate', {});
  return data;
}

/** PATCH /api/admin/payouts/:id/mark-paid — the manual "Paid" action; only valid from 'eligible'. */
export async function markPayoutPaid(id: string, note?: string): Promise<PayoutBatch> {
  const { data } = await apiClient.patch<PayoutBatch>(`/admin/payouts/${id}/mark-paid`, { note });
  return data;
}

/**
 * GET /api/admin/payouts/surfboard-settlements — optional, read-only
 * cross-check against Surfboard's own Settlement Reports API. Requires
 * partner-level Surfboard credentials (SURFBOARD_PARTNER_ID) — `configured`
 * is false on a merchant-only setup, which is the expected state on most
 * accounts, not an error (same shape as the System page's Surfboard health
 * check).
 */
export interface SurfboardSettlementReport {
  payoutId: string;
  transactionStartDate: string;
  transactionEndDate: string;
  settlementDate: string;
  reportType: string;
  url: string;
  totalSale: number;
  totalRefund: number;
  fee: number;
  payout: number;
}

export interface SurfboardSettlementsResponse {
  configured: boolean;
  ok?: boolean;
  error?: string;
  reports?: SurfboardSettlementReport[];
}

export async function getSurfboardSettlementReports(params: { from?: string; to?: string } = {}): Promise<SurfboardSettlementsResponse> {
  const { data } = await apiClient.get<SurfboardSettlementsResponse>('/admin/payouts/surfboard-settlements', { params });
  return data;
}
