const merchantRepository = require('../repositories/merchant.repository');
const productRepository = require('../repositories/product.repository');
const AppError = require('../utils/AppError');
const { assertOwnership } = require('../utils/ownership');
const env = require('../config/env');

const MAX_NAME_LEN = 60;
// A pragmatic, non-exhaustive check — plausible ISO 4217 alphabetic codes.
const ISO_CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Rejects a currency that isn't in env.SURFBOARD_ACTIVE_CURRENCIES — a
 * narrower, config-driven check than ISO_CURRENCY_RE above (which only
 * checks shape). Live-verified against the real Surfboard demo account:
 * EUR/NOK both fail order creation with a real Surfboard error (OR_0004:
 * currency code not associated with this merchant) — only SEK is actually
 * accepted today. Catching this at catalog-item creation time, rather than
 * only at checkout, gives the entrepreneur a clear error up front instead
 * of a customer hitting a payment failure later.
 */
function assertActiveCurrency(currency, label) {
  if (!env.SURFBOARD_ACTIVE_CURRENCIES.includes(currency)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${label} must be one of ${env.SURFBOARD_ACTIVE_CURRENCIES.join(', ')} (the currencies currently active for this store).`
    );
  }
}

function validateItem(item, index) {
  if (!item || typeof item !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', `items[${index}] must be an object.`);
  }
  const { name, price, currency } = item;

  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_NAME_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `items[${index}].name must be 1-${MAX_NAME_LEN} characters.`);
  }
  if (typeof price !== 'number' || Number.isNaN(price) || price < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `items[${index}].price must be a number >= 0.`);
  }
  if (typeof currency !== 'string' || !ISO_CURRENCY_RE.test(currency)) {
    throw new AppError(400, 'VALIDATION_ERROR', `items[${index}].currency must be a 3-letter ISO 4217 code.`);
  }
  assertActiveCurrency(currency, `items[${index}].currency`);
}

/**
 * Validates a PATCH body against the same field rules `validateItem` uses
 * for create, but sensibly for a partial update: only the fields actually
 * present are checked/applied, none are required (master-doc.md Section
 * 22.3 — PATCH doesn't document a required body shape the way POST does).
 */
function validatePartialItem(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object.');
  }

  const allowedFields = ['name', 'price', 'currency', 'isCustomAllowed', 'imageBase64'];
  const update = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      update[field] = patch[field];
    }
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'No valid fields to update.');
  }

  if (Object.prototype.hasOwnProperty.call(update, 'name')) {
    if (typeof update.name !== 'string' || update.name.length === 0 || update.name.length > MAX_NAME_LEN) {
      throw new AppError(400, 'VALIDATION_ERROR', `name must be 1-${MAX_NAME_LEN} characters.`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(update, 'price')) {
    if (typeof update.price !== 'number' || Number.isNaN(update.price) || update.price < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'price must be a number >= 0.');
    }
  }
  if (Object.prototype.hasOwnProperty.call(update, 'currency')) {
    if (typeof update.currency !== 'string' || !ISO_CURRENCY_RE.test(update.currency)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'currency must be a 3-letter ISO 4217 code.');
    }
    assertActiveCurrency(update.currency, 'currency');
  }
  if (Object.prototype.hasOwnProperty.call(update, 'isCustomAllowed') && typeof update.isCustomAllowed !== 'boolean') {
    throw new AppError(400, 'VALIDATION_ERROR', 'isCustomAllowed must be a boolean.');
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'imageBase64') &&
    update.imageBase64 !== null &&
    typeof update.imageBase64 !== 'string'
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'imageBase64 must be a base64 string or null.');
  }

  return update;
}

async function getOwnedMerchantOrThrow(merchantId, uid) {
  const merchant = await merchantRepository.getMerchantById(merchantId);
  if (!merchant) {
    throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
  }
  assertOwnership(merchant, uid);
  return merchant;
}

async function bulkCreateProducts(merchantId, uid, items) {
  await getOwnedMerchantOrThrow(merchantId, uid);

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'items must be a non-empty array.');
  }

  items.forEach(validateItem);

  return productRepository.bulkCreateProducts(merchantId, items);
}

/** POST /api/merchants/:id/products (single flat product, master-doc.md Section 22.3). */
async function createProduct(merchantId, uid, item) {
  await getOwnedMerchantOrThrow(merchantId, uid);
  validateItem(item, 0);
  return productRepository.createProduct(merchantId, item);
}

/** PATCH /api/merchants/:id/products/:productId (master-doc.md Section 22.3). */
async function updateProduct(merchantId, uid, productId, patch) {
  await getOwnedMerchantOrThrow(merchantId, uid);

  const existing = await productRepository.getProductById(merchantId, productId);
  if (!existing) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  const update = validatePartialItem(patch);
  return productRepository.updateProduct(merchantId, productId, update);
}

/** DELETE /api/merchants/:id/products/:productId (master-doc.md Section 22.3). */
async function deleteProduct(merchantId, uid, productId) {
  await getOwnedMerchantOrThrow(merchantId, uid);

  const existing = await productRepository.getProductById(merchantId, productId);
  if (!existing) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }

  await productRepository.deleteProduct(merchantId, productId);
}

module.exports = { bulkCreateProducts, createProduct, updateProduct, deleteProduct };
