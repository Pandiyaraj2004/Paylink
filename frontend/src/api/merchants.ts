import { apiClient } from './client';

/**
 * Merchant lifecycle status (master-doc.md Section 11/19.2) plus the
 * open/closed operating state surfaced by PATCH /api/merchants/:id/status.
 * Deviation: no manual admin approval step — a merchant moves straight from
 * `pending_setup` to `active` once setup completes, so `pending_approval` is
 * never reached and isn't part of this union.
 */
export type MerchantStatus =
  | 'pending_setup'
  | 'active'
  | 'open'
  | 'closed'
  | 'suspended'
  | 'rejected';

/**
 * Business hours (master-doc.md Section 14.7's Phase 12 expansion — no
 * structure specified by the doc, kept simple): one entry per weekday,
 * `null` meaning "not set". `open`/`close` are plain free-text strings
 * (e.g. "09:00"), not real time values.
 */
export type BusinessHoursDay = { open: string | null; close: string | null; closed: boolean } | null;

export interface BusinessHours {
  mon?: BusinessHoursDay;
  tue?: BusinessHoursDay;
  wed?: BusinessHoursDay;
  thu?: BusinessHoursDay;
  fri?: BusinessHoursDay;
  sat?: BusinessHoursDay;
  sun?: BusinessHoursDay;
}

/**
 * Social links (Section 14.7 expansion) — plain strings, no URL-format
 * enforcement. `whatsapp` is NOT offered here in the UI (Profile.tsx) — it
 * lives only as the top-level `Merchant.whatsapp` contact field below, to
 * avoid two homes for the same piece of information. Kept as an optional
 * key on the type only so a value written by an older client isn't lost.
 */
export interface SocialLinks {
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  whatsapp?: string | null;
}

/** Address (Section 19.2, Profile page's Contact & Location card). */
export interface MerchantAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/**
 * Notifications tab's "channel preferences" (Section 14.7) — honestly
 * minimal: `in_app` is the only channel that actually delivers anything in
 * this app, so this is a single real toggle rather than several fake ones.
 */
export interface NotificationPreferences {
  inApp: boolean;
}

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
  // Phase 12 / Section 14.7 Profile & Business tab expansion — additive,
  // not part of the original Section 19.2 schema table.
  coverBannerBase64?: string | null;
  themePrimaryColor?: string | null;
  themeSecondaryColor?: string | null;
  businessHours?: BusinessHours | null;
  socialLinks?: SocialLinks | null;
  notificationPreferences?: NotificationPreferences | null;
  // Section 14.12 Language tab (PATCH .../settings). Bank/settlement fields
  // used to live here too in an earlier revision — reverted per Section 30
  // rule 12 / Section 19.2's `payout/details` subcollection. Bank details now
  // live in their own separately-secured subcollection, never on this
  // document — see MerchantPayoutStatus/patchMerchantPayout below.
  language?: string | null;
  // Section 19.2/14.14 — About + Contact & Location cards on the Profile
  // page. Documented in the schema since the doc's first revision;
  // implemented on the Profile page now.
  ownerName?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: MerchantAddress | null;
  googleMapsUrl?: string | null;
  ratingAverage?: number;
  ratingCount?: number;
}

/** A single line item snapshotted onto an order at checkout (order.service.js's buildOrderItems). */
export interface MerchantSummaryOrderItem {
  /** Null for a custom-amount line item — no catalog product backs it, so it's not a "product" to rank. */
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  customAmount: number | null;
}

export interface MerchantSummaryOrder {
  id: string;
  customerRef: string | null;
  totalAmount: number;
  /** totalAmount net of committed refunds, 0 for a pending/failed/cancelled order — what SalesTrendChart aggregates. */
  netAmount: number;
  currency: string;
  status: string;
  createdAt: string;
  /**
   * Not a dedicated field of the documented /summary response shape — it
   * rides along because backend/src/services/merchant.service.js's
   * getMerchantSummary builds `recentOrders` by spreading the raw order
   * document (`{ ...order, createdAt, netAmount }`), and `items` (written by
   * order.service.js's createOrder) is already on that document. Real data,
   * just an incidental field rather than a purpose-built one — see
   * Analytics.tsx's TopProducts for the one place this repo reads it, and
   * that component's own comment on the sample size/recency this implies.
   */
  items?: MerchantSummaryOrderItem[];
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
  coverBannerBase64?: string | null;
  themePrimaryColor?: string;
  themeSecondaryColor?: string;
  businessHours?: BusinessHours;
  socialLinks?: SocialLinks;
  notificationPreferences?: NotificationPreferences;
  ownerName?: string;
  description?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: MerchantAddress;
  googleMapsUrl?: string;
}

/** PATCH /api/merchants/:id/settings body (master-doc.md Section 14.12's Language tab). */
export interface MerchantSettingsPayload {
  language?: string;
}

/**
 * merchants/{id}/payout/details (master-doc.md Section 14.12/19.2's Bank
 * Details tab) — deliberately excluded from onboarding (Section 30 rule 12)
 * and kept in its own separately-secured Firestore subcollection, never on
 * the main Merchant document above. `accountNumber` is written but never
 * read back in full (Section 19.2) — GET /api/merchants/:id/payout returns
 * `maskedAccountNumber` instead, see MerchantPayoutStatus below.
 */
export interface MerchantPayoutPayload {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscSwift: string;
  branch?: string | null;
  accountType: 'savings' | 'checking' | 'current';
  upiId?: string | null;
  settlementCurrency: string;
}

/**
 * GET/PATCH /api/merchants/:id/payout response — the Bank Details tab's
 * empty-vs-filled-in state. `completed` is false (and every other field
 * absent/null) for a newly onboarded merchant who hasn't visited this tab
 * yet, which is the NORMAL state right after onboarding (Section 14.12), not
 * an error.
 */
export interface MerchantPayoutStatus {
  completed: boolean;
  completedAt: string | null;
  bankName?: string | null;
  accountHolderName?: string | null;
  maskedAccountNumber?: string | null;
  ifscSwift?: string | null;
  branch?: string | null;
  accountType?: string | null;
  upiId?: string | null;
  settlementCurrency?: string | null;
}

/** merchants/{id}/gallery/{imageId} (master-doc.md Section 14.14/19.2) — the standalone Profile page's gallery grid. */
export interface GalleryImage {
  id: string;
  imageBase64: string;
  order: number;
  createdAt: string;
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

/** A single public review (Section 15.1/14.11) — no customer identity, ever. */
export interface PublicReview {
  stars: number;
  comment: string | null;
  createdAt: string;
}

/**
 * GET /api/merchants/:slug/public-page response shape (master-doc.md Section
 * 22.2), plus an additive `merchantId` (backend/src/services/merchant.service.js
 * `getPublicPage`) — the only call the customer-facing frontend makes before
 * checkout, and `POST /api/orders` (Section 22.4) requires `merchantId` in
 * its body, so this fills the gap needed to construct that request at all.
 */
export interface PublicPage {
  merchantId: string;
  businessName: string;
  tagline: string | null;
  photoBase64: string | null;
  items: Product[];
  customAmountAllowed: boolean;
  isOpen: boolean;
  ratingAverage: number;
  ratingCount: number;
  reviews: PublicReview[];
}

export async function getMerchant(id: string): Promise<Merchant> {
  const { data } = await apiClient.get<Merchant>(`/merchants/${id}`);
  return data;
}

export async function patchMerchant(id: string, payload: MerchantPatchPayload): Promise<Merchant> {
  const { data } = await apiClient.patch<Merchant>(`/merchants/${id}`, payload);
  return data;
}

/** PATCH /api/merchants/:id/settings — Language tab (master-doc.md Section 14.12). */
export async function patchMerchantSettings(id: string, payload: MerchantSettingsPayload): Promise<Merchant> {
  const { data } = await apiClient.patch<Merchant>(`/merchants/${id}/settings`, payload);
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

/**
 * A single ledger row as returned by GET /api/merchants/:id/transactions
 * (backend merchant.service.js `getMerchantTransactions`, master-doc.md
 * Section 14.4) — one entry per real payment or refund event, each carrying
 * its Surfboard reference id. No `payout` entries yet — settlementPayout.job.js
 * is still a documented stub, see that file and the backend service's own
 * comment.
 */
export interface TransactionEntry {
  id: string;
  type: 'payment' | 'refund';
  orderId: string;
  surfboardReferenceId: string | null;
  method?: string | null;
  reason?: string | null;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface ListMerchantTransactionsParams {
  from?: string;
  to?: string;
}

export interface ListMerchantTransactionsResponse {
  items: TransactionEntry[];
  total: number;
}

/** GET /api/merchants/:id/transactions — Authenticated (owner), master-doc.md Section 14.4. */
export async function getMerchantTransactions(
  id: string,
  params: ListMerchantTransactionsParams = {}
): Promise<ListMerchantTransactionsResponse> {
  const { data } = await apiClient.get<ListMerchantTransactionsResponse>(`/merchants/${id}/transactions`, { params });
  return data;
}

/** A single repeat customer row (master-doc.md Section 14.9). */
export interface MerchantCustomer {
  customerRef: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
}

/** GET /api/merchants/:id/customers — Authenticated (owner), master-doc.md Section 14.9. */
export async function getMerchantCustomers(id: string): Promise<MerchantCustomer[]> {
  const { data } = await apiClient.get<{ items: MerchantCustomer[] }>(`/merchants/${id}/customers`);
  return data.items;
}

/** A single review as seen by the merchant (master-doc.md Section 14.11) — includes customer name, unlike PublicReview. */
export interface MerchantReview {
  orderId: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  customerName: string | null;
}

export interface MerchantReviewsResponse {
  ratingAverage: number;
  ratingCount: number;
  reviews: MerchantReview[];
}

/** GET /api/merchants/:id/reviews — Authenticated (owner), master-doc.md Section 14.11. */
export async function getMerchantReviews(id: string): Promise<MerchantReviewsResponse> {
  const { data } = await apiClient.get<MerchantReviewsResponse>(`/merchants/${id}/reviews`);
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

/** GET /api/merchants/:id/payout (master-doc.md Section 14.12) — Bank Details tab's current state. */
export async function getMerchantPayout(id: string): Promise<MerchantPayoutStatus> {
  const { data } = await apiClient.get<MerchantPayoutStatus>(`/merchants/${id}/payout`);
  return data;
}

/** PATCH /api/merchants/:id/payout (master-doc.md Section 14.12/19.2) — Bank Details tab. */
export async function patchMerchantPayout(
  id: string,
  payload: MerchantPayoutPayload
): Promise<MerchantPayoutStatus> {
  const { data } = await apiClient.patch<MerchantPayoutStatus>(`/merchants/${id}/payout`, payload);
  return data;
}

/** GET /api/merchants/:id/gallery (master-doc.md Section 14.14). */
export async function listGalleryImages(id: string): Promise<GalleryImage[]> {
  const { data } = await apiClient.get<{ items: GalleryImage[] }>(`/merchants/${id}/gallery`);
  return data.items;
}

/** POST /api/merchants/:id/gallery (master-doc.md Section 14.14). */
export async function addGalleryImage(
  id: string,
  payload: { imageBase64: string; order?: number }
): Promise<GalleryImage> {
  const { data } = await apiClient.post<GalleryImage>(`/merchants/${id}/gallery`, payload);
  return data;
}

/** DELETE /api/merchants/:id/gallery/:imageId (master-doc.md Section 14.14). */
export async function deleteGalleryImage(id: string, imageId: string): Promise<void> {
  await apiClient.delete(`/merchants/${id}/gallery/${imageId}`);
}
