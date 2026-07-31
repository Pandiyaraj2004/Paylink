const request = require('supertest');

/**
 * Backend tests for the merchants/:id/gallery endpoints (master-doc.md
 * Section 14.14) — the new standalone Profile page's gallery grid, writing
 * to the `merchants/{id}/gallery/{imageId}` subcollection (Section 19.2).
 * Ownership + validation, mirroring product endpoint test style.
 */

jest.mock('../src/config/firebase', () => {
  const verifyIdToken = jest.fn();
  return {
    admin: {
      auth: () => ({ verifyIdToken }),
      firestore: jest.fn(),
    },
    isFirebaseReady: () => true,
    initError: () => null,
    __verifyIdToken: verifyIdToken,
  };
});

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
}));

jest.mock('../src/repositories/gallery.repository', () => ({
  listGalleryImages: jest.fn(),
  addGalleryImage: jest.fn(),
  getGalleryImage: jest.fn(),
  deleteGalleryImage: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const galleryRepository = require('../src/repositories/gallery.repository');
const app = require('../src/app');

// A small valid base64 PNG-ish payload, well under the 80KB gallery budget.
const SMALL_IMAGE = Buffer.alloc(1024).toString('base64');

describe('GET /api/merchants/:id/gallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the authenticated uid does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .get('/api/merchants/merchant-1/gallery')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(403);
    expect(galleryRepository.listGalleryImages).not.toHaveBeenCalled();
  });

  it('returns an empty list for a store with no gallery images yet', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    galleryRepository.listGalleryImages.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/gallery')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });
});

describe('POST /api/merchants/:id/gallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the authenticated uid does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .post('/api/merchants/merchant-1/gallery')
      .set('Authorization', 'Bearer faketoken')
      .send({ imageBase64: SMALL_IMAGE });

    expect(res.status).toBe(403);
    expect(galleryRepository.addGalleryImage).not.toHaveBeenCalled();
  });

  it('allows the owner to add a gallery image', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    galleryRepository.listGalleryImages.mockResolvedValue([]);
    galleryRepository.addGalleryImage.mockResolvedValue({
      id: 'img-1',
      imageBase64: SMALL_IMAGE,
      order: 0,
      createdAt: { toDate: () => new Date('2026-07-31T00:00:00.000Z') },
    });

    const res = await request(app)
      .post('/api/merchants/merchant-1/gallery')
      .set('Authorization', 'Bearer faketoken')
      .send({ imageBase64: SMALL_IMAGE });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('img-1');
    expect(galleryRepository.addGalleryImage).toHaveBeenCalledWith('merchant-1', { imageBase64: SMALL_IMAGE, order: 0 });
  });

  it('rejects a gallery image over the ~80KB decoded size budget', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    galleryRepository.listGalleryImages.mockResolvedValue([]);

    const oversized = Buffer.alloc(100 * 1024).toString('base64');

    const res = await request(app)
      .post('/api/merchants/merchant-1/gallery')
      .set('Authorization', 'Bearer faketoken')
      .send({ imageBase64: oversized });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(galleryRepository.addGalleryImage).not.toHaveBeenCalled();
  });

  it('rejects a missing imageBase64', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    galleryRepository.listGalleryImages.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/merchants/merchant-1/gallery')
      .set('Authorization', 'Bearer faketoken')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/merchants/:id/gallery/:imageId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns 403 when the authenticated uid does not own the merchant', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'someone-else' });

    const res = await request(app)
      .delete('/api/merchants/merchant-1/gallery/img-1')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(403);
    expect(galleryRepository.deleteGalleryImage).not.toHaveBeenCalled();
  });

  it('returns 404 for a gallery image that does not exist', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    galleryRepository.getGalleryImage.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/merchants/merchant-1/gallery/img-missing')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(404);
    expect(galleryRepository.deleteGalleryImage).not.toHaveBeenCalled();
  });

  it('allows the owner to delete an existing gallery image', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    galleryRepository.getGalleryImage.mockResolvedValue({ id: 'img-1', imageBase64: SMALL_IMAGE, order: 0 });

    const res = await request(app)
      .delete('/api/merchants/merchant-1/gallery/img-1')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(204);
    expect(galleryRepository.deleteGalleryImage).toHaveBeenCalledWith('merchant-1', 'img-1');
  });
});
