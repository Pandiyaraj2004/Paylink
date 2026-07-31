const request = require('supertest');

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
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
  findMerchantByUserId: jest.fn(),
}));

jest.mock('../src/repositories/product.repository', () => ({
  getProductById: jest.fn(),
  listProducts: jest.fn(),
  createProduct: jest.fn(),
  bulkCreateProducts: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const productRepository = require('../src/repositories/product.repository');
const app = require('../src/app');

/**
 * Config-driven currency validation on catalog items (env.SURFBOARD_ACTIVE_CURRENCIES,
 * backend/src/config/env.js — defaults to just ['SEK'], matching
 * backend/.env.local's live-verified current state: EUR/NOK both fail real
 * order creation with Surfboard error OR_0004). This is distinct from the
 * pre-existing ISO-4217-shape check (ISO_CURRENCY_RE in product.service.js)
 * — a well-formed 3-letter code can still be rejected here for not being
 * activated for this merchant account.
 */
describe('Catalog item currency restricted to env.SURFBOARD_ACTIVE_CURRENCIES', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
  });

  it('POST /:id/products rejects a well-formed but non-active currency (e.g. EUR) with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/merchants/merchant-1/products')
      .set('Authorization', 'Bearer faketoken')
      .send({ name: 'Croissant', price: 3, currency: 'EUR' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(productRepository.createProduct).not.toHaveBeenCalled();
  });

  it('POST /:id/products accepts the active currency (SEK)', async () => {
    productRepository.createProduct.mockResolvedValue({
      id: 'p1',
      name: 'Croissant',
      price: 30,
      currency: 'SEK',
      isCustomAllowed: false,
      imageBase64: null,
    });

    const res = await request(app)
      .post('/api/merchants/merchant-1/products')
      .set('Authorization', 'Bearer faketoken')
      .send({ name: 'Croissant', price: 30, currency: 'SEK' });

    expect(res.status).toBe(201);
    expect(productRepository.createProduct).toHaveBeenCalled();
  });

  it('PATCH /:id/products/:productId rejects switching an item to a non-active currency', async () => {
    productRepository.getProductById.mockResolvedValue({
      id: 'p1',
      name: 'Croissant',
      price: 30,
      currency: 'SEK',
      isCustomAllowed: false,
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1/products/p1')
      .set('Authorization', 'Bearer faketoken')
      .send({ currency: 'NOK' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(productRepository.updateProduct).not.toHaveBeenCalled();
  });

  it('bulk create (POST /:id/products with { items }) rejects any item with a non-active currency', async () => {
    const res = await request(app)
      .post('/api/merchants/merchant-1/products')
      .set('Authorization', 'Bearer faketoken')
      .send({ items: [{ name: 'Cake', price: 20, currency: 'SEK' }, { name: 'Bun', price: 5, currency: 'EUR' }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(productRepository.bulkCreateProducts).not.toHaveBeenCalled();
  });
});
