const { admin } = require('../config/firebase');

/**
 * Firestore Admin SDK access ONLY for merchants/{merchantId}/gallery
 * (master-doc.md Section 19.2) — a subcollection, not an array field on the
 * merchant document, for the same reason products/orders are subcollections:
 * each gallery image is its own small (~50-80KB compressed base64) document,
 * addable/removable without rewriting the whole merchant profile. Mirrors
 * product.repository.js's shape exactly. No business logic here — see
 * services/merchant.service.js's listGallery/addGalleryImage/deleteGalleryImage.
 */
function db() {
  return admin.firestore();
}

function galleryCollection(merchantId) {
  return db().collection('merchants').doc(merchantId).collection('gallery');
}

async function listGalleryImages(merchantId) {
  const snap = await galleryCollection(merchantId).orderBy('order', 'asc').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function addGalleryImage(merchantId, { imageBase64, order }) {
  const docRef = galleryCollection(merchantId).doc();
  const data = {
    imageBase64,
    order,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await docRef.set(data);
  return { id: docRef.id, ...data };
}

async function getGalleryImage(merchantId, imageId) {
  const snap = await galleryCollection(merchantId).doc(imageId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function deleteGalleryImage(merchantId, imageId) {
  await galleryCollection(merchantId).doc(imageId).delete();
}

module.exports = { listGalleryImages, addGalleryImage, getGalleryImage, deleteGalleryImage };
