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

jest.mock('../src/repositories/order.repository', () => ({
  getOrdersInRange: jest.fn(),
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

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const orderRepository = require('../src/repositories/order.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const app = require('../src/app');

describe('GET /api/merchants/:id/summary — revenue must be paid-only, net of refunds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    paymentRepository.listRefunds.mockResolvedValue([]);
  });

  it('excludes a pending (unpaid) order from revenue but still counts it as an order', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'pending', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/summary')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.month.total).toBe(0);
    expect(res.body.month.orderCount).toBe(1);
  });

  it('counts a paid order in full when it has no refunds', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'paid', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/summary')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.month.total).toBe(100);
    expect(res.body.currency).toBe('SEK');
  });

  it('subtracts a completed refund from a paid order (net revenue)', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'partially_refunded', createdAt: now },
    ]);
    paymentRepository.listRefunds.mockImplementation(async (merchantId, orderId) =>
      orderId === 'o1' ? [{ id: 'r1', amount: 40, status: 'completed' }] : []
    );

    const res = await request(app)
      .get('/api/merchants/merchant-1/summary')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.month.total).toBe(60);
  });

  it('a pending refund also reduces net revenue, same as a completed one', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'paid', createdAt: now },
    ]);
    paymentRepository.listRefunds.mockResolvedValue([{ id: 'r1', amount: 100, status: 'pending' }]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/summary')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.month.total).toBe(0);
  });

  it('never fetches refunds for an order that could not possibly have one', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'cancelled', createdAt: now },
    ]);

    await request(app).get('/api/merchants/merchant-1/summary').set('Authorization', 'Bearer faketoken');

    expect(paymentRepository.listRefunds).not.toHaveBeenCalled();
  });
});
