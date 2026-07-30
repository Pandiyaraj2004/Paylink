import { apiClient } from './client';

/**
 * Merchant lifecycle status (master-doc.md Section 11/19.2) plus the
 * open/closed operating state surfaced by PATCH /api/merchants/:id/status.
 */
export type MerchantStatus =
  | 'pending_setup'
  | 'pending_approval'
  | 'active'
  | 'open'
  | 'closed'
  | 'suspended'
  | 'rejected';

export interface Merchant {
  id: string;
  userId: string;
  businessName: string;
  tagline: string | null;
  photoBase64: string | null;
  logoBase64: string | null;
  category: string;
  status: MerchantStatus;
  surfboardSubmerchantId: string | null;
  pageSlug: string;
  createdAt: string;
}

export interface MerchantSummaryOrder {
  id: string;
  customerRef: string | null;
  totalAmount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface MerchantSummaryPeriod {
  total: number;
  orderCount: number;
}

export interface MerchantSummary {
  today: MerchantSummaryPeriod;
  week: MerchantSummaryPeriod;
  month: MerchantSummaryPeriod;
  currency?: string;
  recentOrders: MerchantSummaryOrder[];
}

export interface MerchantPatchPayload {
  businessName?: string;
  tagline?: string;
  category?: string;
  photoBase64?: string;
  logoBase64?: string;
}

export interface ProductPayload {
  name: string;
  price: number;
  currency: string;
  isCustomAllowed: boolean;
  imageBase64?: string | null;
}

/** A single item as returned by the backend (Section 19.2 products subcollection). */
export interface Product {
  id: string;
  name: string;
  price: number;
  currency: string;
  isCustomAllowed: boolean;
  imageBase64?: string | null;
}

/** GET /api/merchants/:slug/public-page response shape (master-doc.md Section 22.2). */
export interface PublicPage {
  businessName: string;
  tagline: string | null;
  photoBase64: string | null;
  items: Product[];
  customAmountAllowed: boolean;
  isOpen: boolean;
}

export async function getMerchant(id: string): Promise<Merchant> {
  const { data } = await apiClient.get<Merchant>(`/merchants/${id}`);
  return data;
}

export async function patchMerchant(id: string, payload: MerchantPatchPayload): Promise<Merchant> {
  const { data } = await apiClient.patch<Merchant>(`/merchants/${id}`, payload);
  return data;
}

export async function setMerchantStatus(id: string, status: 'open' | 'closed'): Promise<{ status: string }> {
  const { data } = await apiClient.patch<{ status: string }>(`/merchants/${id}/status`, { status });
  return data;
}

export async function getMerchantSummary(id: string): Promise<MerchantSummary> {
  const { data } = await apiClient.get<MerchantSummary>(`/merchants/${id}/summary`);
  return data;
}

export async function createMerchantProducts(id: string, items: ProductPayload[]): Promise<unknown> {
  const { data } = await apiClient.post(`/merchants/${id}/products`, { items });
  return data;
}

/** GET /api/merchants/:slug/public-page — Public, no auth (master-doc.md Section 22.2). */
export async function getPublicPage(slug: string): Promise<PublicPage> {
  const { data } = await apiClient.get<PublicPage>(`/merchants/${slug}/public-page`);
  return data;
}

/** POST /api/merchants/:id/products — single flat product (master-doc.md Section 22.3). */
export async function createProduct(merchantId: string, item: ProductPayload): Promise<Product> {
  const { data } = await apiClient.post<Product>(`/merchants/${merchantId}/products`, item);
  return data;
}

/** PATCH /api/merchants/:id/products/:productId (master-doc.md Section 22.3). */
export async function updateProduct(
  merchantId: string,
  productId: string,
  patch: Partial<ProductPayload>
): Promise<Product> {
  const { data } = await apiClient.patch<Product>(`/merchants/${merchantId}/products/${productId}`, patch);
  return data;
}

/** DELETE /api/merchants/:id/products/:productId (master-doc.md Section 22.3). */
export async function deleteProduct(merchantId: string, productId: string): Promise<void> {
  await apiClient.delete(`/merchants/${merchantId}/products/${productId}`);
}
