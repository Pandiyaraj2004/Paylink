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

const firebaseConfig = require('../src/config/firebase');
const merchantRepository = require('../src/repositories/merchant.repository');
const app = require('../src/app');

describe('PATCH /api/merchants/:id — ownership enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 FORBIDDEN when the authenticated uid does not own the merchant', async () => {
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'not-the-owner', email: 'someone@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'the-real-owner',
      status: 'pending_setup',
      businessName: '',
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ businessName: 'New Name' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(merchantRepository.updateMerchant).not.toHaveBeenCalled();
  });

  it('allows the owner to update their own merchant', async () => {
    firebaseConfig.__verifyIdToken.mockResolvedValue({ uid: 'the-real-owner', email: 'owner@example.com' });
    merchantRepository.getMerchantById.mockResolvedValue({
      id: 'merchant-1',
      userId: 'the-real-owner',
      status: 'active',
      businessName: 'Old Name',
    });
    merchantRepository.updateMerchant.mockResolvedValue({
      id: 'merchant-1',
      userId: 'the-real-owner',
      status: 'active',
      businessName: 'New Name',
    });

    const res = await request(app)
      .patch('/api/merchants/merchant-1')
      .set('Authorization', 'Bearer faketoken')
      .send({ businessName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe('New Name');
  });
});
