import Decimal from 'decimal.js';

import { decimalString, investmentDecimal, moneyString } from './investment-decimal';
import {
  EMPTY_INVESTMENT_SUMMARY,
  isContributionType,
  isWithdrawalType,
  type InvestmentAccount,
  type InvestmentOpeningSnapshot,
  type InvestmentSummary,
  type InvestmentTransaction,
} from './investment.models';

interface Lot {
  quantity: Decimal;
  unitCost: Decimal;
}

export interface InvestmentCalculationOptions {
  valuationPrice?: string;
  currentValue?: string;
  valuationDate?: string;
  lastRefreshedAt?: string;
  preserveValuation?: Pick<
    InvestmentSummary,
    | 'currentValue'
    | 'valuationPrice'
    | 'valuationDate'
    | 'valuationSource'
    | 'lastRefreshedAt'
    | 'refreshStatus'
    | 'appliedGovernmentRate'
  >;
}

function openingQuantity(snapshot: InvestmentOpeningSnapshot | undefined): Decimal {
  return investmentDecimal(snapshot?.quantity ?? snapshot?.units ?? 0);
}

function transactionQuantity(transaction: InvestmentTransaction): Decimal {
  const explicit = transaction.quantity ?? transaction.units;
  if (explicit) return investmentDecimal(explicit);
  const unitPrice = transaction.price ?? transaction.nav;
  return unitPrice ? investmentDecimal(transaction.amount).div(unitPrice) : investmentDecimal(0);
}

function sortTransactions(transactions: readonly InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.createdDate.localeCompare(right.createdDate),
  );
}

export function calculateInvestmentSummary(
  account: Pick<InvestmentAccount, 'openingSnapshot' | 'summary' | 'recurringPlan'>,
  transactions: readonly InvestmentTransaction[],
  options: InvestmentCalculationOptions = {},
): InvestmentSummary {
  const lots: Lot[] = [];
  const opening = account.openingSnapshot;
  const openingInvested = investmentDecimal(opening?.investedAmount ?? 0);
  const initialQuantity = openingQuantity(opening);
  if (initialQuantity.gt(0)) {
    lots.push({ quantity: initialQuantity, unitCost: openingInvested.div(initialQuantity) });
  }

  let totalContributions = openingInvested;
  let totalWithdrawals = investmentDecimal(0);
  let remainingCostBasis = openingInvested;
  let realizedReturn = investmentDecimal(0);
  let quantity = initialQuantity;

  for (const transaction of sortTransactions(transactions)) {
    const amount = investmentDecimal(transaction.amount);
    const units = transactionQuantity(transaction);
    if (isContributionType(transaction.type)) {
      totalContributions = totalContributions.plus(amount);
      remainingCostBasis = remainingCostBasis.plus(amount);
      quantity = quantity.plus(units);
      if (units.gt(0)) lots.push({ quantity: units, unitCost: amount.div(units) });
      continue;
    }
    if (!isWithdrawalType(transaction.type)) continue;

    if (units.gt(quantity)) throw new Error('DISPOSAL_EXCEEDS_HOLDING');
    totalWithdrawals = totalWithdrawals.plus(amount);
    let remainingToConsume = units;
    let disposedCost = investmentDecimal(0);
    while (remainingToConsume.gt(0) && lots.length) {
      const lot = lots[0];
      const consumed = Decimal.min(lot.quantity, remainingToConsume);
      disposedCost = disposedCost.plus(consumed.mul(lot.unitCost));
      lot.quantity = lot.quantity.minus(consumed);
      remainingToConsume = remainingToConsume.minus(consumed);
      if (lot.quantity.isZero()) lots.shift();
    }
    // Balance-only government/NPS withdrawals may not provide units.
    if (units.isZero() && quantity.isZero()) {
      disposedCost = Decimal.min(remainingCostBasis, amount);
    }
    remainingCostBasis = Decimal.max(0, remainingCostBasis.minus(disposedCost));
    quantity = Decimal.max(0, quantity.minus(units));
    realizedReturn = realizedReturn.plus(amount.minus(disposedCost));
  }

  const prior = options.preserveValuation ?? account.summary ?? EMPTY_INVESTMENT_SUMMARY;
  const valuationPrice = options.valuationPrice ?? prior.valuationPrice;
  let currentValue = options.currentValue
    ? investmentDecimal(options.currentValue)
    : valuationPrice && quantity.gt(0)
      ? quantity.mul(valuationPrice)
      : investmentDecimal(prior.currentValue ?? opening?.currentValue ?? remainingCostBasis);
  if (
    quantity.isZero() &&
    (initialQuantity.gt(0) || transactions.some((item) => !!(item.quantity ?? item.units)))
  ) {
    currentValue = investmentDecimal(0);
  }
  const unrealizedReturn = currentValue.minus(remainingCostBasis);
  const overallReturn = realizedReturn.plus(unrealizedReturn);
  const percentage = totalContributions.isZero()
    ? investmentDecimal(0)
    : overallReturn.div(totalContributions).mul(100);

  return {
    totalContributions: moneyString(totalContributions),
    totalWithdrawals: moneyString(totalWithdrawals),
    remainingCostBasis: moneyString(remainingCostBasis),
    currentQuantity: decimalString(quantity),
    currentValue: moneyString(currentValue),
    realizedReturn: moneyString(realizedReturn),
    unrealizedReturn: moneyString(unrealizedReturn),
    overallReturnAmount: moneyString(overallReturn),
    overallReturnPercentage: decimalString(percentage, 4),
    currentRecurringAmount: account.recurringPlan?.amount,
    recurringFrequency: account.recurringPlan?.frequency,
    valuationPrice,
    valuationDate: options.valuationDate ?? prior.valuationDate,
    valuationSource: prior.valuationSource,
    lastRefreshedAt: options.lastRefreshedAt ?? prior.lastRefreshedAt,
    refreshStatus: prior.refreshStatus ?? 'STALE',
    appliedGovernmentRate: prior.appliedGovernmentRate,
  };
}

export function availableHoldingOnDate(
  account: Pick<InvestmentAccount, 'openingSnapshot'>,
  transactions: readonly InvestmentTransaction[],
  date: string,
): string {
  let holding = openingQuantity(account.openingSnapshot);
  for (const transaction of sortTransactions(transactions).filter((item) => item.date <= date)) {
    const units = transactionQuantity(transaction);
    holding = isContributionType(transaction.type) ? holding.plus(units) : holding.minus(units);
  }
  return decimalString(Decimal.max(0, holding));
}
