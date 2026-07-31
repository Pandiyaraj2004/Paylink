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
  findMerchantByUserId: jest.fn(),
  getMerchantById: jest.fn(),
  updateMerchant: jest.fn(),
  createMerchant: jest.fn(),
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

// config/env.js is a singleton computed once at require-time from real
// .env/.env.local — deleting process.env.* in beforeEach has no effect on
// its already-cached values (Phase 9: this now includes real
// OPENROUTER_API_KEY/GEMINI_API_KEY, not just ANTHROPIC_API_KEY). Mock the
// module directly so the AI genuinely stays unavailable here, matching this
// file's original intent (see comment below).
jest.mock('../src/config/env', () => ({
  ...jest.requireActual('../src/config/env'),
  OPENROUTER_API_KEY: '',
  GEMINI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const orderRepository = require('../src/repositories/order.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const app = require('../src/app');

/**
 * master-doc.md Section 10.2/26.2's core guardrail: the backend must
 * retrieve/compute every figure deterministically BEFORE the AI ever sees
 * the question — these tests assert on `retrievedData` (and on which of the
 * two distinct "no real answer" messages comes back), never on AI-generated
 * prose, so they hold regardless of any AI provider being configured.
 */
describe('POST /api/ai/earnings-assistant — deterministic figures, AI only phrases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.findMerchantByUserId.mockResolvedValue({ id: 'merchant-1', businessName: 'Test Shop' });
    paymentRepository.listRefunds.mockResolvedValue([]);
  });

  it('says so plainly when there is no data at all, rather than guessing', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: "What were today's earnings?" });

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.answer).toMatch(/no orders recorded/i);
    expect(res.body.retrievedData.orderCount).toBe(0);
  });

  it('counts only paid/refunded orders toward earnings, net of a completed refund', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'paid', items: [] },
      { id: 'o2', totalAmount: 50, currency: 'SEK', status: 'pending', items: [] },
      { id: 'o3', totalAmount: 40, currency: 'SEK', status: 'partially_refunded', items: [] },
    ]);
    paymentRepository.listRefunds.mockImplementation(async (merchantId, orderId) =>
      orderId === 'o3' ? [{ id: 'r1', amount: 15, status: 'completed' }] : []
    );

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: "What were this month's earnings?" });

    expect(res.status).toBe(200);
    // 100 (paid, no refund) + (40 - 15) (partially refunded) = 125; the
    // pending order's 50 must never be counted.
    expect(res.body.retrievedData.totalEarnings).toBe(125);
    expect(res.body.retrievedData.orderCount).toBe(3);
    expect(res.body.retrievedData.paidOrderCount).toBe(2);
  });

  it('identifies the real best-selling product by quantity, ignoring custom-amount lines', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', status: 'paid', items: [{ productId: 'p1', name: 'Cinnamon Bun', quantity: 3 }] },
      { id: 'o2', status: 'paid', items: [{ productId: 'p2', name: 'Sourdough', quantity: 1 }] },
      { id: 'o3', status: 'cancelled', items: [{ productId: 'p1', name: 'Cinnamon Bun', quantity: 10 }] },
      { id: 'o4', status: 'paid', items: [{ productId: null, name: 'Custom amount', quantity: 1 }] },
    ]);

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: 'What is my best seller?' });

    expect(res.status).toBe(200);
    // The cancelled order's quantity 10 must not count — only o1's 3 does.
    expect(res.body.retrievedData.topProduct).toEqual({ name: 'Cinnamon Bun', quantitySold: 3, orderCount: 1 });
  });

  it('counts a customer with 2+ paid orders as a repeat customer', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', status: 'paid', customerPhone: '+46700000001', items: [] },
      { id: 'o2', status: 'paid', customerPhone: '+46700000001', items: [] },
      { id: 'o3', status: 'paid', customerPhone: '+46700000002', items: [] },
      { id: 'o4', status: 'cancelled', customerPhone: '+46700000003', items: [] },
    ]);

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: 'Do I have repeat customers?' });

    expect(res.status).toBe(200);
    expect(res.body.retrievedData.repeatCustomerCount).toBe(1);
    expect(res.body.retrievedData.uniqueCustomerCount).toBe(2);
  });

  it('degrades to a distinct "AI unavailable" message when real data exists but the AI cannot phrase it', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'paid', items: [] },
    ]);

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: "What were today's earnings?" });

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.answer).toMatch(/AI assistant is temporarily unavailable/i);
    expect(res.body.retrievedData.totalEarnings).toBe(100);
  });
});
