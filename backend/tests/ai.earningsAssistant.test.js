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

// Regression coverage for the bug this file now exists to prevent: an
// earlier keyword-based classifier used unbounded substring matching (e.g.
// "stat" matched inside the word "state"), which could misroute a profile
// question into an empty earnings lookup and return a canned "no orders"
// message instead of actually answering it — and even when NOT misrouted,
// the old implementation never fetched merchant profile data at all, so a
// profile question had nothing real to be answered from either way. The
// fix removed keyword routing entirely: every question now gets the SAME
// full context (profile snapshot + earnings snapshot), so there's nothing
// left to misroute.
jest.mock('../src/repositories/product.repository', () => ({
  listProducts: jest.fn(),
}));

// config/env.js is a singleton computed once at require-time from real
// .env/.env.local — deleting process.env.* in beforeEach has no effect on
// its already-cached values. Mock the module directly so the AI genuinely
// stays unavailable here (Anthropic was removed entirely — OpenRouter and
// Gemini are the only two providers left to blank out), matching this
// file's original intent: these tests assert on `retrievedData` (the
// deterministically-computed figures), never on AI-generated prose, so they
// hold regardless of any AI provider being configured.
jest.mock('../src/config/env', () => ({
  ...jest.requireActual('../src/config/env'),
  OPENROUTER_API_KEY: '',
  GEMINI_API_KEY: '',
}));

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const orderRepository = require('../src/repositories/order.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const productRepository = require('../src/repositories/product.repository');
const app = require('../src/app');

describe('POST /api/ai/earnings-assistant — deterministic figures, AI only phrases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'owner-1', email: 'owner@example.com' });
    merchantRepository.findMerchantByUserId.mockResolvedValue({
      id: 'merchant-1',
      businessName: 'Test Shop',
      category: 'Bakery',
      status: 'active',
    });
    paymentRepository.listRefunds.mockResolvedValue([]);
    productRepository.listProducts.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    orderRepository.getOrdersInRange.mockResolvedValue([]);
  });

  it('degrades to a clean unavailable message when no AI provider is configured, without crashing', async () => {
    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: "What were today's earnings?" });

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.answer).toMatch(/temporarily unavailable/i);
  });

  it('always includes a real profile snapshot in retrievedData, regardless of question wording', async () => {
    // The exact bug report this guards against: a profile-flavored question
    // that happens to contain a false-positive keyword substring under the
    // old (now-removed) classifier must still get real profile data.
    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: 'what is the current state of that profile' });

    expect(res.status).toBe(200);
    expect(res.body.retrievedData.profile).toMatchObject({
      businessName: 'Test Shop',
      category: 'Bakery',
      productCount: 2,
    });
  });

  it('counts only paid/refunded orders toward earnings, net of a completed refund', async () => {
    const now = new Date();
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', totalAmount: 100, currency: 'SEK', status: 'paid', items: [], createdAt: now },
      { id: 'o2', totalAmount: 50, currency: 'SEK', status: 'pending', items: [], createdAt: now },
      { id: 'o3', totalAmount: 40, currency: 'SEK', status: 'partially_refunded', items: [], createdAt: now },
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
    // pending order's 50 must never be counted. All three orders fall in
    // "this month" (created "now"), so thisMonth carries the full total.
    expect(res.body.retrievedData.earnings.thisMonth.total).toBe(125);
    expect(res.body.retrievedData.earnings.thisMonth.orderCount).toBe(3);
  });

  it('identifies the real best-selling product by quantity, ignoring custom-amount lines', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', status: 'paid', items: [{ productId: 'p1', name: 'Cinnamon Bun', quantity: 3 }], createdAt: new Date() },
      { id: 'o2', status: 'paid', items: [{ productId: 'p2', name: 'Sourdough', quantity: 1 }], createdAt: new Date() },
      { id: 'o3', status: 'cancelled', items: [{ productId: 'p1', name: 'Cinnamon Bun', quantity: 10 }], createdAt: new Date() },
      { id: 'o4', status: 'paid', items: [{ productId: null, name: 'Custom amount', quantity: 1 }], createdAt: new Date() },
    ]);

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: 'What is my best seller?' });

    expect(res.status).toBe(200);
    // The cancelled order's quantity 10 must not count — only o1's 3 does.
    expect(res.body.retrievedData.earnings.topProduct).toEqual({ name: 'Cinnamon Bun', quantitySold: 3, orderCount: 1 });
  });

  it('counts a customer with 2+ paid orders as a repeat customer', async () => {
    orderRepository.getOrdersInRange.mockResolvedValue([
      { id: 'o1', status: 'paid', customerPhone: '+46700000001', items: [], createdAt: new Date() },
      { id: 'o2', status: 'paid', customerPhone: '+46700000001', items: [], createdAt: new Date() },
      { id: 'o3', status: 'paid', customerPhone: '+46700000002', items: [], createdAt: new Date() },
      { id: 'o4', status: 'cancelled', customerPhone: '+46700000003', items: [], createdAt: new Date() },
    ]);

    const res = await request(app)
      .post('/api/ai/earnings-assistant')
      .set('Authorization', 'Bearer faketoken')
      .send({ question: 'Do I have repeat customers?' });

    expect(res.status).toBe(200);
    expect(res.body.retrievedData.earnings.repeatCustomerCount).toBe(1);
    expect(res.body.retrievedData.earnings.uniqueCustomerCount).toBe(2);
  });
});
