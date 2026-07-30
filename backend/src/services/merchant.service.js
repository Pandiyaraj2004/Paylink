const merchantRepository = require('../repositories/merchant.repository');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');

const MAX_BUSINESS_NAME_LEN = 80;
const MAX_TAGLINE_LEN = 140;
const MAX_PHOTO_BYTES = 150 * 1024; // ~150KB backstop (Section 19.2)
const MAX_LOGO_BYTES = 100 * 1024; // ~100KB backstop (Section 19.2)

// Simple bad-word list — a basic backstop, not a full profanity service
// (master-doc.md Section 26.6 / 30.12).
const BAD_WORDS = ['damn', 'hell', 'shit', 'fuck', 'bitch', 'asshole'];

function assertTaglineClean(tagline) {
  if (tagline == null) return;
  if (typeof tagline !== 'string' || tagline.length > MAX_TAGLINE_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `tagline must be a string up to ${MAX_TAGLINE_LEN} characters.`);
  }
  const lower = tagline.toLowerCase();
  if (BAD_WORDS.some((word) => lower.includes(word))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'tagline contains disallowed language.');
  }
}

function base64DecodedSize(base64) {
  const clean = base64.replace(/^data:.*;base64,/, '');
  return Math.floor((clean.length * 3) / 4);
}

function assertImageBudget(field, base64, maxBytes) {
  if (base64 == null) return;
  if (typeof base64 !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} must be a base64 string.`);
  }
  if (base64DecodedSize(base64) > maxBytes) {
    throw new AppError(400, 'VALIDATION_ERROR', `${field} exceeds the maximum allowed size.`);
  }
}

async function getMerchant(merchantId, uid) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);
  return merchant;
}

async function updateMerchantProfile(merchantId, uid, patch) {
  const merchant = await getMerchant(merchantId, uid);

  const allowedFields = ['businessName', 'tagline', 'category', 'photoBase64', 'logoBase64'];
  const update = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      update[field] = patch[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(update, 'businessName')) {
    if (typeof update.businessName !== 'string' || update.businessName.length === 0 || update.businessName.length > MAX_BUSINESS_NAME_LEN) {
      throw new AppError(400, 'VALIDATION_ERROR', `businessName must be 1-${MAX_BUSINESS_NAME_LEN} characters.`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(update, 'tagline')) {
    assertTaglineClean(update.tagline);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'photoBase64')) {
    assertImageBudget('photoBase64', update.photoBase64, MAX_PHOTO_BYTES);
  }

  if (Object.prototype.hasOwnProperty.call(update, 'logoBase64')) {
    assertImageBudget('logoBase64', update.logoBase64, MAX_LOGO_BYTES);
  }

  // Business rule (Section 11, step 10): the AI Setup Concierge confirm flow
  // ends with a products bulk write followed by this branding PATCH as its
  // last two calls — once branding lands on a still-`pending_setup` store,
  // setup is considered complete and the store moves into the admin
  // approval queue.
  if (merchant.status === 'pending_setup') {
    update.status = 'pending_approval';
  }

  if (Object.keys(update).length === 0) {
    return merchant;
  }

  return merchantRepository.updateMerchant(merchantId, update);
}

async function updateMerchantStatus(merchantId, uid, status) {
  await getMerchant(merchantId, uid);

  if (status !== 'open' && status !== 'closed') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be "open" or "closed".');
  }

  return merchantRepository.updateMerchant(merchantId, { status });
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function sumOrders(orders) {
  return Number(orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2));
}

async function getMerchantSummary(merchantId, uid) {
  await getMerchant(merchantId, uid);

  const now = new Date();
  const [todayOrders, weekOrders, monthOrders] = await Promise.all([
    orderRepository.getOrdersInRange(merchantId, startOfToday(), now),
    orderRepository.getOrdersInRange(merchantId, startOfWeek(), now),
    orderRepository.getOrdersInRange(merchantId, startOfMonth(), now),
  ]);

  const recentOrders = [...monthOrders]
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 10);

  return {
    today: { total: sumOrders(todayOrders), orderCount: todayOrders.length },
    week: { total: sumOrders(weekOrders), orderCount: weekOrders.length },
    month: { total: sumOrders(monthOrders), orderCount: monthOrders.length },
    recentOrders,
  };
}

/**
 * GET /api/merchants/:slug/public-page (master-doc.md Section 22.2, 15.1).
 * Public — no ownership check. Resolves the slug via the pageSlugs lookup,
 * then shapes the exact documented response: no fields beyond
 * `{ businessName, tagline, photoBase64, items, customAmountAllowed, isOpen }`
 * (notably no `logoBase64`, matching 15.1's layout listing).
 */
async function getPublicPage(slug) {
  const merchant = await merchantRepository.getMerchantBySlug(slug);
  if (!merchant) {
    throw new AppError(404, 'STORE_NOT_FOUND', 'Store not found.');
  }

  const products = await productRepository.listProducts(merchant.id);
  const items = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency,
    isCustomAllowed: !!p.isCustomAllowed,
    ...(p.imageBase64 ? { imageBase64: p.imageBase64 } : {}),
  }));

  // The documented merchant schema (Section 19.2) has no merchant-level
  // custom-amount field, so this is derived: true if any product allows a
  // custom amount. (Section 15.1 also references entrepreneur-configured
  // min/max bounds for custom amounts, but no such field exists anywhere in
  // the documented schema either — deliberately not inventing one here.)
  const customAmountAllowed = items.some((item) => item.isCustomAllowed);

  // Reuses the exact same `status` field that PATCH /api/merchants/:id/status
  // (updateMerchantStatus, above) writes 'open'/'closed' into, and the same
  // derivation Dashboard.tsx already uses client-side: a store that hasn't
  // been explicitly toggled yet (`active`) counts as open.
  const isOpen = merchant.status === 'open' || merchant.status === 'active';

  return {
    businessName: merchant.businessName,
    tagline: merchant.tagline,
    photoBase64: merchant.photoBase64,
    items,
    customAmountAllowed,
    isOpen,
  };
}

module.exports = {
  getMerchant,
  updateMerchantProfile,
  updateMerchantStatus,
  getMerchantSummary,
  getPublicPage,
};
