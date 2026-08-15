import { describe, expect, it } from 'vitest';
import { occurrencesForMonth, scheduleForMonth } from './recurrence-engine';

describe('recurrence engine', () => {
  it.each([
    ['2026-01-31', '2026-02', '2026-02-28'],
    ['2026-01-31', '2026-03', '2026-03-31'],
    ['2026-01-30', '2026-02', '2026-02-28'],
    ['2024-01-29', '2024-02', '2024-02-29'],
    ['2025-01-29', '2025-02', '2025-02-28'],
  ])('preserves the nominal monthly day for %s in %s', (startDate, month, expected) => {
    expect(scheduleForMonth({ frequency: 'monthly', startDate, amount: 10 }, month)?.date).toBe(
      expected,
    );
  });

  it('counts weekly occurrences crossing a month', () => {
    expect(
      scheduleForMonth({ frequency: 'weekly', startDate: '2026-01-29', amount: 10 }, '2026-02'),
    ).toEqual({ amount: 40, date: '2026-02-05', occurrences: 4 });
  });

  it.each([
    ['quarterly', '2026-04'],
    ['half-yearly', '2026-07'],
    ['annual', '2027-01'],
  ] as const)('supports %s recurrence', (frequency, month) =>
    expect(
      scheduleForMonth({ frequency, startDate: '2026-01-15', amount: 10 }, month),
    ).not.toBeNull(),
  );

  it('honors exact end and effective-start boundaries', () => {
    expect(
      occurrencesForMonth(
        {
          frequency: 'monthly',
          startDate: '2026-01-31',
          endDate: '2026-04-30',
          effectiveStartDate: '2026-03-01',
          amount: 10,
        },
        '2026-04',
      ),
    ).toEqual([{ date: '2026-04-30', amount: 10 }]);
    expect(
      occurrencesForMonth(
        { frequency: 'monthly', startDate: '2026-01-31', endDate: '2026-04-29', amount: 10 },
        '2026-04',
      ),
    ).toEqual([]);
  });

  it('supports one-time occurrences and skipped months', () => {
    expect(
      occurrencesForMonth(
        { frequency: 'one-time', startDate: '2026-06-12', amount: 25 },
        '2026-06',
      ),
    ).toHaveLength(1);
    expect(
      occurrencesForMonth(
        { frequency: 'monthly', startDate: '2026-01-12', amount: 25, skippedMonths: ['2026-06'] },
        '2026-06',
      ),
    ).toEqual([]);
  });
});
