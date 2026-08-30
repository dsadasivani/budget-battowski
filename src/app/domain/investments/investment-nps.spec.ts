import { describe, expect, it } from 'vitest';

import { calculateNpsSchemeHoldings } from './investment-nps';
import type { InvestmentTransaction, NpsSchemeHolding } from './investment.models';

const openingHoldings: NpsSchemeHolding[] = [
  {
    schemeCode: 'SCHEME_E',
    schemeName: 'Pension Fund Scheme E',
    allocationPercentage: '75',
    units: '100',
    nav: '50',
    navDate: '2026-08-01',
  },
  {
    schemeCode: 'SCHEME_G',
    schemeName: 'Pension Fund Scheme G',
    allocationPercentage: '25',
    units: '50',
    nav: '25',
    navDate: '2026-08-01',
  },
];

const contribution: InvestmentTransaction = {
  id: 'contribution-1',
  schemaVersion: 2,
  investmentId: 'nps-1',
  type: 'CONTRIBUTION',
  date: '2026-08-15',
  amount: '750',
  source: 'RECURRING',
  schemeAllocations: [
    { schemeCode: 'SCHEME_E', amount: '750', units: '10', nav: '75', navDate: '2026-08-15' },
  ],
  createdDate: '2026-08-15T00:00:00Z',
  updatedDate: '2026-08-15T00:00:00Z',
};

describe('NPS scheme holding calculation', () => {
  it('always starts from the opening snapshot instead of reapplying transactions to saved current units', () => {
    const previouslyRefreshedHoldings: NpsSchemeHolding[] = [
      { ...openingHoldings[0], units: '110', nav: '76', navDate: '2026-08-29' },
      { ...openingHoldings[1], nav: '26', navDate: '2026-08-29' },
    ];

    const firstRefresh = calculateNpsSchemeHoldings(
      openingHoldings,
      [contribution],
      previouslyRefreshedHoldings,
    );
    const secondRefresh = calculateNpsSchemeHoldings(openingHoldings, [contribution], firstRefresh);

    expect(firstRefresh).toEqual(secondRefresh);
    expect(firstRefresh.find((holding) => holding.schemeCode === 'SCHEME_E')).toMatchObject({
      allocationPercentage: '75',
      units: '110',
      nav: '76',
      navDate: '2026-08-29',
    });
  });

  it('applies withdrawals independently to the selected scheme', () => {
    const withdrawal: InvestmentTransaction = {
      ...contribution,
      id: 'withdrawal-1',
      type: 'WITHDRAWAL',
      date: '2026-08-20',
      amount: '130',
      source: 'LIQUIDATION',
      schemeAllocations: [
        { schemeCode: 'SCHEME_G', amount: '130', units: '5', nav: '26', navDate: '2026-08-20' },
      ],
    };

    const result = calculateNpsSchemeHoldings(openingHoldings, [contribution, withdrawal]);

    expect(result.find((holding) => holding.schemeCode === 'SCHEME_E')?.units).toBe('110');
    expect(result.find((holding) => holding.schemeCode === 'SCHEME_G')?.units).toBe('45');
  });
});
