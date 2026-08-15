import { describe, expect, it } from 'vitest';
import { effectiveValueForDate } from './effective-dating-engine';
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
});
