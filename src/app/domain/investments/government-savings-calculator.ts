import Decimal from 'decimal.js';

import { decimalString, investmentDecimal, moneyString } from './investment-decimal';
import {
  GOVERNMENT_INTEREST_RATES,
  GovernmentInterestRateCoverageError,
  governmentInterestRateFor,
} from './government-interest-rates';
import type {
  GovernmentInterestRate,
  InvestmentOpeningSnapshot,
  InvestmentTransaction,
  InvestmentType,
} from './investment.models';

export { GOVERNMENT_INTEREST_RATES } from './government-interest-rates';
export type { GovernmentInterestRate } from './investment.models';

function endOfMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

function addMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function rateFor(
  scheme: 'PPF' | 'SSY',
  date: string,
  rates: readonly GovernmentInterestRate[],
): Decimal {
  const rate = governmentInterestRateFor(scheme, date, rates);
  if (!rate) throw new GovernmentInterestRateCoverageError(scheme, date);
  return investmentDecimal(rate.annualRate);
}

export interface GovernmentSavingsResult {
  currentValue: string;
  interestEarned: string;
  valuationDate: string;
  appliedRate: GovernmentInterestRate;
}

export function calculateGovernmentSavings(
  scheme: Extract<InvestmentType, 'PPF' | 'SSY'>,
  opening: InvestmentOpeningSnapshot,
  transactions: readonly InvestmentTransaction[],
  valuationDate: string,
  rates: readonly GovernmentInterestRate[] = GOVERNMENT_INTEREST_RATES,
): GovernmentSavingsResult {
  const appliedRate = governmentInterestRateFor(scheme, valuationDate, rates);
  if (!appliedRate) throw new GovernmentInterestRateCoverageError(scheme, valuationDate);
  let balance = investmentDecimal(opening.currentValue ?? opening.investedAmount);
  let pendingInterest = investmentDecimal(0);
  let creditedInterest = investmentDecimal(0);
  // The opening snapshot owns its as-of month; roll forward from the following month.
  let month = addMonth(opening.asOfDate);
  const events = [...transactions]
    .filter((item) => item.date > opening.asOfDate && item.date <= valuationDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  while (month <= valuationDate) {
    const monthEnd = endOfMonth(month);
    const isCompleteMonth = monthEnd <= valuationDate;
    const monthEvents = events.filter((event) => event.date.slice(0, 7) === month.slice(0, 7));
    let eligible = balance;
    for (const event of monthEvents.filter((item) => item.date <= `${month.slice(0, 7)}-05`)) {
      eligible =
        event.type === 'CONTRIBUTION' ? eligible.plus(event.amount) : eligible.minus(event.amount);
    }
    let running = eligible;
    for (const event of monthEvents.filter((item) => item.date > `${month.slice(0, 7)}-05`)) {
      running =
        event.type === 'CONTRIBUTION' ? running.plus(event.amount) : running.minus(event.amount);
      eligible = Decimal.min(eligible, running);
    }
    if (isCompleteMonth) {
      pendingInterest = pendingInterest.plus(
        Decimal.max(0, eligible)
          .mul(rateFor(scheme, monthEnd, rates))
          .div(1200),
      );
    }
    for (const event of monthEvents)
      balance =
        event.type === 'CONTRIBUTION' ? balance.plus(event.amount) : balance.minus(event.amount);
    if (isCompleteMonth && month.slice(5, 7) === '03') {
      const credit = pendingInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      balance = balance.plus(credit);
      creditedInterest = creditedInterest.plus(credit);
      pendingInterest = investmentDecimal(0);
    }
    month = addMonth(month);
  }
  return {
    currentValue: moneyString(balance),
    interestEarned: moneyString(creditedInterest),
    valuationDate,
    appliedRate,
  };
}

export function eligibleBalanceForMonth(
  balanceOnFirst: string,
  transactions: readonly InvestmentTransaction[],
  month: string,
): string {
  let balance = investmentDecimal(balanceOnFirst);
  let eligible = balance;
  const events = [...transactions]
    .filter((item) => item.date.startsWith(`${month}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const event of events) {
    balance =
      event.type === 'CONTRIBUTION' ? balance.plus(event.amount) : balance.minus(event.amount);
    if (event.date <= `${month}-05`) eligible = balance;
    else eligible = Decimal.min(eligible, balance);
  }
  return decimalString(Decimal.max(0, eligible), 2);
}
