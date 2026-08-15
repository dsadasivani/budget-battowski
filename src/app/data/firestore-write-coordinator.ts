import type { Firestore } from 'firebase/firestore';

import type { BudgetCollectionName, BudgetDataMap, BudgetRecord } from '../budget.models';
import { ConcurrentModificationError, PersistenceError } from '../domain/errors';
import type { BudgetMutationSet } from '../domain/mutations/budget-mutations';
import { mutationEntries } from '../domain/mutations/budget-mutations';
import type { EntityMutations } from '../domain/mutations/entity-mutations';

/**
 * Rule-heavy records can read the workspace, mode, account, and recurring source while a write is
 * authorized. Five mutations therefore stay within Firestore's 20 document-access allowance for
 * a multi-document request even when none of those rule reads are cached.
 */
export const MAX_TRANSACTION_MUTATIONS = 5;
export const MAX_CONCURRENT_TRANSACTIONS = 5;
export const MAX_BATCH_WRITES = 100;

/** @deprecated Use the strategy-specific limit instead. */
export const SAFE_BATCH_SIZE = MAX_BATCH_WRITES;

const WORKSPACE_COLLECTION = 'budgetWorkspaces';

type CoordinatedOperation =
  | { collection: BudgetCollectionName; kind: 'create'; record: BudgetRecord }
  | {
      collection: BudgetCollectionName;
      kind: 'update';
      record: BudgetRecord;
      expectedVersion: number;
    }
  | {
      collection: BudgetCollectionName;
      kind: 'delete';
      id: string;
      expectedVersion?: number;
    };

export interface AtomicMutationGroup {
  readonly kind: 'atomic';
  readonly id: string;
  readonly mutations: BudgetMutationSet;
}

export interface IndependentMutationGroup {
  readonly kind: 'independent';
  readonly id: string;
  readonly mutations: BudgetMutationSet;
}

export interface MutationExecutionPlan {
  readonly atomicGroups?: readonly AtomicMutationGroup[];
  readonly independentGroups?: readonly IndependentMutationGroup[];
}

interface TransactionGroup {
  readonly id: string;
  readonly number: number;
  readonly operations: readonly CoordinatedOperation[];
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)]),
  ) as T;
}

function mutationOperations(mutationSet: BudgetMutationSet): CoordinatedOperation[] {
  return mutationEntries(mutationSet).flatMap(({ collection, mutations }) => [
    ...mutations.creates.map((record): CoordinatedOperation => ({
      collection,
      kind: 'create',
      record,
    })),
    ...mutations.updates.map((update): CoordinatedOperation => ({
      collection,
      kind: 'update',
      ...update,
    })),
    ...mutations.deletes.map((deletion): CoordinatedOperation => ({
      collection,
      kind: 'delete',
      ...deletion,
    })),
  ]);
}

function recordsMatch(current: Record<string, unknown>, desired: Record<string, unknown>): boolean {
  return Object.entries(desired).every(
    ([key, value]) => JSON.stringify(current[key]) === JSON.stringify(value),
  );
}

export function transactionGroupSizes(mutationSet: BudgetMutationSet): number[] {
  const operationCount = mutationOperations(mutationSet).length;
  const sizes: number[] = [];
  for (let offset = 0; offset < operationCount; offset += MAX_TRANSACTION_MUTATIONS) {
    sizes.push(Math.min(MAX_TRANSACTION_MUTATIONS, operationCount - offset));
  }
  return sizes;
}

export class FirestoreWriteCoordinator {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
  ) {}

  /**
   * Normal mutation sets contain independent versioned operations. Groups may commit independently,
   * so callers can replan and safely resume after a contextual failure. Already-applied updates and
   * missing deletes are idempotent; deterministic creates retain strict conflict protection.
   */
  async execute(mutationSet: BudgetMutationSet): Promise<void> {
    await this.executeIndependentOperations(mutationOperations(mutationSet), 'mutation-set');
  }

  /** Executes declared dependency groups atomically and independent work as resumable groups. */
  async executePlan(plan: MutationExecutionPlan): Promise<void> {
    const atomicGroups = plan.atomicGroups ?? [];
    for (let index = 0; index < atomicGroups.length; index += 1) {
      const group = atomicGroups[index];
      const operations = mutationOperations(group.mutations);
      if (operations.length > MAX_TRANSACTION_MUTATIONS) {
        throw new PersistenceError(
          `Atomic mutation group ${group.id} exceeds the security-rule-aware transaction limit.`,
          {
            workspaceId: this.workspaceId,
            operation: 'mutation-set',
            group: group.id,
            chunk: index + 1,
          },
        );
      }
      await this.executeGroup({ id: group.id, number: index + 1, operations });
    }

    for (const group of plan.independentGroups ?? []) {
      await this.executeIndependentOperations(mutationOperations(group.mutations), group.id);
    }
  }

  async executeCollection<TName extends BudgetCollectionName>(
    collectionName: TName,
    mutations: EntityMutations<BudgetDataMap[TName]>,
  ): Promise<void> {
    const operations: CoordinatedOperation[] = [
      ...mutations.creates.map((record) => ({
        collection: collectionName,
        kind: 'create' as const,
        record,
      })),
      ...mutations.updates.map((update) => ({
        collection: collectionName,
        kind: 'update' as const,
        ...update,
      })),
      ...mutations.deletes.map((deletion) => ({
        collection: collectionName,
        kind: 'delete' as const,
        ...deletion,
      })),
    ];
    await this.executeIndependentOperations(operations, collectionName);
  }

  private async executeIndependentOperations(
    operations: readonly CoordinatedOperation[],
    groupId: string,
  ): Promise<void> {
    const groups: TransactionGroup[] = [];
    for (let offset = 0; offset < operations.length; offset += MAX_TRANSACTION_MUTATIONS) {
      const number = Math.floor(offset / MAX_TRANSACTION_MUTATIONS) + 1;
      groups.push({
        id: `${groupId}:${number}`,
        number,
        operations: operations.slice(offset, offset + MAX_TRANSACTION_MUTATIONS),
      });
    }
    await this.runWithConcurrency(groups, (group) => this.executeGroup(group));
  }

  private async runWithConcurrency<T>(
    values: readonly T[],
    worker: (value: T) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;
    let firstFailure: unknown;
    const runWorker = async (): Promise<void> => {
      while (firstFailure === undefined) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) {
          return;
        }
        try {
          await worker(values[index]);
        } catch (error) {
          firstFailure = error;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_TRANSACTIONS, values.length) }, () =>
        runWorker(),
      ),
    );
    if (firstFailure !== undefined) {
      throw firstFailure;
    }
  }

  private async executeGroup(group: TransactionGroup): Promise<void> {
    if (!group.operations.length) {
      return;
    }
    try {
      await this.executeAtomicTransaction(group.operations);
    } catch (error) {
      if (error instanceof ConcurrentModificationError) {
        const operation = group.operations.find((candidate) => {
          const id = candidate.kind === 'delete' ? candidate.id : candidate.record.id;
          return candidate.collection === error.collection && id === error.recordId;
        });
        throw new ConcurrentModificationError(
          error.collection,
          error.recordId,
          error.message,
          { cause: error },
          {
            workspaceId: this.workspaceId,
            operation: operation?.kind ?? 'update',
            group: group.id,
            chunk: group.number,
          },
        );
      }
      const operation = group.operations[0];
      const recordId = operation.kind === 'delete' ? operation.id : operation.record.id;
      throw new PersistenceError(
        `Unable to persist mutation group ${group.id}.`,
        {
          workspaceId: this.workspaceId,
          collection: operation.collection,
          recordId,
          operation: operation.kind,
          group: group.id,
          chunk: group.number,
        },
        { cause: error },
      );
    }
  }

  private async executeAtomicTransaction(
    operations: readonly CoordinatedOperation[],
  ): Promise<void> {
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
    await runTransaction(this.db, async (transaction) => {
      const references = operations.map((operation) =>
        doc(
          this.db,
          WORKSPACE_COLLECTION,
          this.workspaceId,
          operation.collection,
          operation.kind === 'delete' ? operation.id : operation.record.id,
        ),
      );
      const snapshots = await Promise.all(
        references.map((reference) => transaction.get(reference)),
      );

      operations.forEach((operation, index) => {
        const snapshot = snapshots[index];
        const recordId = operation.kind === 'delete' ? operation.id : operation.record.id;
        if (operation.kind === 'create') {
          const { id: _id, version: _version, ...recordData } = operation.record;
          const desired = stripUndefined(recordData) as Record<string, unknown>;
          if (snapshot.exists()) {
            throw new ConcurrentModificationError(operation.collection, recordId);
          }
          transaction.set(references[index], {
            ...desired,
            version: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return;
        }

        if (!snapshot.exists()) {
          if (operation.kind === 'delete') {
            return;
          }
          throw new ConcurrentModificationError(operation.collection, recordId);
        }
        const current = snapshot.data();
        const currentVersion = Number(current['version'] ?? 0);
        if (operation.kind === 'delete') {
          if (
            operation.expectedVersion !== undefined &&
            currentVersion !== operation.expectedVersion
          ) {
            throw new ConcurrentModificationError(operation.collection, recordId);
          }
          transaction.delete(references[index]);
          return;
        }

        const { id: _id, version: _version, ...recordData } = operation.record;
        const desired = stripUndefined(recordData) as Record<string, unknown>;
        if (currentVersion !== operation.expectedVersion) {
          if (currentVersion === operation.expectedVersion + 1 && recordsMatch(current, desired)) {
            return;
          }
          throw new ConcurrentModificationError(operation.collection, recordId);
        }
        transaction.set(
          references[index],
          {
            ...desired,
            version: currentVersion + 1,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });
    });
  }
}
