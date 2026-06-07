import type { FirebaseApp } from 'firebase/app';
import type { Firestore, Unsubscribe } from 'firebase/firestore';

import { getBudgetFirestore } from './firebase.client';
import type {
  BudgetCollectionName,
  BudgetDataMap,
  BudgetRecord,
  ExpenseEntry,
  ExpenseTemplate,
} from './budget.models';

const WORKSPACE_COLLECTION = 'budgetWorkspaces';

type FirestoreRecord<T extends BudgetRecord> = Omit<T, 'id'> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

export class BudgetFirestoreRepository {
  private db?: Firestore;

  constructor(
    private readonly app: FirebaseApp,
    private readonly workspaceId: string,
  ) {}

  async listen<TName extends BudgetCollectionName>(
    collectionName: TName,
    next: (records: BudgetDataMap[TName][]) => void,
    error: (message: string) => void,
  ): Promise<Unsubscribe> {
    const { collection, onSnapshot } = await import('firebase/firestore');
    const db = await this.database();
    const collectionRef = collection(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName);

    return onSnapshot(
      collectionRef,
      (snapshot) => {
        const records = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as FirestoreRecord<BudgetDataMap[TName]>;
          const { createdAt: _createdAt, updatedAt: _updatedAt, ...record } = data;

          return {
            id: docSnapshot.id,
            ...record,
          } as BudgetDataMap[TName];
        });

        next(this.sortRecords(collectionName, records));
      },
      (snapshotError) => error(snapshotError.message),
    );
  }

  async upsert<TName extends BudgetCollectionName>(
    collectionName: TName,
    record: BudgetDataMap[TName],
  ): Promise<void> {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = await this.database();
    const { id, ...data } = record;

    await setDoc(
      doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, id),
      {
        ...data,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async upsertMany<TName extends BudgetCollectionName>(
    collectionName: TName,
    records: BudgetDataMap[TName][],
  ): Promise<void> {
    if (!records.length) {
      return;
    }

    const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const db = await this.database();
    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    for (const record of records) {
      const { id, ...data } = record;
      batch.set(
        doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, id),
        {
          ...data,
          updatedAt: timestamp,
        },
        { merge: true },
      );
    }

    await batch.commit();
  }

  async delete(collectionName: BudgetCollectionName, recordId: string): Promise<void> {
    const { deleteDoc, doc } = await import('firebase/firestore');
    const db = await this.database();

    await deleteDoc(doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, recordId));
  }

  async deleteCategory(
    categoryId: string,
    affectedTemplates: ExpenseTemplate[],
    affectedExpenses: ExpenseEntry[],
  ): Promise<void> {
    const { deleteField, doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const db = await this.database();
    const batch = writeBatch(db);
    const timestamp = serverTimestamp();

    batch.delete(doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'categories', categoryId));

    for (const template of affectedTemplates) {
      batch.delete(doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'templates', template.id));
    }

    for (const expense of affectedExpenses) {
      batch.set(
        doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'expenses', expense.id),
        {
          categoryId: '',
          updatedAt: timestamp,
          templateId: deleteField(),
        },
        { merge: true },
      );
    }

    await batch.commit();
  }

  private async database(): Promise<Firestore> {
    this.db ??= await getBudgetFirestore(this.app);
    return this.db;
  }

  private sortRecords<TName extends BudgetCollectionName>(
    collectionName: TName,
    records: BudgetDataMap[TName][],
  ): BudgetDataMap[TName][] {
    return [...records].sort((left, right) => {
      if (collectionName === 'expenses') {
        const leftExpense = left as ExpenseEntry;
        const rightExpense = right as ExpenseEntry;
        return `${rightExpense.month}-${rightExpense.name}`.localeCompare(`${leftExpense.month}-${leftExpense.name}`);
      }

      if (collectionName === 'categories') {
        return (left as { name: string }).name.localeCompare((right as { name: string }).name);
      }

      if (collectionName === 'loans') {
        return (left as { loanType: string }).loanType.localeCompare((right as { loanType: string }).loanType);
      }

      return (left as { id: string }).id.localeCompare((right as { id: string }).id);
    });
  }
}
