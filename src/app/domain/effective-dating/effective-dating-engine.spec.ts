import { describe, expect, it } from 'vitest';
import { effectiveValueForDate, effectiveValueForOccurrence } from './effective-dating-engine';
import type { EffectiveDatedVersion } from './effective-dating.models';

type AmountVersion = EffectiveDatedVersion & { amount: number };

describe('effective dating engine', () => {
  it('keeps Jan-Mar historical and applies the current value from April', () => {
    const current = { amount: 200, effectiveStartDate: '2026-04-01' };
    const history = [
      { amount: 100, effectiveStartDate: '2026-01-01', effectiveEndDate: '2026-03-31' },
    ];
    expect(effectiveValueForDate(current, history, '2026-03-15')?.value.amount).toBe(100);
    expect(effectiveValueForDate(current, history, '2026-04-15')?.value.amount).toBe(200);
    expect(effectiveValueForDate(current, history, '2026-05-15')?.value.amount).toBe(200);
  });

  it('stops a deleted version while preserving prior history', () => {
    const current: AmountVersion = {
      amount: 200,
      operation: 'deleted',
      effectiveStartDate: '2026-06-15',
    };
    const history: AmountVersion[] = [
      { amount: 100, effectiveStartDate: '2026-01-01', effectiveEndDate: '2026-06-14' },
    ];
    expect(effectiveValueForDate(current, history, '2026-06-14')?.value.amount).toBe(100);
    expect(effectiveValueForDate(current, history, '2026-06-15')).toBeNull();
  });

  it.each(['expense template', 'income', 'investment', 'loan'])(
    'resolves production-shaped %s values across an April boundary',
    (domain) => {
      const current = {
        domain,
        amount: 12000,
        effectiveStartDate: '2026-04-01',
        occurrenceDate: '2026-04-05',
      };
      const history = [
        {
          domain,
          amount: 10000,
          effectiveStartDate: '2026-01-01',
          effectiveEndDate: '2026-03-31',
          occurrenceDate: '2026-03-05',
        },
      ];

      expect(
        effectiveValueForOccurrence(current, history, (value) => value.occurrenceDate)?.value
          .amount,
      ).toBe(10000);
      expect(
        effectiveValueForOccurrence(current, [], (value) => value.occurrenceDate)?.value.amount,
      ).toBe(12000);
    },
  );

  it('uses a closed historical loan version before deletion and no current value afterwards', () => {
    const closedLoan = {
      amount: 10000,
      emi: 10000,
      effectiveStartDate: '2026-01-01',
      effectiveEndDate: '2026-06-14',
      occurrenceDate: '2026-06-05',
    };
    const deletedLoan: AmountVersion & { occurrenceDate: string } = {
      amount: 0,
      occurrenceDate: '2026-06-15',
      effectiveStartDate: '2026-06-15',
      operation: 'deleted',
    };
    expect(
      effectiveValueForOccurrence(deletedLoan, [closedLoan], (value) => value.occurrenceDate)
        ?.value,
    ).toMatchObject({ emi: 10000 });
    expect(
      effectiveValueForOccurrence(deletedLoan, [], (value) => value.occurrenceDate),
    ).toBeNull();
  });
});
