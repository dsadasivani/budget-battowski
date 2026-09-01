import Decimal from 'decimal.js';

import type { DecimalString } from './investment.models';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type InvestmentDecimalInput = Decimal.Value;

export function investmentDecimal(value: InvestmentDecimalInput | undefined): Decimal {
  const result = new Decimal(value ?? 0);
  if (!result.isFinite()) throw new Error('Investment calculations require finite values.');
  return result;
}

export function decimalString(value: InvestmentDecimalInput, scale = 8): DecimalString {
  const rounded = investmentDecimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
  if (rounded.isZero()) return '0';
  const fixed = rounded.toFixed();
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

export function moneyString(value: InvestmentDecimalInput): DecimalString {
  return decimalString(investmentDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP), 2);
}

export function displayNumber(value: InvestmentDecimalInput): number {
  return investmentDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
