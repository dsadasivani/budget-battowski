import { describe, expect, it } from 'vitest';

import { addLoanMonths } from './loan-date';
import { calculateLoan } from './loan-engine';
import { sortLoanEvents } from './loan-events';
import { calculateEmi } from './loan-money';
import type { LoanAccount, LoanEvent } from './loan.models';
import { DEFAULT_LOAN_ROUNDING_POLICY } from './loan.models';

function account(overrides: Partial<LoanAccount['contract']> = {}): LoanAccount {
  return {
    id: 'loan-1',
    schemaVersion: 2,
    lender: 'Bank',
    loanType: 'Home loan',
    notes: '',
    contract: {
      disbursedAmount: 100_000,
      disbursementDate: '2026-01-01',
      firstEmiDate: '2026-02-01',
      originalTenureMonths: 12,
      initialEmi: 8_792,
      initialAnnualRate: 10,
      interestType: 'fixed',
      interestCalculationMethod: 'monthly-reducing',
      dayCountConvention: 'actual-365',
      compoundingFrequency: 'monthly',
      postPrepaymentStrategy: 'keep-emi-reduce-tenure',
      roundingPolicy: DEFAULT_LOAN_ROUNDING_POLICY,
      ...overrides,
    },
  };
}

type TestLoanEvent = LoanEvent extends infer Event
  ? Event extends LoanEvent
    ? Omit<Event, 'id' | 'loanId' | 'source' | 'createdDate'>
    : never
  : never;

function event(value: TestLoanEvent): LoanEvent {
  return {
    id: `event-${value.type}-${value.effectiveDate}`,
    loanId: 'loan-1',
    source: 'manual',
    createdDate: '2026-01-01T00:00:00.000Z',
    ...value,
  } as LoanEvent;
}

describe('loan engine', () => {
  it('calculates standard and zero-interest EMI deterministically', () => {
    expect(calculateEmi(100_000, 10, 12, DEFAULT_LOAN_ROUNDING_POLICY)).toBe(8791.59);
    expect(calculateEmi(120_000, 0, 12, DEFAULT_LOAN_ROUNDING_POLICY)).toBe(10_000);
  });

  it('adjusts the final installment and amortizes without a paise loop', () => {
    const result = calculateLoan({ account: account(), events: [], asOfDate: '2026-01-15' });
    const final = result.schedule.at(-1);

    expect(final?.closingPrincipal).toBe(0);
    expect(final?.scheduledPayment).toBeLessThanOrEqual(8_792);
    expect(result.position.remainingInstallments).toBeGreaterThan(0);
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'non-amortizing' }),
    );
  });

  it('applies a future part-payment to only one projected period', () => {
    const result = calculateLoan({
      account: account({ interestCalculationMethod: 'daily-reducing' }),
      events: [event({ type: 'part-prepayment', effectiveDate: '2026-02-15', amount: 10_000 })],
      asOfDate: '2026-01-15',
    });

    const projectedPartPayments = result.schedule
      .flatMap((row) => row.interimEvents ?? [])
      .filter((item) => item.type === 'part-prepayment');
    expect(projectedPartPayments).toHaveLength(1);
    expect(projectedPartPayments[0]).toMatchObject({ amount: 10_000 });
  });

  it('matches the IndusInd 16306 repayment schedule using daily actual/actual interest', () => {
    const indusInd = account({
      sanctionedAmount: 625_000,
      disbursedAmount: 625_000,
      disbursementDate: '2025-06-30',
      firstEmiDate: '2025-08-04',
      originalTenureMonths: 48,
      initialEmi: 16_306,
      initialAnnualRate: 11.5,
      interestType: 'fixed',
      interestCalculationMethod: 'daily-reducing',
      dayCountConvention: 'actual-actual',
    });

    const result = calculateLoan({ account: indusInd, events: [], asOfDate: '2025-08-03' });
    const first = result.schedule[0];
    const second = result.schedule[1];
    const penultimate = result.schedule[46];
    const final = result.schedule[47];

    expect(result.schedule).toHaveLength(48);
    expect([
      Math.round(first.openingPrincipal),
      Math.round(first.principalComponent),
      Math.round(first.interestComponent),
      Math.round(first.scheduledPayment),
    ]).toEqual([625_000, 9_414, 6_892, 16_306]);
    expect([
      Math.round(second.openingPrincipal),
      Math.round(second.principalComponent),
      Math.round(second.interestComponent),
    ]).toEqual([615_586, 10_293, 6_013]);
    expect([
      Math.round(penultimate.openingPrincipal),
      Math.round(penultimate.principalComponent),
      Math.round(penultimate.interestComponent),
    ]).toEqual([33_575, 15_978, 328]);
    expect([
      Math.round(final.openingPrincipal),
      Math.round(final.principalComponent),
      Math.round(final.interestComponent),
      Math.round(final.scheduledPayment),
    ]).toEqual([17_597, 17_597, 166, 17_763]);
    expect(
      Math.round(result.schedule.reduce((total, row) => total + row.scheduledPayment, 0)),
    ).toBe(784_145);
    expect(final.closingPrincipal).toBe(0);
  });

  it('retains historical rates and applies a future rate change before interest', () => {
    const events: LoanEvent[] = [
      event({ type: 'rate-change', effectiveDate: '2026-03-01', newAnnualRate: 8 }),
    ];
    const result = calculateLoan({ account: account(), events, asOfDate: '2026-01-15' });
    expect(result.schedule[0].annualRate).toBe(10);
    expect(result.schedule[1].annualRate).toBe(8);
  });

  it('uses an anchor as recorded principal and does not fabricate lifetime totals', () => {
    const events: LoanEvent[] = [
      event({ type: 'balance-anchor', effectiveDate: '2026-02-15', amount: 75_432.1 }),
    ];
    const result = calculateLoan({ account: account(), events, asOfDate: '2026-02-15' });
    expect(result.position.outstandingPrincipal).toBe(75_432.1);
    expect(result.position.historyCoverage).toBe('partial');
    expect(result.position.principalRepaid).toBeUndefined();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'history-partial' }));
  });

  it('reduces daily interest after a mid-cycle prepayment', () => {
    const daily = account({ interestCalculationMethod: 'daily-reducing' });
    const baseline = calculateLoan({ account: daily, events: [], asOfDate: '2026-01-15' });
    expect(baseline.schedule[0].interestDays).toBe(31);
    expect(baseline.schedule[0].interestComponent).toBe(baseline.schedule[0].interestAccrued);
    const withPrepayment = calculateLoan({
      account: daily,
      events: [event({ type: 'part-prepayment', effectiveDate: '2026-01-15', amount: 40_000 })],
      asOfDate: '2026-01-15',
    });
    expect(withPrepayment.schedule[0].interestDays).toBe(17);
    expect(withPrepayment.schedule[0].interestComponent).toBeGreaterThan(
      withPrepayment.schedule[0].interestAccrued,
    );
    expect(withPrepayment.position.futureInterest).toBeLessThan(baseline.position.futureInterest);
    expect(
      (withPrepayment.position.projectedPayoffDate ?? '') <
        (baseline.position.projectedPayoffDate ?? ''),
    ).toBe(true);
  });

  it('reproduces the AXIS lender schedule including its dated part-payment', () => {
    const axis = account({
      sanctionedAmount: 2_500_000,
      disbursedAmount: 2_500_000,
      disbursementDate: '2023-12-19',
      firstEmiDate: '2024-01-05',
      originalTenureMonths: 84,
      initialEmi: 42_152,
      initialAnnualRate: 10.5,
      firstPeriodInterestAmount: 13_125,
      interestCalculationMethod: 'daily-reducing',
      dayCountConvention: '30-360',
      roundingPolicy: {
        monetaryScale: 0,
        interestRounding: 'half-up',
        installmentRounding: 'half-up',
        finalInstallmentAdjustment: true,
      },
    });
    const events: LoanEvent[] = Array.from({ length: 32 }, (_, index) =>
      event({
        type: 'emi-payment',
        effectiveDate: addLoanMonths('2024-01-05', index, 5),
        amount: 42_152,
      }),
    );
    events.push(
      event({
        type: 'part-prepayment',
        effectiveDate: '2026-05-11',
        amount: 647_093,
      }),
    );

    const result = calculateLoan({ account: axis, events, asOfDate: '2026-08-21' });
    const first = result.schedule[0];
    const june = result.schedule[29];
    const august = result.schedule[31];
    const final = result.schedule.at(-1);

    expect(result.schedule).toHaveLength(62);
    expect([first.interestComponent, first.principalComponent, first.closingPrincipal]).toEqual([
      13_125, 29_027, 2_470_973,
    ]);
    expect(june.interimEvents).toEqual([
      expect.objectContaining({
        effectiveDate: '2026-05-11',
        amount: 647_093,
        openingPrincipal: 1_822_753,
        closingPrincipal: 1_175_660,
      }),
    ]);
    expect(august.closingPrincipal).toBe(1_080_379);
    expect(result.position.outstandingPrincipal).toBe(1_080_379);
    expect(result.position.remainingInstallments).toBe(30);
    expect(result.position.projectedPayoffDate).toBe('2029-02-05');
    expect({
      juneInterest: june.interestComponent,
      finalPayment: final?.scheduledPayment,
      totalInterest: result.schedule.reduce((total, row) => total + row.interestComponent, 0),
    }).toEqual({
      juneInterest: 11_420,
      finalPayment: 6_319,
      totalInterest: 724_684,
    });
  });

  it('reports a non-amortizing schedule defensively', () => {
    const result = calculateLoan({
      account: account({ initialEmi: 10, initialAnnualRate: 24 }),
      events: [],
      asOfDate: '2026-01-15',
    });
    expect(result.position.status).toBe('needs-attention');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'non-amortizing' }));
  });

  it('orders same-day changes, payments, prepayments, charges, and anchors stably', () => {
    const events = [
      event({ type: 'balance-anchor', effectiveDate: '2026-03-01', amount: 1 }),
      event({ type: 'part-prepayment', effectiveDate: '2026-03-01', amount: 1 }),
      event({ type: 'rate-change', effectiveDate: '2026-03-01', newAnnualRate: 8 }),
      event({ type: 'emi-payment', effectiveDate: '2026-03-01', amount: 1 }),
      event({ type: 'charge', effectiveDate: '2026-03-01', amount: 1 }),
    ];
    expect(sortLoanEvents(events).map((item) => item.type)).toEqual([
      'rate-change',
      'emi-payment',
      'part-prepayment',
      'charge',
      'balance-anchor',
    ]);
  });
});
