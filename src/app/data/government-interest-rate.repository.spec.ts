import type { FirebaseApp } from 'firebase/app';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GOVERNMENT_INTEREST_RATES } from '../domain/investments/government-interest-rates';

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...segments: unknown[]) => segments.join('/')),
  getDoc: firestore.getDoc,
  getFirestore: vi.fn(() => ({ kind: 'firestore' })),
}));

import { GovernmentInterestRateRepository } from './government-interest-rate.repository';

describe('GovernmentInterestRateRepository', () => {
  let repository: GovernmentInterestRateRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new GovernmentInterestRateRepository();
  });

  it('loads centrally managed verified rates from Firestore', async () => {
    const rates = [GOVERNMENT_INTEREST_RATES[1], GOVERNMENT_INTEREST_RATES[5]];
    firestore.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ schemaVersion: 1, rates }),
    });

    await expect(repository.load({} as FirebaseApp)).resolves.toEqual({
      rates,
      source: 'FIRESTORE',
    });
  });

  it.each([
    ['missing', { exists: (): boolean => false }],
    [
      'invalid',
      {
        exists: (): boolean => true,
        data: () => ({ schemaVersion: 1, rates: [{}] }),
      },
    ],
  ])('uses the bundled fallback when the central configuration is %s', async (_case, snapshot) => {
    firestore.getDoc.mockResolvedValue(snapshot);

    await expect(repository.load({} as FirebaseApp)).resolves.toEqual({
      rates: GOVERNMENT_INTEREST_RATES,
      source: 'BUNDLED',
    });
  });

  it('uses the bundled fallback when Firestore is unavailable', async () => {
    firestore.getDoc.mockRejectedValue(new Error('offline'));

    await expect(repository.load({} as FirebaseApp)).resolves.toEqual({
      rates: GOVERNMENT_INTEREST_RATES,
      source: 'BUNDLED',
    });
  });
});
