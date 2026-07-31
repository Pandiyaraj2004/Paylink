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

jest.mock('../src/repositories/order.repository', () => ({
  resolveMerchantIdForOrder: jest.fn(),
  createOrder: jest.fn(),
  getOrderById: jest.fn(),
  updateOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrdersInRange: jest.fn(),
  getOrderCountForMerchant: jest.fn(),
}));

jest.mock('../src/repositories/merchant.repository', () => ({
  getMerchantById: jest.fn(),
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
  findMerchantByUserId: jest.fn(),
}));

jest.mock('../src/repositories/payment.repository', () => ({
  createRefundIfWithinBalance: jest.fn(),
  updateRefund: jest.fn(),
  createPaymentIndex: jest.fn(),
  getPaymentIndex: jest.fn(),
  listRefunds: jest.fn(),
  runWebhookTransaction: jest.fn(),
}));

jest.mock('../src/services/surfboard.service', () => ({
  createOrder: jest.fn(),
  initiatePayment: jest.fn(),
  getOrderStatus: jest.fn(),
  checkConnection: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  toNumericCurrency: jest.fn(),
  mapPaymentMethod: jest.fn(),
}));

const firebaseConfig = require('../src/config/firebase');
const orderRepository = require('../src/repositories/order.repository');
const merchantRepository = require('../src/repositories/merchant.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const app = require('../src/app');

describe('POST /api/payments/:id/refund (master-doc.md Section 22.6, 19.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    orderRepository.resolveMerchantIdForOrder.mockResolvedValue('merchant-1');
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', userId: 'owner-1' });
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', status: 'paid', totalAmount: 20 });
  });

  it('rejects a refund on an order that was never paid with 400 VALIDATION_ERROR', async () => {
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', status: 'pending', totalAmount: 20 });

    const res = await request(app)
      .post('/api/payments/order-1/refund')
      .set('Authorization', 'Bearer faketoken')
      .send({ amount: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(paymentRepository.createRefundIfWithinBalance).not.toHaveBeenCalled();
  });

  it('rejects a non-owner with 403 FORBIDDEN before the balance transaction ever runs', async () => {
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'someone-else' });

    const res = await request(app)
      .post('/api/payments/order-1/refund')
      .set('Authorization', 'Bearer faketoken')
      .send({ amount: 5 });

    expect(res.status).toBe(403);
    expect(paymentRepository.createRefundIfWithinBalance).not.toHaveBeenCalled();
  });

  it('rejects a refund that exceeds the remaining refundable balance with 400 VALIDATION_ERROR', async () => {
    paymentRepository.createRefundIfWithinBalance.mockResolvedValue({
      exceeded: true,
      remaining: 5,
      order: { id: 'order-1', totalAmount: 20 },
    });

    const res = await request(app)
      .post('/api/payments/order-1/refund')
      .set('Authorization', 'Bearer faketoken')
      .send({ amount: 15, reason: 'too much' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('surfaces 409 CONFLICT after repeated Firestore transaction contention (Section 29.4)', async () => {
    const contentionErr = new Error('ABORTED: transaction contention');
    contentionErr.code = 10;
    paymentRepository.createRefundIfWithinBalance.mockRejectedValue(contentionErr);

    const res = await request(app)
      .post('/api/payments/order-1/refund')
      .set('Authorization', 'Bearer faketoken')
      .send({ amount: 5 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    // Bounded retries, not infinite — 3 attempts per refund.service.js.
    expect(paymentRepository.createRefundIfWithinBalance).toHaveBeenCalledTimes(3);
  });
});
