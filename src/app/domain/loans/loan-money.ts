import Decimal from 'decimal.js';

import type { LoanRoundingPolicy } from './loan.models';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal.Value;

function roundingMode(mode: LoanRoundingPolicy['interestRounding']): Decimal.Rounding {
  return mode === 'half-even' ? Decimal.ROUND_HALF_EVEN : Decimal.ROUND_HALF_UP;
}

export function decimal(value: MoneyInput): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite()) {
    throw new Error('Loan calculations require finite numeric values.');
  }
  return result;
}

export function roundMoney(
  value: MoneyInput,
  policy: Pick<LoanRoundingPolicy, 'monetaryScale' | 'interestRounding'>,
): Decimal {
  return decimal(value).toDecimalPlaces(
    policy.monetaryScale,
    roundingMode(policy.interestRounding),
  );
}

export function roundInstallment(value: MoneyInput, policy: LoanRoundingPolicy): Decimal {
  return decimal(value).toDecimalPlaces(
    policy.monetaryScale,
    policy.installmentRounding === 'half-even' ? Decimal.ROUND_HALF_EVEN : Decimal.ROUND_HALF_UP,
  );
}

export function moneyNumber(value: MoneyInput): number {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function calculateEmi(
  principal: MoneyInput,
  annualRate: number,
  periods: number,
  policy: LoanRoundingPolicy,
): number {
  const amount = decimal(principal);
  if (amount.lte(0) || periods <= 0) {
    return 0;
  }
  if (annualRate === 0) {
    return roundInstallment(amount.div(periods), policy).toNumber();
  }
  const monthlyRate = decimal(annualRate).div(1200);
  const factor = monthlyRate.plus(1).pow(periods);
  return roundInstallment(
    amount.mul(monthlyRate).mul(factor).div(factor.minus(1)),
    policy,
  ).toNumber();
}
