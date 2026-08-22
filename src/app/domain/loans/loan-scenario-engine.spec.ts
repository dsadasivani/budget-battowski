import { describe, expect, it } from 'vitest';

import { simulatePrepayment } from './loan-scenario-engine';
import type { LoanAccount } from './loan.models';
import { DEFAULT_LOAN_ROUNDING_POLICY } from './loan.models';

const account: LoanAccount = {
  id: 'loan-scenario',
  schemaVersion: 2,
  lender: 'Axis Bank',
  loanType: 'Personal loan',
  notes: '',
  contract: {
    disbursedAmount: 2_500_000,
    disbursementDate: '2024-01-05',
    firstEmiDate: '2024-02-05',
    initialEmi: 42_152,
    initialAnnualRate: 10.75,
    interestType: 'floating',
    interestCalculationMethod: 'daily-reducing',
    dayCountConvention: 'actual-365',
    compoundingFrequency: 'monthly',
    postPrepaymentStrategy: 'keep-emi-reduce-tenure',
    roundingPolicy: DEFAULT_LOAN_ROUNDING_POLICY,
  },
};

describe('prepayment scenario engine', () => {
  it('does not mutate inputs and shows interest and tenure saved', () => {
    const before = structuredClone(account);
    const result = simulatePrepayment({
      account,
      events: [],
      asOfDate: '2026-08-17',
      prepaymentDate: '2026-09-11',
      amount: 240_000,
      strategy: 'keep-emi-reduce-tenure',
    });
    expect(account).toEqual(before);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.monthsSaved).toBeGreaterThan(0);
  });
});
