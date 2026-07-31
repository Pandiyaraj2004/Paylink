import { apiClient } from './client';

export type PaymentMethod = 'card' | 'swish' | 'wallet';

export interface CreatePaymentPayload {
  orderId: string;
  method: PaymentMethod;
  /**
   * No real card/Swish form exists to collect real payment details against
   * — there is no real payment provider configured in this environment
   * (Surfboard is unconfigured by design) to send them to. Always `{}`.
   */
  paymentDetails?: Record<string, unknown>;
}

/**
 * POST /api/payments/create response (master-doc.md Section 22.5). The real
 * Surfboard flow is asynchronous: this only confirms the payment was
 * *started* — `paymentUrl` (when present) is Surfboard's Hosted Payment
 * Page the customer must be redirected to next; the definitive outcome
 * (captured/failed/cancelled) only ever arrives later via the webhook and
 * is reflected on the order the customer lands back on (see
 * `useOrderReceipt`'s polling in useOrders.ts).
 */
export interface CreatePaymentResponse {
  paymentStatus: 'PAYMENT_INITIATED';
  surfboardPaymentId: string;
  paymentUrl: string | null;
}

/**
 * POST /api/payments/create — Public, immediately follows order creation
 * (master-doc.md Section 22.5). Throws on `402 PAYMENT_DECLINED` /
 * `503 PROVIDER_UNAVAILABLE` — callers distinguish the two per Section 29.5
 * (customer-actionable decline vs. system-level unavailability).
 */
export async function createPayment(payload: CreatePaymentPayload): Promise<CreatePaymentResponse> {
  const { data } = await apiClient.post<CreatePaymentResponse>('/payments/create', payload);
  return data;
}

export interface CreateRefundPayload {
  amount: number;
  reason?: string;
}

/** POST /api/payments/:id/refund response (master-doc.md Section 22.6) — provisional, the real outcome arrives via webhook. */
export interface CreateRefundResponse {
  refundId: string;
  status: 'pending';
}

/** POST /api/payments/:id/refund — Authenticated (owner), master-doc.md Section 22.6/14.4. `:id` is the orderId. */
export async function createRefund(orderId: string, payload: CreateRefundPayload): Promise<CreateRefundResponse> {
  const { data } = await apiClient.post<CreateRefundResponse>(`/payments/${orderId}/refund`, payload);
  return data;
}
