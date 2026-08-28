import { describe, expect, it } from 'vitest';
import {
  EMPTY_INVESTMENT_SUMMARY,
  type InvestmentAccount,
  type InvestmentTransaction,
} from './investment.models';
import { investmentMonthlyBreakdown } from './investment-monthly-review';

const account: InvestmentAccount = {
  id: 'mf',
  schemaVersion: 2,
  name: 'Fund',
  type: 'MUTUAL_FUND',
  status: 'ACTIVE',
  summary: { ...EMPTY_INVESTMENT_SUMMARY, overallReturnAmount: '50000' },
  recurringPlan: { enabled: true, amount: '10000', frequency: 'MONTHLY', startDate: '2026-01-01' },
  createdDate: '2026-01-01',
  updatedDate: '2026-01-01',
};
function tx(
  id: string,
  type: InvestmentTransaction['type'],
  amount: string,
  source: InvestmentTransaction['source'],
): InvestmentTransaction {
  return {
    id,
    schemaVersion: 2,
    investmentId: 'mf',
    type,
    date: '2026-08-10',
    amount,
    source,
    createdDate: '2026-08-10',
    updatedDate: '2026-08-10',
  };
}

describe('monthly investment accounting', () => {
  it('counts actual recurring and ad-hoc contributions but never a plan by itself', () => {
    expect(investmentMonthlyBreakdown([account], [], '2026-08').totalContributions).toBe('0');
    const result = investmentMonthlyBreakdown(
      [account],
      [tx('sip', 'SIP', '10000', 'RECURRING'), tx('extra', 'SIP', '25000', 'ADHOC')],
      '2026-08',
    );
    expect(result.recurring).toHaveLength(1);
    expect(result.adhoc).toHaveLength(1);
    expect(result.totalContributions).toBe('35000');
  });
  it('keeps redemptions separate and ignores appreciation entirely', () => {
    const result = investmentMonthlyBreakdown(
      [account],
      [tx('redeem', 'REDEMPTION', '200000', 'LIQUIDATION')],
      '2026-08',
    );
    expect(result.totalContributions).toBe('0');
    expect(result.totalWithdrawals).toBe('200000');
    expect(result).not.toHaveProperty('income');
  });
});
