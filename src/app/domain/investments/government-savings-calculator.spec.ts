import { describe, expect, it } from 'vitest';
import {
  calculateGovernmentSavings,
  eligibleBalanceForMonth,
  type GovernmentInterestRate,
} from './government-savings-calculator';
import type { InvestmentTransaction } from './investment.models';

function contribution(id: string, date: string, amount: string): InvestmentTransaction {
  return {
    id,
    schemaVersion: 2,
    investmentId: 'ppf',
    type: 'CONTRIBUTION',
    date,
    amount,
    source: 'ADHOC',
    createdDate: `${date}T00:00:00Z`,
    updatedDate: `${date}T00:00:00Z`,
  };
}

describe('government savings calculation', () => {
  const rates: GovernmentInterestRate[] = [
    { scheme: 'PPF', annualRate: '12', effectiveFrom: '2025-01-01' },
    { scheme: 'SSY', annualRate: '12', effectiveFrom: '2025-01-01' },
  ];
  it('distinguishes deposits on and after the fifth-day cutoff', () => {
    expect(
      eligibleBalanceForMonth('1000', [contribution('a', '2026-04-05', '500')], '2026-04'),
    ).toBe('1500');
    expect(
      eligibleBalanceForMonth('1000', [contribution('a', '2026-04-06', '500')], '2026-04'),
    ).toBe('1000');
  });
  it('handles multiple deposits, rate periods, FY credit, and opening snapshots', () => {
    const result = calculateGovernmentSavings(
      'PPF',
      { asOfDate: '2026-03-31', investedAmount: '1000', currentValue: '1000' },
      [contribution('a', '2026-04-05', '500'), contribution('b', '2026-04-20', '500')],
      '2027-03-31',
      rates,
    );
    expect(Number(result.currentValue)).toBeGreaterThan(2180);
    expect(Number(result.interestEarned)).toBeGreaterThan(180);
  });
});
