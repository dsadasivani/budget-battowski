import type { Firestore } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import type { BudgetMutationSet } from '../domain/mutations/budget-mutations';
import {
  FirestoreWriteCoordinator,
  MAX_BATCH_WRITES,
  MAX_CONCURRENT_TRANSACTIONS,
  MAX_TRANSACTION_MUTATIONS,
  transactionGroupSizes,
} from './firestore-write-coordinator';

function categoryCreates(count: number): BudgetMutationSet {
  return {
    categories: {
      creates: Array.from({ length: count }, (_, index) => ({
        id: `category-${index}`,
        name: `Category ${index}`,
        monthlyBudget: 0,
        color: '#000000',
        type: 'Expenses' as const,
      })),
      updates: [],
      deletes: [],
    },
  };
}

describe('Firestore write coordinator', () => {
  it('centralizes rule-aware transaction, batch, and concurrency limits', () => {
    expect(MAX_TRANSACTION_MUTATIONS).toBe(5);
    expect(MAX_TRANSACTION_MUTATIONS * 4).toBeLessThanOrEqual(20);
    expect(MAX_BATCH_WRITES).toBe(100);
    expect(MAX_BATCH_WRITES).toBeLessThan(500);
    expect(MAX_CONCURRENT_TRANSACTIONS).toBe(5);
  });

  it('splits independent mutations into small transaction groups', () => {
    expect(transactionGroupSizes(categoryCreates(12))).toEqual([5, 5, 2]);
  });

  it('rejects an oversized dependency group instead of silently splitting atomic work', async () => {
    const coordinator = new FirestoreWriteCoordinator({} as Firestore, 'workspace-a');

    await expect(
      coordinator.executePlan({
        atomicGroups: [
          {
            kind: 'atomic',
            id: 'dependent-review',
            mutations: categoryCreates(6),
          },
        ],
      }),
    ).rejects.toMatchObject({
      name: 'PersistenceError',
      context: {
        workspaceId: 'workspace-a',
        operation: 'mutation-set',
        group: 'dependent-review',
        chunk: 1,
      },
    });
  });
});
