const orderRepository = require('../repositories/order.repository');
const merchantRepository = require('../repositories/merchant.repository');
const disputeRepository = require('../repositories/dispute.repository');
const AppError = require('../utils/AppError');

/**
 * Business logic behind POST /api/disputes (master-doc.md Section 15.4:
 * "Contact PayLink Support" — informational page's only side-effectful
 * action, escalating into the Admin Refunds & Disputes page's Disputes tab,
 * Section 16.4). Not itself broken out under Section 22's API docs (no
 * 22.11 "Disputes" heading — 15.4/16.4 only ever reference the endpoint by
 * name), so this endpoint's exact request/response shape is this file's own
 * design, following the same thin controller -> service -> repository
 * layering and AppError-for-validation conventions as order.service.js/
 * refund.service.js.
 *
 * Public — a customer without an account is filing this (Section 15.4:
 * "Fully public"), so no auth/ownership check anywhere in this file.
 */

const MESSAGE_MAX_LEN = 2000;
const NAME_MAX_LEN = 100;
const EMAIL_MAX_LEN = 150;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertMessage(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'message is required.');
  }
  if (message.length > MESSAGE_MAX_LEN) {
    throw new AppError(400, 'VALIDATION_ERROR', `message must be up to ${MESSAGE_MAX_LEN} characters.`);
  }
}

function assertOptionalText(value, fieldName, maxLen) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > maxLen) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a string up to ${maxLen} characters.`);
  }
  return value.trim() || null;
}

function assertEmail(email) {
  const value = assertOptionalText(email, 'email', EMAIL_MAX_LEN);
  if (value && !EMAIL_REGEX.test(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email must be a valid email address.');
  }
  return value;
}

/**
 * `orderId` is optional — Section 15.4 doesn't mandate one (a customer might
 * be complaining about something that never became a real order, or simply
 * doesn't have the link handy). When given, it must resolve to a real order
 * via the same `ordersIndex` lookup order.service.js/refund.service.js use
 * (`orderRepository.resolveMerchantIdForOrder`) — a bogus orderId is
 * rejected with 404 ORDER_NOT_FOUND rather than silently accepted, and the
 * resulting `merchantId` is authoritative (derived server-side from the
 * order, not trusted from the client).
 *
 * When no `orderId` is given, an explicit `merchantId` in the body is used
 * instead (the Support page knows its merchant from the `/pay/:slug` route
 * it's nested under — see frontend Support.tsx), verified against a real
 * merchant the same way order creation verifies it (Section 22.4).
 */
async function createDispute({ orderId, merchantId, name, email, message }) {
  assertMessage(message);
  const nameValue = assertOptionalText(name, 'name', NAME_MAX_LEN);
  const emailValue = assertEmail(email);

  let resolvedMerchantId = null;
  let resolvedOrderId = null;

  if (orderId != null) {
    if (typeof orderId !== 'string' || !orderId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'orderId must be a non-empty string.');
    }
    const foundMerchantId = await orderRepository.resolveMerchantIdForOrder(orderId);
    if (!foundMerchantId) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    }
    resolvedMerchantId = foundMerchantId;
    resolvedOrderId = orderId;
  } else if (merchantId != null) {
    if (typeof merchantId !== 'string' || !merchantId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'merchantId must be a non-empty string.');
    }
    const merchant = await merchantRepository.getMerchantById(merchantId);
    if (!merchant) {
      throw new AppError(404, 'MERCHANT_NOT_FOUND', 'Merchant not found.');
    }
    resolvedMerchantId = merchantId;
  }

  const created = await disputeRepository.createDispute({
    // Documented Section 19.2 fields:
    merchantId: resolvedMerchantId,
    orderId: resolvedOrderId,
    status: 'open',
    resolutionNotes: null,
    resolvedAt: null,
    // Additive beyond Section 19.2's documented schema — the actual
    // complaint content the Admin Refunds & Disputes page (16.4) needs to
    // display alongside the linked order, the same "additive, never
    // replacing a documented field" pattern order.service.js already uses
    // for customerName/customerPhone.
    contactName: nameValue,
    contactEmail: emailValue,
    message: message.trim(),
  });

  return { disputeId: created.id, status: created.status };
}

module.exports = { createDispute };
