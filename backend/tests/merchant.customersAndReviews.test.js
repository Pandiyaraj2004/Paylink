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
  getMerchantBySlug: jest.fn(),
  reservePageSlug: jest.fn(),
}));

jest.mock('../src/repositories/order.repository', () => ({
  getOrdersInRange: jest.fn(),
  getAllOrders: jest.fn(),
  getOrderCountForMerchant: jest.fn(),
  createOrder: jest.fn(),
  resolveMerchantIdForOrder: jest.fn(),
  getOrderById: jest.fn(),
  updateOrder: jest.fn(),
  listOrders: jest.fn(),
}));

jest.mock('../src/repositories/payment.repository', () => ({
  listRefunds: jest.fn(),
  createRefundIfWithinBalance: jest.fn(),
  updateRefund: jest.fn(),
  createPaymentIndex: jest.fn(),
  getPaymentIndex: jest.fn(),
  runWebhookTransaction: jest.fn(),
}));

jest.mock('../src/repositories/product.repository', () => ({
  listProducts: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const orderRepository = require('../src/repositories/order.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const app = require('../src/app');

describe('GET /api/merchants/:id/customers — repeat customers only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    paymentRepository.listRefunds.mockResolvedValue([]);
  });

  it('surfaces a customer with 2+ paid orders, with correct order count and total spent', async () => {
    orderRepository.getAllOrders.mockResolvedValue([
      { id: 'o1', customerRef: 'ref-a', customerName: 'Alice', customerPhone: '+46700000001', totalAmount: 100, status: 'paid', createdAt: new Date('2026-01-01') },
      { id: 'o2', customerRef: 'ref-a', customerName: 'Alice', customerPhone: '+46700000001', totalAmount: 50, status: 'paid', createdAt: new Date('2026-01-05') },
    ]);

    const res = await request(app).get('/api/merchants/merchant-1/customers').set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      customerRef: 'ref-a',
      name: 'Alice',
      phone: '+46700000001',
      orderCount: 2,
      totalSpent: 150,
    });
  });

  it('does not surface a customer with only a single order', async () => {
    orderRepository.getAllOrders.mockResolvedValue([
      { id: 'o1', customerRef: 'ref-b', customerName: 'Bob', customerPhone: '+46700000002', totalAmount: 100, status: 'paid', createdAt: new Date() },
    ]);

    const res = await request(app).get('/api/merchants/merchant-1/customers').set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('excludes cancelled/failed orders from both the order count and total spent', async () => {
    orderRepository.getAllOrders.mockResolvedValue([
      { id: 'o1', customerRef: 'ref-c', customerName: 'Cara', customerPhone: '+46700000003', totalAmount: 100, status: 'paid', createdAt: new Date('2026-01-01') },
      { id: 'o2', customerRef: 'ref-c', customerName: 'Cara', customerPhone: '+46700000003', totalAmount: 999, status: 'cancelled', createdAt: new Date('2026-01-02') },
      { id: 'o3', customerRef: 'ref-c', customerName: 'Cara', customerPhone: '+46700000003', totalAmount: 30, status: 'paid', createdAt: new Date('2026-01-03') },
    ]);

    const res = await request(app).get('/api/merchants/merchant-1/customers').set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ orderCount: 2, totalSpent: 130 });
  });

  it('subtracts a completed refund from a customer\'s total spent (net revenue, same definition as Dashboard)', async () => {
    orderRepository.getAllOrders.mockResolvedValue([
      { id: 'o1', customerRef: 'ref-d', customerName: 'Dana', customerPhone: '+46700000004', totalAmount: 100, status: 'partially_refunded', createdAt: new Date('2026-01-01') },
      { id: 'o2', customerRef: 'ref-d', customerName: 'Dana', customerPhone: '+46700000004', totalAmount: 50, status: 'paid', createdAt: new Date('2026-01-02') },
    ]);
    paymentRepository.listRefunds.mockImplementation(async (merchantId, orderId) =>
      orderId === 'o1' ? [{ id: 'r1', amount: 40, status: 'completed' }] : []
    );

    const res = await request(app).get('/api/merchants/merchant-1/customers').set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items[0].totalSpent).toBe(110);
  });
});

describe('GET /api/merchants/:id/reviews — read-only ratings list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
  });

  it('returns the merchant\'s cached rating aggregate plus every order that has a rating', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'owner-1',
      ratingAverage: 4.5,
      ratingCount: 2,
    });
    orderRepository.getAllOrders.mockResolvedValue([
      { id: 'o1', customerName: 'Alice', rating: { stars: 5, comment: 'Great!', createdAt: '2026-01-02T00:00:00.000Z' } },
      { id: 'o2', customerName: 'Bob', rating: { stars: 4, comment: null, createdAt: '2026-01-01T00:00:00.000Z' } },
      { id: 'o3', customerName: 'Cara', rating: null },
    ]);

    const res = await request(app).get('/api/merchants/merchant-1/reviews').set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.ratingAverage).toBe(4.5);
    expect(res.body.ratingCount).toBe(2);
    expect(res.body.reviews).toHaveLength(2);
    // Newest first.
    expect(res.body.reviews[0]).toMatchObject({ orderId: 'o1', stars: 5, comment: 'Great!', customerName: 'Alice' });
    expect(res.body.reviews[1]).toMatchObject({ orderId: 'o2', stars: 4, comment: null });
  });

  it('defaults to a zero rating summary and an empty list for a merchant with no reviews yet', async () => {
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    orderRepository.getAllOrders.mockResolvedValue([{ id: 'o1', rating: null }]);

    const res = await request(app).get('/api/merchants/merchant-1/reviews').set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ratingAverage: 0, ratingCount: 0, reviews: [] });
  });
});

describe('POST /api/orders/:id/rating — incremental ratingAverage/ratingCount aggregate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orderRepository.resolveMerchantIdForOrder.mockResolvedValue('merchant-1');
  });

  it('recomputes the merchant\'s ratingAverage/ratingCount incrementally after a rating is submitted', async () => {
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', rating: null });
    orderRepository.updateOrder.mockResolvedValue({ id: 'order-1', rating: { stars: 5, comment: null } });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', ratingAverage: 4, ratingCount: 1 });

    const res = await request(app).post('/api/orders/order-1/rating').send({ stars: 5 });

    expect(res.status).toBe(200);
    // (4*1 + 5) / 2 = 4.5
    expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('merchant-1', { ratingAverage: 4.5, ratingCount: 2 });
  });

  it('starts the aggregate at the submitted rating for a merchant with no ratings yet', async () => {
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', rating: null });
    orderRepository.updateOrder.mockResolvedValue({ id: 'order-1', rating: { stars: 3, comment: null } });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1' });

    const res = await request(app).post('/api/orders/order-1/rating').send({ stars: 3 });

    expect(res.status).toBe(200);
    expect(merchantRepository.updateMerchant).toHaveBeenCalledWith('merchant-1', { ratingAverage: 3, ratingCount: 1 });
  });

  it('still returns the rating successfully even if the merchant aggregate update fails (best-effort, non-fatal)', async () => {
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', rating: null });
    orderRepository.updateOrder.mockResolvedValue({ id: 'order-1', rating: { stars: 5, comment: null } });
    merchantRepository.getMerchantById.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/api/orders/order-1/rating').send({ stars: 5 });

    expect(res.status).toBe(200);
    expect(res.body.rating.stars).toBe(5);

    console.error.mockRestore();
  });

  it('rejects a second rating on the same order with 409, and never touches the aggregate', async () => {
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', rating: { stars: 5, comment: null, createdAt: '2026-01-01T00:00:00.000Z' } });

    const res = await request(app).post('/api/orders/order-1/rating').send({ stars: 1 });

    expect(res.status).toBe(409);
    expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
  });
});
