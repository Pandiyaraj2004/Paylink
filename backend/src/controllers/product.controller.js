const productService = require('../services/product.service');

/**
 * POST /api/merchants/:id/products (master-doc.md Section 22.3). Supports
 * two request shapes on the same endpoint: the original bulk-create body
 * `{ items: [...] }` used by the AI Setup Concierge (Section 14.2), kept
 * working exactly as before, and the documented single flat product body
 * `{ name, price, currency, isCustomAllowed }` used by the Catalog tab's
 * "Add Item" modal (Section 14.5).
 */
async function bulkCreateProducts(req, res, next) {
  try {
    const body = req.body || {};
    if (Array.isArray(body.items)) {
      const created = await productService.bulkCreateProducts(req.params.id, req.user.uid, body.items);
      return res.status(201).json({ items: created });
    }
    const created = await productService.createProduct(req.params.id, req.user.uid, body);
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
}

/** PATCH /api/merchants/:id/products/:productId (master-doc.md Section 22.3) */
async function updateProduct(req, res, next) {
  try {
    const updated = await productService.updateProduct(
      req.params.id,
      req.user.uid,
      req.params.productId,
      req.body || {}
    );
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
}

/** DELETE /api/merchants/:id/products/:productId (master-doc.md Section 22.3) */
async function deleteProduct(req, res, next) {
  try {
    await productService.deleteProduct(req.params.id, req.user.uid, req.params.productId);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { bulkCreateProducts, updateProduct, deleteProduct };
