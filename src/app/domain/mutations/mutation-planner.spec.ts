import { describe, expect, it } from 'vitest';
import { planEntityMutations } from './mutation-planner';

describe('mutation planner', () => {
  it('emits only creates, meaningful updates, and explicit deletes', () => {
    const original = [
      { id: 'same', name: 'Same', version: 2 },
      { id: 'changed', name: 'Old', version: 4 },
      { id: 'deleted', name: 'Delete', version: 1 },
    ];
    const next = [
      { id: 'same', name: 'Same', version: 99 },
      { id: 'changed', name: 'New', version: 4 },
      { id: 'created', name: 'Create' },
    ];
    const result = planEntityMutations(original, next, ['deleted']);
    expect(result.creates.map(({ id }) => id)).toEqual(['created']);
    expect(result.updates).toEqual([{ record: next[1], expectedVersion: 4 }]);
    expect(result.deletes).toEqual([{ id: 'deleted', expectedVersion: 1 }]);
  });
});
