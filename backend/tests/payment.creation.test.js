const request = require('supertest');

jest.mock('../src/repositories/order.repository', () => ({
  resolveMerchantIdForOrder: jest.fn(),
  getOrderById: jest.fn(),
  updateOrder: jest.fn(),
  createOrder: jest.fn(),
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
  createPaymentIndex: jest.fn(),
  getPaymentIndex: jest.fn(),
  listRefunds: jest.fn(),
  updateRefund: jest.fn(),
  runWebhookTransaction: jest.fn(),
  createRefundIfWithinBalance: jest.fn(),
}));

// Never a real network call — surfboard.service.js (the real REST client) is
// mocked at payment.service.js's actual dependency surface. LIVE-VERIFIED
// against the real demo API: createOrder alone returns the Hosted Payment
// Page link (`paymentPageLink`) when controlFunctions.online is set —
// initiatePayment is NOT called for the checkout flow (only used by
// refund.service.js's CARD_NP refund flow).
jest.mock('../src/services/surfboard.service', () => ({
  createOrder: jest.fn(),
  initiatePayment: jest.fn(),
  getOrderStatus: jest.fn(),
  checkConnection: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  toNumericCurrency: jest.fn(),
  mapPaymentMethod: jest.fn(),
}));

const orderRepository = require('../src/repositories/order.repository');
const merchantRepository = require('../src/repositories/merchant.repository');
const paymentRepository = require('../src/repositories/payment.repository');
const surfboardService = require('../src/services/surfboard.service');
const SurfboardUnavailableError = require('../src/utils/SurfboardUnavailableError');
const app = require('../src/app');

const CURRENCY_NUMERIC_CODES = { EUR: '978', SEK: '752', NOK: '578' };
const PAYMENT_METHOD_MAP = { card: 'CARD', swish: 'SWISH' };

describe('POST /api/payments/create (master-doc.md Section 22.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    surfboardService.toNumericCurrency.mockImplementation((currency) => {
      const numeric = CURRENCY_NUMERIC_CODES[currency];
      if (!numeric) throw new Error(`No numeric ISO 4217 mapping configured for currency "${currency}".`);
      return numeric;
    });
    surfboardService.mapPaymentMethod.mockImplementation((method) => {
      const mapped = PAYMENT_METHOD_MAP[method];
      if (!mapped) {
        const err = new Error(`"${method}" has no supported Surfboard payment method mapping.`);
        err.unmappedMethod = true;
        throw err;
      }
      return mapped;
    });

    orderRepository.resolveMerchantIdForOrder.mockResolvedValue('merchant-1');
    merchantRepository.getMerchantById.mockResolvedValue({ id: 'merchant-1', pageSlug: 'my-store' });
  });

  it('happy path: creates a real Surfboard order and returns its Hosted Payment Page link', async () => {
    orderRepository.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      totalAmount: 20,
      currency: 'EUR',
      items: [{ productId: 'p1', name: 'Widget', price: 20, quantity: 1 }],
      tipAmount: 0,
    });
    surfboardService.createOrder.mockResolvedValue({
      orderId: 'sb-order-1',
      paymentPageLink: 'https://pay.withsurfboard.com/sb-order-1?pi=abc',
    });

    const res = await request(app)
      .post('/api/payments/create')
      .send({ orderId: 'order-1', method: 'card', paymentDetails: {} });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      paymentStatus: 'PAYMENT_INITIATED',
      surfboardPaymentId: null,
      paymentUrl: 'https://pay.withsurfboard.com/sb-order-1?pi=abc',
    });
    expect(surfboardService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'order-1', paymentMethod: 'CARD' })
    );
    // No separate Initiate Payment call for the checkout flow (see
    // surfboard.service.js/payment.service.js's live-verification notes).
    expect(surfboardService.initiatePayment).not.toHaveBeenCalled();
    expect(paymentRepository.createPaymentIndex).not.toHaveBeenCalled();
    expect(orderRepository.updateOrder).toHaveBeenCalledWith(
      'merchant-1',
      'order-1',
      expect.objectContaining({
        'payment.status': 'initiated',
        'payment.surfboardOrderId': 'sb-order-1',
      })
    );
  });

  it('maps a Surfboard-reported rejection to 402 PAYMENT_DECLINED and marks the order failed', async () => {
    orderRepository.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      totalAmount: 20,
      currency: 'EUR',
      items: [{ productId: 'p1', name: 'Widget', price: 20, quantity: 1 }],
      tipAmount: 0,
    });
    const rejection = new Error('Invalid request parameters.');
    rejection.transient = false;
    surfboardService.createOrder.mockRejectedValue(rejection);

    const res = await request(app).post('/api/payments/create').send({ orderId: 'order-1', method: 'card' });

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_DECLINED');
    expect(orderRepository.updateOrder).toHaveBeenCalledWith(
      'merchant-1',
      'order-1',
      expect.objectContaining({ status: 'failed', 'payment.status': 'failed' })
    );
  });

  it('maps an unconfigured Surfboard (SurfboardUnavailableError) to 503 PROVIDER_UNAVAILABLE', async () => {
    orderRepository.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      totalAmount: 20,
      currency: 'EUR',
      items: [{ productId: 'p1', name: 'Widget', price: 20, quantity: 1 }],
      tipAmount: 0,
    });
    surfboardService.createOrder.mockRejectedValue(new SurfboardUnavailableError('not configured'));

    const res = await request(app).post('/api/payments/create').send({ orderId: 'order-1', method: 'card' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('rejects a retry against an order that is no longer pending (Section 25.8)', async () => {
    orderRepository.getOrderById.mockResolvedValue({ id: 'order-1', status: 'paid', totalAmount: 20, currency: 'EUR' });

    const res = await request(app).post('/api/payments/create').send({ orderId: 'order-1', method: 'card' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(surfboardService.createOrder).not.toHaveBeenCalled();
  });

  it('rejects an unmapped payment method (e.g. wallet) with 400 before calling Surfboard', async () => {
    orderRepository.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      totalAmount: 20,
      currency: 'EUR',
      items: [],
      tipAmount: 0,
    });

    const res = await request(app).post('/api/payments/create').send({ orderId: 'order-1', method: 'wallet' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(surfboardService.createOrder).not.toHaveBeenCalled();
  });

  // Distinct from the 'wallet' case above: 'swish' IS a method Surfboard's
  // API understands in general (surfboardService.mapPaymentMethod would
  // happily map it to 'SWISH') but isn't activated for this merchant account
  // right now (env.SURFBOARD_ACTIVE_PAYMENT_METHODS defaults to just
  // ['card'], per backend/.env.local's live-verified current state) — this
  // must be rejected before ever reaching mapPaymentMethod/Surfboard.
  it('rejects an activated-in-general-but-not-activated-for-this-account method (e.g. swish) with 400 before calling Surfboard', async () => {
    orderRepository.getOrderById.mockResolvedValue({
      id: 'order-1',
      status: 'pending',
      totalAmount: 20,
      currency: 'EUR',
      items: [],
      tipAmount: 0,
    });

    const res = await request(app).post('/api/payments/create').send({ orderId: 'order-1', method: 'swish' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(surfboardService.mapPaymentMethod).not.toHaveBeenCalled();
    expect(surfboardService.createOrder).not.toHaveBeenCalled();
  });
});
