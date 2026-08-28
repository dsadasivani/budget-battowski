import { describe, expect, it } from 'vitest';
import { effectiveRecurringAmount, monthlyRecurringCommitment } from './investment-recurring';
import type { RecurringInvestmentPlan } from './investment.models';

function plan(overrides: Partial<RecurringInvestmentPlan> = {}): RecurringInvestmentPlan {
  return {
    enabled: true,
    amount: '10000',
    frequency: 'MONTHLY',
    startDate: '2026-01-01',
    ...overrides,
  };
}

describe('investment recurrence', () => {
  it('normalizes monthly, quarterly, half-yearly, and yearly commitments', () => {
    expect(monthlyRecurringCommitment(plan(), '2026-06-01')).toBe('10000');
    expect(
      monthlyRecurringCommitment(plan({ amount: '24000', frequency: 'QUARTERLY' }), '2026-06-01'),
    ).toBe('8000');
    expect(
      monthlyRecurringCommitment(plan({ amount: '60000', frequency: 'HALF_YEARLY' }), '2026-06-01'),
    ).toBe('10000');
    expect(
      monthlyRecurringCommitment(plan({ amount: '120000', frequency: 'YEARLY' }), '2026-06-01'),
    ).toBe('10000');
  });

  it('applies percentage and fixed yearly step-ups at effective boundaries', () => {
    const percentage = plan({
      stepUp: {
        enabled: true,
        type: 'PERCENTAGE',
        value: '10',
        frequency: 'YEARLY',
        effectiveFrom: '2027-01-01',
      },
    });
    expect(effectiveRecurringAmount(percentage, '2026-12-31')).toBe('10000');
    expect(effectiveRecurringAmount(percentage, '2027-01-01')).toBe('11000');
    expect(effectiveRecurringAmount(percentage, '2028-01-01')).toBe('12100');
    const fixed = plan({
      stepUp: {
        enabled: true,
        type: 'FIXED_AMOUNT',
        value: '2000',
        frequency: 'YEARLY',
        effectiveFrom: '2027-04-01',
      },
    });
    expect(effectiveRecurringAmount(fixed, '2027-03-31')).toBe('10000');
    expect(effectiveRecurringAmount(fixed, '2027-04-01')).toBe('12000');
    expect(effectiveRecurringAmount(fixed, '2028-04-01')).toBe('14000');
  });

  it('adds a fixed amount at each configured step-up frequency from the upcoming month', () => {
    const fixed = plan({
      amount: '5000',
      sipType: 'STEP_UP',
      stepUp: {
        enabled: true,
        type: 'FIXED_AMOUNT',
        value: '500',
        frequency: 'HALF_YEARLY',
        effectiveFrom: '2026-07-01',
      },
    });

    expect(effectiveRecurringAmount(fixed, '2026-06-30')).toBe('5000');
    expect(effectiveRecurringAmount(fixed, '2026-07-01')).toBe('5500');
    expect(effectiveRecurringAmount(fixed, '2026-12-31')).toBe('5500');
    expect(effectiveRecurringAmount(fixed, '2027-01-01')).toBe('6000');
  });

  it('preserves the scheduled day for older step-up plans that stored a full date', () => {
    const fixed = plan({
      stepUp: {
        enabled: true,
        type: 'FIXED_AMOUNT',
        value: '500',
        frequency: 'HALF_YEARLY',
        effectiveFrom: '2026-07-15',
      },
    });

    expect(effectiveRecurringAmount(fixed, '2027-01-14')).toBe('10500');
    expect(effectiveRecurringAmount(fixed, '2027-01-15')).toBe('11000');
  });
});
