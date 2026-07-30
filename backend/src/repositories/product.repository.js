const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access ONLY for merchants/{merchantId}/products.
 * No business logic here — see services/product.service.js.
 */
function db() {
  return admin.firestore();
}

function productsCollection(merchantId) {
  return db().collection('merchants').doc(merchantId).collection('products');
}

async function bulkCreateProducts(merchantId, items) {
  const batch = db().batch();
  const collectionRef = productsCollection(merchantId);
  const created = [];

  for (const item of items) {
    const docRef = collectionRef.doc();
    const data = {
      name: item.name,
      price: item.price,
      currency: item.currency,
      isCustomAllowed: !!item.isCustomAllowed,
      imageBase64: item.imageBase64 || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    batch.set(docRef, data);
    created.push({ id: docRef.id, ...data });
  }

  await batch.commit();
  return created;
}

async function createProduct(merchantId, item) {
  const docRef = productsCollection(merchantId).doc();
  const data = {
    name: item.name,
    price: item.price,
    currency: item.currency,
    isCustomAllowed: !!item.isCustomAllowed,
    imageBase64: item.imageBase64 || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await docRef.set(data);
  return { id: docRef.id, ...data };
}

async function getProductById(merchantId, productId) {
  const snap = await productsCollection(merchantId).doc(productId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function updateProduct(merchantId, productId, patch) {
  const docRef = productsCollection(merchantId).doc(productId);
  await docRef.update(patch);
  const snap = await docRef.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function deleteProduct(merchantId, productId) {
  await productsCollection(merchantId).doc(productId).delete();
}

async function listProducts(merchantId) {
  const snap = await productsCollection(merchantId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
  bulkCreateProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
  listProducts,
};
