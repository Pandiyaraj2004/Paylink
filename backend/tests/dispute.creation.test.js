const request = require('supertest');

jest.mock('../src/repositories/order.repository', () => ({
  createOrder: jest.fn(),
  resolveMerchantIdForOrder: jest.fn(),
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
  getMerchantBySlug: jest.fn(),
  reservePageSlug: jest.fn(),
}));

jest.mock('../src/repositories/dispute.repository', () => ({
  createDispute: jest.fn(),
}));

const orderRepository = require('../src/repositories/order.repository');
const merchantRepository = require('../src/repositories/merchant.repository');
const disputeRepository = require('../src/repositories/dispute.repository');
const app = require('../src/app');

describe('POST /api/disputes (master-doc.md Section 15.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a missing message with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/disputes').send({ name: 'Alex' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(disputeRepository.createDispute).not.toHaveBeenCalled();
  });

  it('rejects a message beyond the length cap with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .send({ message: 'a'.repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(disputeRepository.createDispute).not.toHaveBeenCalled();
  });

  it('rejects a malformed email with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/disputes')
      .send({ message: 'I was charged twice', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(disputeRepository.createDispute).not.toHaveBeenCalled();
  });

  it('rejects an orderId that does not resolve to a real order with 404 ORDER_NOT_FOUND', async () => {
    orderRepository.resolveMerchantIdForOrder.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/disputes')
      .send({ orderId: 'bogus-order', message: 'I was charged incorrectly' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    expect(disputeRepository.createDispute).not.toHaveBeenCalled();
  });

  it('rejects a merchantId (with no orderId) that does not resolve to a real merchant with 404 MERCHANT_NOT_FOUND', async () => {
    merchantRepository.getMerchantById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/disputes')
      .send({ merchantId: 'bogus-merchant', message: 'I was charged incorrectly' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MERCHANT_NOT_FOUND');
    expect(disputeRepository.createDispute).not.toHaveBeenCalled();
  });

  it('creates a dispute with no orderId/merchantId at all (informational complaint)', async () => {
    disputeRepository.createDispute.mockImplementation(async (data) => ({ id: 'dispute-1', ...data }));

    const res = await request(app)
      .post('/api/disputes')
      .send({ name: 'Alex', email: 'alex@example.com', message: 'Is my payment secure?' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ disputeId: 'dispute-1', status: 'open' });
    expect(disputeRepository.createDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: null,
        orderId: null,
        status: 'open',
        resolutionNotes: null,
        resolvedAt: null,
        contactName: 'Alex',
        contactEmail: 'alex@example.com',
        message: 'Is my payment secure?',
      })
    );
  });

  it('derives merchantId from a valid orderId, overriding any client-supplied merchantId', async () => {
    orderRepository.resolveMerchantIdForOrder.mockResolvedValue('merchant-from-order');
    disputeRepository.createDispute.mockImplementation(async (data) => ({ id: 'dispute-2', ...data }));

    const res = await request(app)
      .post('/api/disputes')
      .send({ orderId: 'order-1', merchantId: 'ignored-merchant', message: 'I was charged incorrectly' });

    expect(res.status).toBe(201);
    expect(merchantRepository.getMerchantById).not.toHaveBeenCalled();
    expect(disputeRepository.createDispute).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: 'merchant-from-order', orderId: 'order-1' })
    );
  });
});
