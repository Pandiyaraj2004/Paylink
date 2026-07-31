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

describe('GET /api/merchants/:id/transactions (master-doc.md Section 14.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    paymentRepository.listRefunds.mockResolvedValue([]);
  });

  it('rejects a non-owner with 403 FORBIDDEN', async () => {
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'someone-else' });
    orderRepository.getOrdersInRange.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/transactions')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(403);
  });

  it('emits a payment entry for a captured order with its Surfboard reference id', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      {
        id: 'order-1',
        status: 'paid',
        totalAmount: 50,
        currency: 'SEK',
        createdAt: now,
        payment: { surfboardOrderId: 'sb-order-1', surfboardPaymentId: 'sb-payment-1', method: 'card', status: 'captured' },
      },
    ]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/transactions')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      type: 'payment',
      orderId: 'order-1',
      surfboardReferenceId: 'sb-payment-1',
      status: 'captured',
      amount: 50,
      currency: 'SEK',
    });
  });

  it('emits both a payment entry and a refund entry for a partially refunded order', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      {
        id: 'order-1',
        status: 'partially_refunded',
        totalAmount: 100,
        currency: 'EUR',
        createdAt: now,
        payment: { surfboardOrderId: 'sb-order-1', surfboardPaymentId: 'sb-payment-1', method: 'card', status: 'captured' },
      },
    ]);
    paymentRepository.listRefunds.mockResolvedValue([
      { id: 'refund-1', amount: 40, status: 'completed', reason: 'Customer changed order', surfboardRefundId: 'sb-refund-1', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/transactions')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const types = res.body.items.map((e) => e.type).sort();
    expect(types).toEqual(['payment', 'refund']);
    const refundEntry = res.body.items.find((e) => e.type === 'refund');
    expect(refundEntry).toMatchObject({
      orderId: 'order-1',
      surfboardReferenceId: 'sb-refund-1',
      status: 'completed',
      amount: 40,
    });
  });

  it('never fetches refunds for a failed order (never captured, could not have one)', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      {
        id: 'order-1',
        status: 'failed',
        totalAmount: 20,
        currency: 'EUR',
        createdAt: now,
        payment: { surfboardOrderId: 'sb-order-1', surfboardPaymentId: null, method: 'card', status: 'failed' },
      },
    ]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/transactions')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(paymentRepository.listRefunds).not.toHaveBeenCalled();
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].type).toBe('payment');
  });

  it('excludes a pending order that never reached Surfboard at all', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      {
        id: 'order-1',
        status: 'pending',
        totalAmount: 20,
        currency: 'EUR',
        createdAt: now,
        payment: { surfboardOrderId: null, surfboardPaymentId: null, method: null, status: 'pending' },
      },
    ]);

    const res = await request(app)
      .get('/api/merchants/merchant-1/transactions')
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('rejects an invalid from/to date with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/merchants/merchant-1/transactions')
      .query({ from: 'not-a-date' })
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
