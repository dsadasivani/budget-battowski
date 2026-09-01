import { describe, expect, it } from 'vitest';

import {
  availableHoldingOnDate,
  calculateInvestmentSummary,
} from './investment-calculation-engine';
import {
  EMPTY_INVESTMENT_SUMMARY,
  type InvestmentAccount,
  type InvestmentTransaction,
} from './investment.models';

function account(overrides: Partial<InvestmentAccount> = {}): InvestmentAccount {
  return {
    id: 'stock-1',
    schemaVersion: 2,
    name: 'Reliance',
    type: 'STOCK',
    status: 'ACTIVE',
    summary: { ...EMPTY_INVESTMENT_SUMMARY },
    createdDate: '2026-01-01',
    updatedDate: '2026-01-01',
    ...overrides,
  };
}

function transaction(
  id: string,
  type: InvestmentTransaction['type'],
  date: string,
  amount: string,
  quantity: string,
  price: string,
): InvestmentTransaction {
  return {
    id,
    schemaVersion: 2,
    investmentId: 'stock-1',
    type,
    date,
    amount,
    quantity,
    price,
    source: type === 'SELL' ? 'LIQUIDATION' : 'ADHOC',
    createdDate: `${date}T00:00:00Z`,
    updatedDate: `${date}T00:00:00Z`,
  };
}

describe('investment FIFO calculation engine', () => {
  it('calculates a single purchase and current valuation', () => {
    const summary = calculateInvestmentSummary(
      account(),
      [transaction('b1', 'BUY', '2026-01-01', '10000', '10', '1000')],
      { valuationPrice: '1400' },
    );
    expect(summary).toMatchObject({
      currentQuantity: '10',
      remainingCostBasis: '10000',
      currentValue: '14000',
      unrealizedReturn: '4000',
      overallReturnPercentage: '40',
    });
  });

  it('consumes multiple lots FIFO for a partial stock sale', () => {
    const summary = calculateInvestmentSummary(
      account(),
      [
        transaction('b1', 'BUY', '2026-01-01', '1000', '10', '100'),
        transaction('b2', 'BUY', '2026-02-01', '2000', '10', '200'),
        transaction('s1', 'SELL', '2026-03-01', '2250', '15', '150'),
      ],
      { valuationPrice: '250' },
    );
    expect(summary).toMatchObject({
      currentQuantity: '5',
      remainingCostBasis: '1000',
      currentValue: '1250',
      realizedReturn: '250',
      unrealizedReturn: '250',
      overallReturnAmount: '500',
    });
  });

  it('supports MF SIP, ad-hoc purchase, partial and full redemption', () => {
    const transactions = [
      transaction('sip', 'SIP', '2026-01-01', '10000', '100', '100'),
      transaction('adhoc', 'BUY', '2026-02-01', '6000', '50', '120'),
      transaction('redeem', 'REDEMPTION', '2026-03-01', '9000', '75', '120'),
    ];
    const partial = calculateInvestmentSummary(account({ type: 'MUTUAL_FUND' }), transactions, {
      valuationPrice: '130',
    });
    expect(partial.currentQuantity).toBe('75');
    expect(partial.remainingCostBasis).toBe('8500');
    const full = calculateInvestmentSummary(
      account({ type: 'MUTUAL_FUND' }),
      [...transactions, transaction('redeem2', 'REDEMPTION', '2026-04-01', '9750', '75', '130')],
      { valuationPrice: '130' },
    );
    expect(full.currentQuantity).toBe('0');
    expect(full.currentValue).toBe('0');
  });

  it('rejects liquidation beyond the available holding as of the date', () => {
    expect(() =>
      calculateInvestmentSummary(account(), [
        transaction('b', 'BUY', '2026-02-01', '1000', '10', '100'),
        transaction('s', 'SELL', '2026-01-01', '1100', '11', '100'),
      ]),
    ).toThrow('DISPOSAL_EXCEEDS_HOLDING');
    expect(
      availableHoldingOnDate(
        account(),
        [transaction('b', 'BUY', '2026-02-01', '1000', '10', '100')],
        '2026-01-31',
      ),
    ).toBe('0');
  });

  it('can close and later reopen the same position', () => {
    const closed = calculateInvestmentSummary(account(), [
      transaction('b', 'BUY', '2026-01-01', '1000', '10', '100'),
      transaction('s', 'SELL', '2026-02-01', '1200', '10', '120'),
    ]);
    expect(closed.currentQuantity).toBe('0');
    const reopened = calculateInvestmentSummary(
      account(),
      [
        transaction('b', 'BUY', '2026-01-01', '1000', '10', '100'),
        transaction('s', 'SELL', '2026-02-01', '1200', '10', '120'),
        transaction('b2', 'BUY', '2026-03-01', '500', '5', '100'),
      ],
      { valuationPrice: '110' },
    );
    expect(reopened).toMatchObject({ currentQuantity: '5', currentValue: '550' });
  });
});
