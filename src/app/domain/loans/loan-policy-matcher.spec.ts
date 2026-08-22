import { describe, expect, it } from 'vitest';

import { matchLoanCalculationPolicy } from './loan-policy-matcher';
import type { LoanAccount, LoanEvent } from './loan.models';

const axis: LoanAccount = {
  id: 'axis-loan',
  schemaVersion: 2,
  lender: 'Axis Bank',
  loanType: 'Personal loan',
  notes: '',
  contract: {
    disbursedAmount: 2_500_000,
    disbursementDate: '2023-12-19',
    firstEmiDate: '2024-01-05',
    originalTenureMonths: 84,
    initialEmi: 42_152,
    initialAnnualRate: 10.5,
    firstPeriodInterestAmount: 13_125,
    interestType: 'fixed',
    interestCalculationMethod: 'monthly-reducing',
    dayCountConvention: 'actual-365',
    compoundingFrequency: 'monthly',
    postPrepaymentStrategy: 'keep-emi-reduce-tenure',
    roundingPolicy: {
      monetaryScale: 2,
      interestRounding: 'half-up',
      installmentRounding: 'half-up',
      finalInstallmentAdjustment: true,
    },
  },
};

describe('loan policy matcher', () => {
  it('identifies the AXIS daily 30/360 whole-rupee policy from a post-payment row', () => {
    const partPayment: LoanEvent = {
      id: 'axis-part-payment',
      loanId: axis.id,
      type: 'part-prepayment',
      effectiveDate: '2026-05-11',
      amount: 647_093,
      source: 'manual',
      createdDate: '2026-05-11T00:00:00.000Z',
    };
    const result = matchLoanCalculationPolicy({
      account: axis,
      events: [partPayment],
      checkpoints: [
        {
          dueDate: '2026-06-05',
          interestAmount: 11_420,
          closingPrincipal: 1_144_928,
        },
      ],
    });

    expect(result.best).toMatchObject({
      interestCalculationMethod: 'daily-reducing',
      dayCountConvention: '30-360',
      roundingPolicy: { monetaryScale: 0, interestRounding: 'half-up' },
      interestDifference: 0,
      closingDifference: 0,
    });
    expect(result.status).toBe('ambiguous');
    expect(result.exactMatchCount).toBe(2);
  });

  it('reports invalid checkpoint dates instead of guessing', () => {
    const result = matchLoanCalculationPolicy({
      account: axis,
      events: [],
      checkpoints: [
        {
          dueDate: '2026-06-11',
          interestAmount: 1,
          closingPrincipal: 1,
        },
      ],
    });
    expect(result.status).toBe('none');
    expect(result.best).toBeUndefined();
  });

  it('requires every supplied schedule row to match the same calculation policy', () => {
    const partPayment: LoanEvent = {
      id: 'axis-part-payment',
      loanId: axis.id,
      type: 'part-prepayment',
      effectiveDate: '2026-05-11',
      amount: 647_093,
      source: 'manual',
      createdDate: '2026-05-11T00:00:00.000Z',
    };
    const result = matchLoanCalculationPolicy({
      account: axis,
      events: [partPayment],
      checkpoints: [
        { dueDate: '2026-06-05', interestAmount: 11_420, closingPrincipal: 1_144_928 },
        { dueDate: '2026-07-05', interestAmount: 10_018, closingPrincipal: 1_112_794 },
      ],
    });

    expect(result.best?.checkpointResults).toHaveLength(2);
    expect(result.status).toBe('ambiguous');
    expect(result.exactMatchCount).toBe(2);
    expect(result.best?.totalDifference).toBe(0);
  });
});
