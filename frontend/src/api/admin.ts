import { apiClient } from './client';
import type { Merchant, MerchantStatus } from './merchants';

/**
 * Admin Panel API client (master-doc.md Section 16, 22.9). Every call here
 * hits a route gated by adminAuth.middleware.js on the backend
 * (backend/src/routes/admin.routes.js) — apiClient already attaches the
 * stored admin session token (Section 24.4-24.6, NOT a Firebase ID token)
 * to every `/admin/*` request automatically (api/client.ts).
 */

/* -------------------------------------------------------------------- */
/* 16.1 Dashboard                                                        */
/* -------------------------------------------------------------------- */

export interface AdminTrendPoint {
  date: string;
  total: number;
}

export interface AdminSummary {
  totalActiveMerchants: number;
  /** Replaces the doc's original "pending approvals" card — dead post-Deviation-1 (no pre-launch gate). */
  recentlyOnboarded: number;
  openDisputes: number;
  totalVolume: number;
  trend: AdminTrendPoint[];
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const { data } = await apiClient.get<AdminSummary>('/admin/summary');
  return data;
}

/* -------------------------------------------------------------------- */
/* 16.2 Merchant Management                                              */
/* -------------------------------------------------------------------- */

export interface ListAdminMerchantsParams {
  status?: MerchantStatus;
  page?: number;
  pageSize?: number;
}

export interface ListAdminMerchantsResponse {
  items: Merchant[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAdminMerchants(params: ListAdminMerchantsParams = {}): Promise<ListAdminMerchantsResponse> {
  const { data } = await apiClient.get<ListAdminMerchantsResponse>('/admin/merchants', { params });
  return data;
}

export interface MerchantActionResponse {
  status: MerchantStatus;
}

/** POST /api/admin/merchants/:id/suspend — THE core Deviation-1 safeguard; requires an internal note. */
export async function suspendMerchant(id: string, note: string): Promise<MerchantActionResponse> {
  const { data } = await apiClient.post<MerchantActionResponse>(`/admin/merchants/${id}/suspend`, { note });
  return data;
}

/** POST /api/admin/merchants/:id/reactivate — undoes suspendMerchant; only valid from `suspended`. */
export async function reactivateMerchant(id: string): Promise<MerchantActionResponse> {
  const { data } = await apiClient.post<MerchantActionResponse>(`/admin/merchants/${id}/reactivate`, {});
  return data;
}

/** POST /api/admin/merchants/:id/approve — repurposed post-Deviation-1: review affirmation / appeal reversal, see backend admin.service.js. */
export async function approveMerchant(id: string): Promise<MerchantActionResponse> {
  const { data } = await apiClient.post<MerchantActionResponse>(`/admin/merchants/${id}/approve`, {});
  return data;
}

/** POST /api/admin/merchants/:id/reject — repurposed post-Deviation-1: terminal enforcement action, requires a reason. */
export async function rejectMerchant(id: string, reason: string): Promise<MerchantActionResponse> {
  const { data } = await apiClient.post<MerchantActionResponse>(`/admin/merchants/${id}/reject`, { reason });
  return data;
}

/* -------------------------------------------------------------------- */
/* 16.3 Reports & Analytics                                              */
/* -------------------------------------------------------------------- */

export interface ReportsParams {
  from?: string;
  to?: string;
  category?: string;
}

export interface ReportsByMerchant {
  merchantId: string;
  businessName: string;
  volume: number;
  orderCount: number;
}

export interface ReportsResponse {
  from: string;
  to: string;
  totalVolume: number;
  totalOrders: number;
  platformFeePercent: number;
  estimatedPlatformRevenue: number;
  byMerchant: ReportsByMerchant[];
}

export async function getAdminReports(params: ReportsParams = {}): Promise<ReportsResponse> {
  const { data } = await apiClient.get<ReportsResponse>('/admin/reports', { params });
  return data;
}

export interface AnalyticsByCategory {
  category: string;
  total: number;
}

export interface AnalyticsResponse {
  from: string;
  to: string;
  trend: AdminTrendPoint[];
  byCategory: AnalyticsByCategory[];
  refundRate: number;
}

export async function getAdminAnalytics(params: { from?: string; to?: string } = {}): Promise<AnalyticsResponse> {
  const { data } = await apiClient.get<AnalyticsResponse>('/admin/analytics', { params });
  return data;
}

/* -------------------------------------------------------------------- */
/* 16.4 Refunds & Disputes                                               */
/* -------------------------------------------------------------------- */

export interface AdminRefundEntry {
  id: string;
  orderId: string;
  merchantId: string;
  businessName: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
}

export interface FlaggedMerchant {
  merchantId: string;
  businessName: string;
  refundRate: number;
}

export interface AdminRefundsResponse {
  items: AdminRefundEntry[];
  total: number;
  flaggedMerchants: FlaggedMerchant[];
  refundRateAlertThreshold: number;
  refundFlaggingEnabled: boolean;
}

export async function getAdminRefunds(params: { from?: string; to?: string } = {}): Promise<AdminRefundsResponse> {
  const { data } = await apiClient.get<AdminRefundsResponse>('/admin/refunds', { params });
  return data;
}

export type DisputeStatus = 'open' | 'investigating' | 'resolved';

export interface Dispute {
  id: string;
  merchantId: string | null;
  orderId: string | null;
  status: DisputeStatus;
  resolutionNotes: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  message?: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ListDisputesParams {
  status?: DisputeStatus;
  page?: number;
  pageSize?: number;
}

export interface ListDisputesResponse {
  items: Dispute[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listDisputes(params: ListDisputesParams = {}): Promise<ListDisputesResponse> {
  const { data } = await apiClient.get<ListDisputesResponse>('/admin/disputes', { params });
  return data;
}

export interface ResolveDisputePayload {
  status: DisputeStatus;
  resolutionNotes?: string;
}

export async function resolveDispute(id: string, payload: ResolveDisputePayload): Promise<Dispute> {
  const { data } = await apiClient.patch<Dispute>(`/admin/disputes/${id}`, payload);
  return data;
}

/* -------------------------------------------------------------------- */
/* 16.5 System (Logs / Monitoring)                                       */
/* -------------------------------------------------------------------- */

export interface AdminActionLog {
  id: string;
  adminId: string;
  actionType: string;
  targetId: string;
  notes: string | null;
  createdAt: string;
}

export interface ListLogsResponse {
  items: AdminActionLog[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAdminLogs(params: { page?: number; pageSize?: number } = {}): Promise<ListLogsResponse> {
  const { data } = await apiClient.get<ListLogsResponse>('/admin/logs', { params });
  return data;
}

export interface MonitoringResponse {
  firebase: { ready: boolean };
  surfboard: { configured: boolean; ok?: boolean; error?: string };
  aiProviders: {
    openRouterConfigured: boolean;
    geminiConfigured: boolean;
    anthropicConfigured: boolean;
  };
  paymentSuccessRate24h: number | null;
  sampledOrders24h: number;
}

export async function getAdminMonitoring(): Promise<MonitoringResponse> {
  const { data } = await apiClient.get<MonitoringResponse>('/admin/monitoring');
  return data;
}

/* -------------------------------------------------------------------- */
/* 16.6 Settings                                                         */
/* -------------------------------------------------------------------- */

export interface PlatformSettings {
  platformFeePercent: number;
  refundRateAlertThreshold: number;
  maintenanceMode: boolean;
  refundFlaggingEnabled: boolean;
}

/** GET/PATCH /api/admin/platform-settings (Section 16.6) — Admin role, same gate as every other /admin/* route (Section 24.6). */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const { data } = await apiClient.get<PlatformSettings>('/admin/platform-settings');
  return data;
}

export async function updatePlatformSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const { data } = await apiClient.patch<PlatformSettings>('/admin/platform-settings', patch);
  return data;
}
