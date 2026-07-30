const express = require('express');
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');

const router = express.Router();

// POST /api/merchants/:id/products (bulk create via { items: [...] }, or a
// single flat product per master-doc.md Section 22.3 — see the controller)
router.post('/:id/products', authMiddleware, requireRole('entrepreneur'), productController.bulkCreateProducts);

// PATCH /api/merchants/:id/products/:productId
router.patch(
  '/:id/products/:productId',
  authMiddleware,
  requireRole('entrepreneur'),
  productController.updateProduct
);

// DELETE /api/merchants/:id/products/:productId
router.delete(
  '/:id/products/:productId',
  authMiddleware,
  requireRole('entrepreneur'),
  productController.deleteProduct
);

module.exports = router;
