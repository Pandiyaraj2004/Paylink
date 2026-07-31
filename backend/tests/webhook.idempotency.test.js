jest.mock('../src/repositories/payment.repository', () => ({
  createPaymentIndex: jest.fn(),
  getPaymentIndex: jest.fn(),
  listRefunds: jest.fn(),
  updateRefund: jest.fn(),
  runWebhookTransaction: jest.fn(),
  createRefundIfWithinBalance: jest.fn(),
}));

jest.mock('../src/services/notification.service', () => ({
  notify: jest.fn(),
}));

const paymentRepository = require('../src/repositories/payment.repository');
const notificationService = require('../src/services/notification.service');
const paymentService = require('../src/services/payment.service');

/**
 * Tests master-doc.md Section 25.9's idempotency guarantee against the real
 * Surfboard webhook shape: `{ eventType, metadata: { eventId }, data: {
 * referenceId, ... } }` (webhooks-md/orders-order-payment-completed.md).
 * `runWebhookTransaction` is faked here with a minimal in-memory stand-in
 * for the real Firestore transaction (tracking which eventIds have already
 * been "committed"), so this exercises the actual payment.service.js logic
 * that decides what to do with the transaction's result and whether to
 * notify — not just the fake itself.
 */
describe('processSurfboardWebhookEvent — idempotency (Section 25.9)', () => {
  let processedEventIds;
  let applyCallCount;
  let lastTx;

  beforeEach(() => {
    jest.clearAllMocks();
    processedEventIds = new Set();
    applyCallCount = 0;
    lastTx = null;

    paymentRepository.runWebhookTransaction.mockImplementation(async (eventId, orderId, applyFn) => {
      if (processedEventIds.has(eventId)) {
        return { duplicate: true };
      }
      processedEventIds.add(eventId);
      applyCallCount += 1;

      const tx = { update: jest.fn(), set: jest.fn() };
      lastTx = tx;
      await applyFn({
        tx,
        order: { id: orderId, totalAmount: 20, receipt: null },
        orderRef: {},
        refunds: [],
        refundsCollectionRef: { doc: jest.fn() },
        merchantId: 'merchant-1',
        orderId,
        serverTimestampValue: 'SERVER_TIMESTAMP',
      });

      return { duplicate: false, merchantId: 'merchant-1', orderId };
    });

    notificationService.notify.mockResolvedValue({ id: 'n1' });
  });

  it('applies an order.paymentcompleted event exactly once across two identical deliveries', async () => {
    const payload = {
      eventType: 'order.paymentcompleted',
      metadata: { eventId: 'evt-1' },
      data: { orderId: 'sb-order-1', referenceId: 'order-1', paymentId: 'sp-1', paymentStatus: 'PAYMENT_COMPLETED' },
    };

    const first = await paymentService.processSurfboardWebhookEvent(payload);
    const second = await paymentService.processSurfboardWebhookEvent(payload);

    expect(first).toEqual({ processed: true });
    expect(second).toEqual({ processed: false, reason: 'duplicate' });
    expect(applyCallCount).toBe(1);
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment_success', orderId: 'order-1' })
    );
    expect(paymentRepository.runWebhookTransaction).toHaveBeenCalledWith('evt-1', 'order-1', expect.any(Function));
    // No paymentId is known at order/payment-creation time (see
    // payment.service.js's createPayment) — the webhook is the first place
    // Surfboard's real paymentId is learned, so it gets synced here too.
    expect(lastTx.update).toHaveBeenCalledWith({}, expect.objectContaining({ 'payment.surfboardPaymentId': 'sp-1' }));
  });

  it('rejects an unrecognized event type before ever touching the transaction', async () => {
    await expect(
      paymentService.processSurfboardWebhookEvent({
        eventType: 'not.a.real.type',
        metadata: { eventId: 'evt-2' },
        data: { referenceId: 'order-1' },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(paymentRepository.runWebhookTransaction).not.toHaveBeenCalled();
  });

  it('rejects a payload missing metadata.eventId before touching the transaction', async () => {
    await expect(
      paymentService.processSurfboardWebhookEvent({
        eventType: 'order.paymentcompleted',
        metadata: {},
        data: { referenceId: 'order-1' },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

    expect(paymentRepository.runWebhookTransaction).not.toHaveBeenCalled();
  });

  it('resolves order.paymentfailed by marking the order failed, with no notification', async () => {
    const payload = {
      eventType: 'order.paymentfailed',
      metadata: { eventId: 'evt-3' },
      data: { orderId: 'sb-order-2', referenceId: 'order-2', paymentId: 'sp-2' },
    };

    const result = await paymentService.processSurfboardWebhookEvent(payload);

    expect(result).toEqual({ processed: true });
    expect(notificationService.notify).not.toHaveBeenCalled();
  });
});
