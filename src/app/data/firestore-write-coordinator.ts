import type { Firestore } from 'firebase/firestore';

import type { BudgetCollectionName, BudgetDataMap, BudgetRecord } from '../budget.models';
import { ConcurrentModificationError, PersistenceError } from '../domain/errors';
import type { BudgetMutationSet } from '../domain/mutations/budget-mutations';
import { mutationEntries } from '../domain/mutations/budget-mutations';
import type { EntityMutations } from '../domain/mutations/entity-mutations';

export const SAFE_BATCH_SIZE = 200;

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

export class FirestoreWriteCoordinator {
  constructor(
    private readonly db: Firestore,
    private readonly workspaceId: string,
  ) {}

  async execute(mutationSet: BudgetMutationSet): Promise<void> {
    const operations = mutationEntries(mutationSet).flatMap(({ collection, mutations }) => [
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

    for (let offset = 0; offset < operations.length; offset += SAFE_BATCH_SIZE) {
      const chunkNumber = Math.floor(offset / SAFE_BATCH_SIZE) + 1;
      try {
        await this.executeAtomicChunk(operations.slice(offset, offset + SAFE_BATCH_SIZE));
      } catch (error) {
        if (error instanceof ConcurrentModificationError) {
          throw error;
        }
        throw new PersistenceError(
          `Unable to persist budget mutation chunk ${chunkNumber}.`,
          {
            workspaceId: this.workspaceId,
            operation: 'mutation-set',
            chunk: chunkNumber,
          },
          { cause: error },
        );
      }
    }
  }

  async executeCollection<TName extends BudgetCollectionName>(
    collectionName: TName,
    mutations: EntityMutations<BudgetDataMap[TName]>,
  ): Promise<void> {
    const operations = [
      ...mutations.creates.map((record) => ({ kind: 'create' as const, record })),
      ...mutations.updates.map((update) => ({ kind: 'update' as const, ...update })),
      ...mutations.deletes.map((deletion) => ({ kind: 'delete' as const, ...deletion })),
    ];

    for (let offset = 0; offset < operations.length; offset += SAFE_BATCH_SIZE) {
      const chunk = operations.slice(offset, offset + SAFE_BATCH_SIZE);
      const chunkNumber = Math.floor(offset / SAFE_BATCH_SIZE) + 1;
      try {
        await this.executeAtomicChunk(
          chunk.map((operation) => ({ collection: collectionName, ...operation })),
        );
      } catch (error) {
        if (error instanceof ConcurrentModificationError) {
          throw error;
        }
        throw new PersistenceError(
          `Unable to persist ${collectionName} mutation chunk ${chunkNumber}.`,
          {
            workspaceId: this.workspaceId,
            collection: collectionName,
            operation: 'mutation-set',
            chunk: chunkNumber,
          },
          { cause: error },
        );
      }
    }
  }

  private async executeAtomicChunk(operations: CoordinatedOperation[]): Promise<void> {
    if (!operations.length) {
      return;
    }

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
          if (snapshot.exists()) {
            throw new ConcurrentModificationError(operation.collection, recordId);
          }
          const { id: _id, version: _version, ...data } = operation.record;
          transaction.set(references[index], {
            ...stripUndefined(data),
            version: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          return;
        }

        if (!snapshot.exists()) {
          throw new ConcurrentModificationError(operation.collection, recordId);
        }
        const currentVersion = Number(snapshot.data()['version'] ?? 0);
        if (
          operation.expectedVersion !== undefined &&
          currentVersion !== operation.expectedVersion
        ) {
          throw new ConcurrentModificationError(operation.collection, recordId);
        }
        if (operation.kind === 'delete') {
          transaction.delete(references[index]);
          return;
        }
        const { id: _id, version: _version, ...data } = operation.record;
        transaction.set(
          references[index],
          {
            ...stripUndefined(data),
            version: currentVersion + 1,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });
    });
  }
}
