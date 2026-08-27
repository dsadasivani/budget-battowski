import { describe, expect, it } from 'vitest';

import { addLoanMonths, loanYearFraction } from './loan-date';

describe('loan dates', () => {
  it('clamps a nominal day and restores it in a later month', () => {
    expect(addLoanMonths('2024-01-31', 1, 31)).toBe('2024-02-29');
    expect(addLoanMonths('2024-01-31', 2, 31)).toBe('2024-03-31');
    expect(addLoanMonths('2024-01-31', 3, 31)).toBe('2024-04-30');
  });

  it('handles leap-year actual/actual accrual', () => {
    expect(loanYearFraction('2024-02-28', '2024-03-01', 'actual-actual').toNumber()).toBeCloseTo(
      2 / 366,
      12,
    );
    expect(loanYearFraction('2025-02-28', '2025-03-01', 'actual-actual').toNumber()).toBeCloseTo(
      1 / 365,
      12,
    );
  });

  it('supports actual/360 accrual', () => {
    expect(loanYearFraction('2026-01-01', '2026-01-31', 'actual-360').toNumber()).toBeCloseTo(
      30 / 360,
      12,
    );
  });
});
