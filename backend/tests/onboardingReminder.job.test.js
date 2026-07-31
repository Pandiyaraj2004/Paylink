/**
 * jobs/onboardingReminder.job.js (Phase 13, master-doc.md Section 27's
 * scoped-down "Reminder" event — see that file's own header for why this is
 * the interpretation used: no recurring-billing feature exists to remind
 * about, so this instead nudges merchants stuck at `pending_setup`).
 * Mirrors tests one would write for paymentReconciliation.job.js's own
 * polling pattern: mock the Firestore query chain + notification.service.js
 * directly, exercise the real query-building and per-merchant notify loop.
 */

jest.mock('../src/config/firebase', () => ({
  admin: { firestore: jest.fn() },
  isFirebaseReady: () => true,
  initError: () => null,
}));

jest.mock('../src/services/notification.service', () => ({
  notify: jest.fn(),
}));

const { admin } = require('../src/config/firebase');
const notificationService = require('../src/services/notification.service');
const { sendOnboardingReminders, findStalePendingSetupMerchants } = require('../src/jobs/onboardingReminder.job');

function makeMerchantsQueryMock(docs) {
  const get = jest.fn().mockResolvedValue({
    docs: docs.map((d) => ({ id: d.id, data: () => d })),
  });
  const where2 = jest.fn(() => ({ get }));
  const where1 = jest.fn(() => ({ where: where2 }));
  const collection = jest.fn(() => ({ where: where1 }));
  return { collection, where1, where2, get };
}

describe('jobs/onboardingReminder.job.js — sendOnboardingReminders (Phase 13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationService.notify.mockResolvedValue({ id: 'n1' });
  });

  it('queries merchants stuck at pending_setup older than the stale-days cutoff', async () => {
    const { collection, where1, where2 } = makeMerchantsQueryMock([]);
    admin.firestore.mockReturnValue({ collection });

    await findStalePendingSetupMerchants(3);

    expect(collection).toHaveBeenCalledWith('merchants');
    expect(where1).toHaveBeenCalledWith('status', '==', 'pending_setup');
    expect(where2).toHaveBeenCalledWith('createdAt', '<=', expect.any(Date));
  });

  it('fires one onboarding_reminder notification per stale merchant found', async () => {
    const { collection } = makeMerchantsQueryMock([
      { id: 'm1', status: 'pending_setup' },
      { id: 'm2', status: 'pending_setup' },
    ]);
    admin.firestore.mockReturnValue({ collection });

    const results = await sendOnboardingReminders(3);

    expect(notificationService.notify).toHaveBeenCalledTimes(2);
    expect(notificationService.notify).toHaveBeenCalledWith({ merchantId: 'm1', type: 'onboarding_reminder' });
    expect(notificationService.notify).toHaveBeenCalledWith({ merchantId: 'm2', type: 'onboarding_reminder' });
    expect(results).toEqual([
      { merchantId: 'm1', sent: true },
      { merchantId: 'm2', sent: true },
    ]);
  });

  it('keeps going and reports a per-merchant failure rather than throwing the whole batch out', async () => {
    const { collection } = makeMerchantsQueryMock([{ id: 'm1', status: 'pending_setup' }]);
    admin.firestore.mockReturnValue({ collection });
    notificationService.notify.mockRejectedValueOnce(new Error('boom'));

    const results = await sendOnboardingReminders(3);

    expect(results).toEqual([{ merchantId: 'm1', sent: false, error: 'boom' }]);
  });

  it('is a plain callable function, not registered with any scheduler (out of scope per this phase)', () => {
    expect(typeof sendOnboardingReminders).toBe('function');
  });
});
