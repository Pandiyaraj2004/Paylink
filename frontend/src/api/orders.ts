import { apiClient } from './client';

/** A single line item as stored on the order (backend order.service.js `buildOrderItems`). */
export interface OrderItem {
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  customAmount: number | null;
}

export interface CreateOrderPayload {
  merchantId: string;
  items?: Array<{ productId: string; quantity: number }>;
  customAmount?: number;
  note?: string;
  tip?: number;
  customerName?: string;
  customerPhone?: string;
}

/** POST /api/orders response (master-doc.md Section 22.4). */
export interface CreateOrderResponse {
  orderId: string;
  totalAmount: number;
  currency: string;
}

/** POST /api/orders — Public (customer checkout, master-doc.md Section 22.4). */
export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  const { data } = await apiClient.post<CreateOrderResponse>('/orders', payload);
  return data;
}

/** Merchant branding surfaced alongside the receipt/bill (backend `loadOrderPublicData`). */
export interface ReceiptMerchant {
  businessName: string;
  tagline: string | null;
  logoBase64: string | null;
  photoBase64: string | null;
}

/** Shared shape returned by both GET /api/orders/:id/receipt and /bill-pdf. */
export interface OrderReceiptData {
  orderId: string;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  tipAmount: number;
  note: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  createdAt: string;
  issuedAt: string | null;
  merchant: ReceiptMerchant | null;
}

export interface OrderReceiptResponse extends OrderReceiptData {
  receiptUrl: string;
}

/**
 * GET /api/orders/:id/receipt — Public via unique order link (master-doc.md
 * Section 22.7, 15.3). Deliberately the only receipt/bill fetch the frontend
 * makes: GET /api/orders/:id/bill-pdf (backend order.service.js
 * `getBillPdfData`) returns the exact same order data shape (just
 * `billPdfUrl` instead of `receiptUrl`) since the PDF itself is generated
 * client-side from this data (Section 21.8) — calling both would be a
 * redundant network round-trip for identical data.
 */
export async function getOrderReceipt(orderId: string): Promise<OrderReceiptResponse> {
  const { data } = await apiClient.get<OrderReceiptResponse>(`/orders/${orderId}/receipt`);
  return data;
}

export interface SubmitRatingPayload {
  stars: number;
  comment?: string;
}

export interface SubmitRatingResponse {
  rating: { stars: number; comment: string | null; createdAt: string };
}

/** POST /api/orders/:id/rating — Public via unique order link (master-doc.md Section 15.3). */
export async function submitRating(orderId: string, payload: SubmitRatingPayload): Promise<SubmitRatingResponse> {
  const { data } = await apiClient.post<SubmitRatingResponse>(`/orders/${orderId}/rating`, payload);
  return data;
}

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'cancelled' | 'failed';
export type FulfilmentStatus = 'unfulfilled' | 'fulfilled';

/** A single refund record on an order's `refunds` subcollection (backend payment.repository.js). */
export interface OrderRefund {
  id: string;
  amount: number;
  reason: string | null;
  status: 'pending' | 'completed' | 'failed';
  surfboardRefundId: string | null;
  createdAt: string;
}

export interface OrderPayment {
  surfboardOrderId: string | null;
  surfboardPaymentId: string | null;
  method: string | null;
  status: string;
  capturedAt: string | null;
}

/** A single order as returned by GET /api/merchants/:id/orders (master-doc.md Section 22.4, 14.4). */
export interface MerchantOrder {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  note: string | null;
  tipAmount: number;
  payment: OrderPayment;
  fulfilmentStatus: FulfilmentStatus;
  createdAt: string;
  /** Only populated for paid/refunded/partially_refunded orders (order.service.js listOrders). */
  refunds: OrderRefund[];
}

export interface ListMerchantOrdersParams {
  status?: OrderStatus;
  from?: string;
  to?: string;
  /** customerRef hash — the Customers page's (Section 14.9) "→ Orders filtered by that customer" nav. */
  customer?: string;
  page?: number;
  pageSize?: number;
}

export interface ListMerchantOrdersResponse {
  items: MerchantOrder[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /api/merchants/:id/orders — Authenticated (owner), master-doc.md Section 22.4/14.4. */
export async function listMerchantOrders(
  merchantId: string,
  params: ListMerchantOrdersParams = {}
): Promise<ListMerchantOrdersResponse> {
  const { data } = await apiClient.get<ListMerchantOrdersResponse>(`/merchants/${merchantId}/orders`, { params });
  return data;
}

/** PATCH /api/orders/:id/fulfil — Authenticated (owner), master-doc.md Section 22.4. */
export async function fulfilOrder(orderId: string): Promise<{ status: FulfilmentStatus }> {
  const { data } = await apiClient.patch<{ status: FulfilmentStatus }>(`/orders/${orderId}/fulfil`);
  return data;
}
