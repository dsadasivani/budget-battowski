import { describe, expect, it } from 'vitest';

import {
  GOVERNMENT_INTEREST_RATES,
  governmentInterestRateFor,
  parseGovernmentInterestRates,
} from './government-interest-rates';

describe('government interest rate configuration', () => {
  it('keeps the bundled fallback fully verified with explicit coverage', () => {
    expect(parseGovernmentInterestRates(GOVERNMENT_INTEREST_RATES)).toEqual(
      GOVERNMENT_INTEREST_RATES,
    );
    expect(governmentInterestRateFor('PPF', '2026-08-30', GOVERNMENT_INTEREST_RATES)).toMatchObject(
      {
        annualRate: '7.1',
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-09-30',
      },
    );
    expect(governmentInterestRateFor('SSY', '2026-08-30', GOVERNMENT_INTEREST_RATES)).toMatchObject(
      {
        annualRate: '8.2',
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-09-30',
      },
    );
  });

  it('rejects unverified, open-ended, and overlapping remote periods', () => {
    const validRate = {
      scheme: 'PPF',
      annualRate: '7.1',
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-09-30',
      sourceUrl: 'https://dea.gov.in/rates',
      publishedDate: '2026-06-30',
      verifiedAt: '2026-08-30T00:00:00.000Z',
    };

    expect(parseGovernmentInterestRates([{ ...validRate, verifiedAt: undefined }])).toBeUndefined();
    expect(
      parseGovernmentInterestRates([{ ...validRate, effectiveTo: undefined }]),
    ).toBeUndefined();
    expect(
      parseGovernmentInterestRates([{ ...validRate, sourceUrl: 'https://example.com/rates' }]),
    ).toBeUndefined();
    expect(
      parseGovernmentInterestRates([
        validRate,
        { ...validRate, effectiveFrom: '2026-09-01', effectiveTo: '2026-12-31' },
      ]),
    ).toBeUndefined();
  });

  it('does not extend the last verified period into a later quarter', () => {
    expect(
      governmentInterestRateFor('PPF', '2026-10-01', GOVERNMENT_INTEREST_RATES),
    ).toBeUndefined();
  });
});
