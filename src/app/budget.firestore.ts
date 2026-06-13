import type { FirebaseApp } from 'firebase/app';
import type { Firestore, Unsubscribe } from 'firebase/firestore';

import { getBudgetFirestore } from './firebase.client';
import type {
  BudgetCollectionName,
  BudgetDataMap,
  BudgetRecord,
  ExpenseEntry,
  ExpenseTemplate,
  InvestmentEntry,
  Workspace,
} from './budget.models';

const WORKSPACE_COLLECTION = 'budgetWorkspaces';

type FirestoreRecord<T extends BudgetRecord> = Omit<T, 'id'> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

function workspaceWithoutId(workspace: Workspace): Omit<Workspace, 'id'> {
  const { id: _id, ...data } = workspace;
  return data;
}

function activeMemberEmails(workspace: Workspace): string[] {
  return workspace.members.filter((member) => !member.archivedDate).map((member) => member.email);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefined(entryValue)]),
  ) as T;
}

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

  static async listAccessibleWorkspaces(app: FirebaseApp, userEmail: string): Promise<Workspace[]> {
    const { collection, getDocs, getFirestore, query, where } = await import('firebase/firestore');
    const db = getFirestore(app);
    const workspacesRef = collection(db, WORKSPACE_COLLECTION);
    const snapshot = await getDocs(
      query(workspacesRef, where('memberEmails', 'array-contains', userEmail)),
    );

    return snapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() as Omit<Workspace, 'id'> & {
          memberEmails?: string[];
        };
        return {
          id: docSnapshot.id,
          ...data,
        } as Workspace;
      })
      .filter((workspace) => !workspace.archivedDate)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  static async ensureLegacyWorkspace(
    app: FirebaseApp,
    userEmail: string,
    displayName: string,
  ): Promise<Workspace> {
    const { doc, getDoc, getFirestore, serverTimestamp, setDoc } =
      await import('firebase/firestore');
    const db = getFirestore(app);
    const workspaceRef = doc(db, WORKSPACE_COLLECTION, userEmail);
    const snapshot = await getDoc(workspaceRef);

    if (snapshot.exists()) {
      const data = snapshot.data() as Omit<Workspace, 'id'>;
      if (Array.isArray(data.members) && data.ownerEmail) {
        return { id: snapshot.id, ...data } as Workspace;
      }
    }

    const today = new Date().toISOString();
    const workspace: Workspace = {
      id: userEmail,
      name: `${displayName || userEmail}'s workspace`,
      ownerEmail: userEmail,
      members: [
        {
          email: userEmail,
          displayName: displayName || userEmail,
          role: 'owner',
          createdDate: today,
        },
      ],
      createdDate: today,
      updatedDate: today,
    };

    await setDoc(
      workspaceRef,
      {
        ...stripUndefined(workspaceWithoutId(workspace)),
        memberEmails: [userEmail],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return workspace;
  }

  static async createWorkspace(
    app: FirebaseApp,
    ownerEmail: string,
    ownerDisplayName: string,
    name: string,
  ): Promise<Workspace> {
    const { collection, doc, getFirestore, serverTimestamp, setDoc } =
      await import('firebase/firestore');
    const db = getFirestore(app);
    const workspaceRef = doc(collection(db, WORKSPACE_COLLECTION));
    const today = new Date().toISOString();
    const workspace: Workspace = {
      id: workspaceRef.id,
      name: name.trim() || 'New workspace',
      ownerEmail,
      members: [
        {
          email: ownerEmail,
          displayName: ownerDisplayName || ownerEmail,
          role: 'owner',
          createdDate: today,
        },
      ],
      createdDate: today,
      updatedDate: today,
    };

    await setDoc(workspaceRef, {
      ...stripUndefined(workspaceWithoutId(workspace)),
      memberEmails: [ownerEmail],
      updatedAt: serverTimestamp(),
    });

    return workspace;
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = await this.database();

    await setDoc(
      doc(db, WORKSPACE_COLLECTION, workspace.id),
      {
        ...stripUndefined(workspaceWithoutId(workspace)),
        memberEmails: activeMemberEmails(workspace),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async upsert<TName extends BudgetCollectionName>(
    collectionName: TName,
    record: BudgetDataMap[TName],
  ): Promise<void> {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = await this.database();
    const { id, ...data } = record;

    await setDoc(doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, id), {
      ...stripUndefined(data),
      updatedAt: serverTimestamp(),
    });
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
      batch.set(doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, id), {
        ...stripUndefined(data),
        updatedAt: timestamp,
      });
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
        return `${rightExpense.date ?? rightExpense.month}-${rightExpense.name}`.localeCompare(
          `${leftExpense.date ?? leftExpense.month}-${leftExpense.name}`,
        );
      }

      if (collectionName === 'investments') {
        const leftInvestment = left as InvestmentEntry;
        const rightInvestment = right as InvestmentEntry;
        return `${rightInvestment.date ?? rightInvestment.startDate ?? ''}-${rightInvestment.name}`.localeCompare(
          `${leftInvestment.date ?? leftInvestment.startDate ?? ''}-${leftInvestment.name}`,
        );
      }

      if (collectionName === 'categories') {
        return (left as { name: string }).name.localeCompare((right as { name: string }).name);
      }

      if (collectionName === 'loans') {
        return (left as { loanType: string }).loanType.localeCompare(
          (right as { loanType: string }).loanType,
        );
      }

      return (left as { id: string }).id.localeCompare((right as { id: string }).id);
    });
  }
}
