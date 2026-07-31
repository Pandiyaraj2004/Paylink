const orderService = require('../services/order.service');

/**
 * Thin HTTP handlers for the Order Engine (master-doc.md Section 22.4).
 * Controllers never contain business logic — see order.service.js.
 */

/** POST /api/orders — Public (customer checkout). */
async function createOrder(req, res, next) {
  try {
    const { merchantId, items, customAmount, note, tip, customerName, customerPhone } = req.body || {};
    const result = await orderService.createOrder({
      merchantId,
      items,
      customAmount,
      note,
      tip,
      customerName,
      customerPhone,
    });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/merchants/:id/orders — Authenticated (owner). */
async function listOrders(req, res, next) {
  try {
    // `customer` (Section 14.9's "→ Orders filtered by that customer" nav
    // from the Customers page) maps to the customerRef hash, not a raw name.
    const { status, from, to, customer, page, pageSize } = req.query || {};
    const result = await orderService.listOrders(req.params.id, req.user.uid, {
      status,
      from,
      to,
      customerRef: customer,
      page,
      pageSize,
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/orders/:id/fulfil — Authenticated (owner). */
async function fulfilOrder(req, res, next) {
  try {
    const result = await orderService.fulfilOrder(req.params.id, req.user.uid);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/orders/:id/receipt — Public via unique order link, or Authenticated (owner). */
async function getReceipt(req, res, next) {
  try {
    const result = await orderService.getReceiptData(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** GET /api/orders/:id/bill-pdf — Public via unique order link, or Authenticated (owner). */
async function getBillPdf(req, res, next) {
  try {
    const result = await orderService.getBillPdfData(req.params.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/** POST /api/orders/:id/rating — Public via unique order link (Section 15.3). */
async function submitRating(req, res, next) {
  try {
    const { stars, comment } = req.body || {};
    const result = await orderService.submitRating(req.params.id, { stars, comment });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createOrder, listOrders, fulfilOrder, getReceipt, getBillPdf, submitRating };
