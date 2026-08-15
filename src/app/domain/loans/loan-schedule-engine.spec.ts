import { describe, expect, it } from 'vitest';
import { isLoanOccurrenceInRange, loanOccurrenceDate } from './loan-schedule-engine';

describe('loan schedule engine', () => {
  it.each([
    ['2026-01-28', '2026-02', '2026-02-28'],
    ['2024-01-29', '2024-02', '2024-02-29'],
    ['2025-01-29', '2025-02', '2025-02-28'],
    ['2026-01-30', '2026-02', '2026-02-28'],
    ['2026-01-31', '2026-04', '2026-04-30'],
  ])('clamps %s in %s', (startDate, month, expected) => {
    expect(loanOccurrenceDate(month, startDate)).toBe(expected);
  });

  it('honors start, exact end, and effective-date boundaries', () => {
    expect(isLoanOccurrenceInRange('2026-01', '2026-01-31', '2026-03-31')).toBe(true);
    expect(isLoanOccurrenceInRange('2026-03', '2026-01-31', '2026-03-30')).toBe(false);
    expect(isLoanOccurrenceInRange('2026-02', '2026-01-31', undefined, '2026-03-01')).toBe(false);
  });
});
