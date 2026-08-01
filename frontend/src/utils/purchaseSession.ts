/**
 * Session-scoped (per-tab, cleared on tab close) tracking for the Single
 * Product Checkout flow. `sessionStorage` — not `localStorage` — is
 * deliberate: it's isolated per tab (two tabs checking out the same product
 * link never interfere with each other) and clears itself when the tab
 * closes, matching "in that session" from the spec.
 *
 * Two separate records are kept per merchant:
 * - A "pending order" guard, written the moment an order is created and
 *   before the redirect to Surfboard's hosted page — so if the customer
 *   comes back to the exact same checkout link (browser back, or the
 *   Surfboard redirect never completing) and hits Pay Now again, the
 *   existing order is resumed instead of a second one being created.
 * - A "completed purchase" record, written once an order is confirmed paid
 *   — drives the storefront's "Purchased" badge and the locked checkout
 *   page's "Already paid" state, both with a "Buy Again" escape hatch that
 *   explicitly clears these records and starts a fresh order.
 */

export interface PendingOrderRecord {
  orderId: string;
  createdAt: number;
}

export interface PurchaseRecord {
  orderId: string;
  transactionId: string | null;
  paidAt: string;
  amount: number;
  currency: string;
}

/** How long a pending order is trusted before treating it as stale and starting fresh — mirrors the backend's own reconciliation window (order.service.js / PAYMENT_RECONCILIATION_TIMEOUT_MINUTES default). */
const PENDING_ORDER_MAX_AGE_MS = 30 * 60 * 1000;

/** Products don't have `'custom'` as a valid id, so it's a safe sentinel for a custom-amount checkout. */
export function productKeyFor(productId: string | null | undefined): string {
  return productId || 'custom';
}

function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    // Private-browsing/storage-disabled contexts — degrade to "no record found" rather than throwing.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore — worst case, the resume/badge conveniences are unavailable this session.
  }
}

function safeRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function pendingKey(slug: string, productKey: string): string {
  return `paylink:pending-order:${slug}:${productKey}`;
}

function purchaseKey(slug: string, productKey: string): string {
  return `paylink:purchased:${slug}:${productKey}`;
}

export function getPendingOrder(slug: string, productKey: string): PendingOrderRecord | null {
  const raw = safeGet(pendingKey(slug, productKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingOrderRecord;
    if (Date.now() - parsed.createdAt > PENDING_ORDER_MAX_AGE_MS) {
      safeRemove(pendingKey(slug, productKey));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setPendingOrder(slug: string, productKey: string, orderId: string): void {
  safeSet(pendingKey(slug, productKey), JSON.stringify({ orderId, createdAt: Date.now() }));
}

export function clearPendingOrder(slug: string, productKey: string): void {
  safeRemove(pendingKey(slug, productKey));
}

export function getPurchaseRecord(slug: string, productKey: string): PurchaseRecord | null {
  const raw = safeGet(purchaseKey(slug, productKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PurchaseRecord;
  } catch {
    return null;
  }
}

export function recordPurchase(slug: string, productKey: string, record: PurchaseRecord): void {
  safeSet(purchaseKey(slug, productKey), JSON.stringify(record));
  clearPendingOrder(slug, productKey);
}

/** Used by "Buy Again" — clears both records so the next checkout starts a genuinely new order. */
export function clearPurchase(slug: string, productKey: string): void {
  safeRemove(purchaseKey(slug, productKey));
  clearPendingOrder(slug, productKey);
}

/** All completed purchases for a merchant this session, keyed by product key — used to badge the full storefront catalog grid after "Continue Browsing". */
export function getAllPurchases(slug: string, productKeys: string[]): Record<string, PurchaseRecord> {
  const result: Record<string, PurchaseRecord> = {};
  for (const key of productKeys) {
    const record = getPurchaseRecord(slug, key);
    if (record) result[key] = record;
  }
  return result;
}
