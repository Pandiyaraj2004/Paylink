const request = require('supertest');

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

jest.mock('../src/repositories/order.repository', () => ({
  createOrder: jest.fn(),
  resolveMerchantIdForOrder: jest.fn(),
  getOrderById: jest.fn(),
  updateOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrdersInRange: jest.fn(),
  getOrderCountForMerchant: jest.fn(),
}));

// Phase 11 addition (Section 16.6 Settings `maintenanceMode`): createOrder
// now reads the platform settings doc once per checkout. Mocked here so
// this suite never touches real Firestore — defaults every test to
// maintenance OFF, matching pre-Phase-11 behavior exactly; the dedicated
// "maintenance mode" test below overrides it per-case.
jest.mock('../src/repositories/admin.repository', () => ({
  getPlatformSettings: jest.fn().mockResolvedValue({ maintenanceMode: false }),
}));

const merchantRepository = require('../src/repositories/merchant.repository');
const productRepository = require('../src/repositories/product.repository');
const orderRepository = require('../src/repositories/order.repository');
const adminRepository = require('../src/repositories/admin.repository');
const app = require('../src/app');

describe('POST /api/orders — validation (master-doc.md Section 22.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adminRepository.getPlatformSettings.mockResolvedValue({ maintenanceMode: false });
  });

  it('rejects checkout when the store is closed', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'closed' });

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'p1', quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  // Deviation 1's core safeguard, verified end-to-end: Admin's Suspend
  // Merchant action (admin.service.js's suspendMerchant) writes status:
  // 'suspended' onto the merchant document, and nothing else — this test
  // confirms that alone is genuinely sufficient to block checkout through
  // the EXISTING isMerchantOpen check, with no second/redundant enforcement
  // mechanism needed anywhere in this file.
  it('rejects checkout when the merchant has been suspended by an admin', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'suspended' });

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'p1', quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  // Section 16.6 Settings `maintenanceMode` — the platform-wide kill-switch
  // alongside per-merchant suspend.
  it('rejects checkout platform-wide when maintenanceMode is enabled', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });
    adminRepository.getPlatformSettings.mockResolvedValue({ maintenanceMode: true });

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'p1', quantity: 1 }] });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  it('rejects when both items and customAmount are provided', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'open' });

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'p1', quantity: 1 }], customAmount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  it('rejects when neither items nor customAmount are provided', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'active' });

    const res = await request(app).post('/api/orders').send({ merchantId: 'm1', note: 'hi' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  it('rejects an unknown productId with 404 PRODUCT_NOT_FOUND', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'open' });
    productRepository.getProductById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'missing', quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('creates a pending order from a valid catalog item, including tip in totalAmount', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'open' });
    productRepository.getProductById.mockResolvedValue({ id: 'p1', name: 'Shirt stitching', price: 15, currency: 'SEK' });
    orderRepository.createOrder.mockImplementation(async (merchantId, data) => ({ id: 'order-1', ...data }));

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'p1', quantity: 2 }], tip: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ orderId: 'order-1', totalAmount: 31, currency: 'SEK' });

    expect(orderRepository.createOrder).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ status: 'pending', tipAmount: 1, fulfilmentStatus: 'unfulfilled' })
    );
  });

  it('rejects checkout for a legacy product whose currency is no longer supported', async () => {
    // Regression test: a product saved before SURFBOARD_ACTIVE_CURRENCIES
    // existed/narrowed (e.g. EUR, when only SEK is currently active) must
    // be rejected clearly here — not allowed through to a confusing,
    // generic "payment declined" once it reaches Surfboard.
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'open' });
    productRepository.getProductById.mockResolvedValue({ id: 'p1', name: 'Legacy item', price: 15, currency: 'EUR' });

    const res = await request(app)
      .post('/api/orders')
      .send({ merchantId: 'm1', items: [{ productId: 'p1', quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(orderRepository.createOrder).not.toHaveBeenCalled();
  });

  it('creates a pending order from a valid customAmount', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'm1', status: 'open' });
    productRepository.listProducts.mockResolvedValue([{ id: 'p1', currency: 'SEK' }]);
    orderRepository.createOrder.mockImplementation(async (merchantId, data) => ({ id: 'order-2', ...data }));

    const res = await request(app).post('/api/orders').send({ merchantId: 'm1', customAmount: 42 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ orderId: 'order-2', totalAmount: 42, currency: 'SEK' });
  });
});
