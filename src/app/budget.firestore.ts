import type { FirebaseApp } from 'firebase/app';
import type { Firestore, Unsubscribe } from 'firebase/firestore';

import { getBudgetFirestore } from './firebase.client';
import type {
  BudgetCollectionName,
  BudgetDataMap,
  BudgetRecord,
  CategoryRemapOperation,
  CategoryRemapStep,
  ExpenseEntry,
  InvestmentEntry,
  UserProfile,
  Workspace,
} from './budget.models';

const WORKSPACE_COLLECTION = 'budgetWorkspaces';
const PROFILE_COLLECTION = 'budgetUserProfiles';
const CATEGORY_REMAP_COLLECTION = 'categoryRemapOperations';
const CATEGORY_REMAP_STEPS: CategoryRemapStep[] = [
  'categories',
  'expenses',
  'templates',
  'incomes',
  'investments',
];

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
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  static async deleteWorkspace(app: FirebaseApp, workspaceId: string): Promise<void> {
    const { collection, deleteDoc, doc, getDocs, getFirestore, writeBatch } =
      await import('firebase/firestore');
    const db = getFirestore(app);
    const collectionNames: Array<BudgetCollectionName | typeof CATEGORY_REMAP_COLLECTION> = [
      'paymentAccounts',
      'paymentModes',
      'categories',
      'incomes',
      'templates',
      'expenses',
      'investments',
      'loans',
      CATEGORY_REMAP_COLLECTION,
    ];

    for (const collectionName of collectionNames) {
      const snapshot = await getDocs(
        collection(db, WORKSPACE_COLLECTION, workspaceId, collectionName),
      );
      let batch = writeBatch(db);
      let operationCount = 0;

      for (const docSnapshot of snapshot.docs) {
        batch.delete(docSnapshot.ref);
        operationCount += 1;

        if (operationCount === 450) {
          await batch.commit();
          batch = writeBatch(db);
          operationCount = 0;
        }
      }

      if (operationCount) {
        await batch.commit();
      }
    }

    await deleteDoc(doc(db, WORKSPACE_COLLECTION, workspaceId));
  }

  static async ensureLegacyWorkspace(
    app: FirebaseApp,
    userEmail: string,
    displayName: string,
    photoUrl?: string,
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
          photoUrl,
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
    ownerProfile: UserProfile,
    name: string,
    editorProfiles: UserProfile[] = [],
  ): Promise<Workspace> {
    const { collection, doc, getFirestore, serverTimestamp, setDoc } =
      await import('firebase/firestore');
    const db = getFirestore(app);
    const workspaceRef = doc(collection(db, WORKSPACE_COLLECTION));
    const today = new Date().toISOString();
    const ownerEmail = ownerProfile.email;
    const workspace: Workspace = {
      id: workspaceRef.id,
      name: name.trim() || 'New workspace',
      ownerEmail,
      members: [
        {
          email: ownerEmail,
          displayName: ownerProfile.displayName || ownerEmail,
          photoUrl: ownerProfile.photoUrl,
          role: 'owner',
          createdDate: today,
        },
        ...editorProfiles.map((profile) => ({
          email: profile.email,
          displayName: profile.displayName || profile.email,
          photoUrl: profile.photoUrl,
          role: 'editor' as const,
          createdDate: today,
        })),
      ],
      createdDate: today,
      updatedDate: today,
    };

    await setDoc(workspaceRef, {
      ...stripUndefined(workspaceWithoutId(workspace)),
      memberEmails: activeMemberEmails(workspace),
      updatedAt: serverTimestamp(),
    });

    return workspace;
  }

  static async upsertUserProfile(app: FirebaseApp, profile: UserProfile): Promise<void> {
    const { doc, getFirestore, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = getFirestore(app);

    await setDoc(
      doc(db, PROFILE_COLLECTION, profile.email),
      {
        ...stripUndefined(profile),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  static async findUserProfile(app: FirebaseApp, email: string): Promise<UserProfile | null> {
    const { doc, getDoc, getFirestore } = await import('firebase/firestore');
    const db = getFirestore(app);
    const snapshot = await getDoc(doc(db, PROFILE_COLLECTION, email));

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data() as UserProfile;
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

  async saveCategoryRemapOperation(operation: CategoryRemapOperation): Promise<void> {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = await this.database();
    const { id, ...data } = operation;
    await setDoc(
      doc(db, WORKSPACE_COLLECTION, this.workspaceId, CATEGORY_REMAP_COLLECTION, id),
      { ...stripUndefined(data), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  async pendingCategoryRemapOperations(): Promise<CategoryRemapOperation[]> {
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const db = await this.database();
    const snapshot = await getDocs(
      query(
        collection(db, WORKSPACE_COLLECTION, this.workspaceId, CATEGORY_REMAP_COLLECTION),
        where('status', 'in', ['pending', 'running', 'failed']),
      ),
    );
    return snapshot.docs.map((snapshotDocument) => ({
      id: snapshotDocument.id,
      ...snapshotDocument.data(),
    })) as CategoryRemapOperation[];
  }

  async executeCategoryRemapOperation(operation: CategoryRemapOperation): Promise<void> {
    const { collection, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } =
      await import('firebase/firestore');
    const db = await this.database();
    const operationRef = doc(
      db,
      WORKSPACE_COLLECTION,
      this.workspaceId,
      CATEGORY_REMAP_COLLECTION,
      operation.id,
    );
    const completedSteps = new Set(operation.completedSteps ?? []);
    const updateOperation = async (
      changes: Partial<Omit<CategoryRemapOperation, 'id'>>,
    ): Promise<void> => {
      await setDoc(
        operationRef,
        {
          ...stripUndefined(changes),
          updatedDate: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    };

    await updateOperation({
      status: 'running',
      attempts: (operation.attempts ?? 0) + 1,
      lastError: '',
    });

    try {
      if (!completedSteps.has('categories')) {
        if (operation.replacementCategory) {
          const { id: replacementId, ...replacementData } = operation.replacementCategory;
          await setDoc(
            doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'categories', replacementId),
            { ...stripUndefined(replacementData), updatedAt: serverTimestamp() },
            { merge: true },
          );
        }
        await setDoc(
          doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'categories', operation.sourceCategoryId),
          { archivedDate: operation.sourceArchivedDate, updatedAt: serverTimestamp() },
          { merge: true },
        );
        completedSteps.add('categories');
        await updateOperation({ completedSteps: [...completedSteps] });
      }

      for (const step of CATEGORY_REMAP_STEPS.filter((item) => item !== 'categories')) {
        if (completedSteps.has(step)) {
          continue;
        }
        const snapshot = await getDocs(
          query(
            collection(db, WORKSPACE_COLLECTION, this.workspaceId, step),
            where('categoryId', '==', operation.sourceCategoryId),
          ),
        );
        for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
          const batch = writeBatch(db);
          for (const snapshotDocument of snapshot.docs.slice(offset, offset + 400)) {
            batch.update(snapshotDocument.ref, {
              categoryId: operation.replacementCategoryId,
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
        completedSteps.add(step);
        await updateOperation({ completedSteps: [...completedSteps] });
      }

      await updateOperation({
        status: 'completed',
        completedSteps: [...completedSteps],
        lastError: '',
      });
    } catch (error) {
      await updateOperation({
        status: 'failed',
        completedSteps: [...completedSteps],
        lastError: error instanceof Error ? error.message : 'Category remap failed.',
      });
      throw error;
    }
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

      if (collectionName === 'paymentModes') {
        const leftMode = left as { archivedDate?: string; name: string; type: string };
        const rightMode = right as { archivedDate?: string; name: string; type: string };
        if (!!leftMode.archivedDate !== !!rightMode.archivedDate) {
          return leftMode.archivedDate ? 1 : -1;
        }

        return `${leftMode.type}-${leftMode.name}`.localeCompare(
          `${rightMode.type}-${rightMode.name}`,
        );
      }

      if (collectionName === 'paymentAccounts') {
        const leftAccount = left as { archivedDate?: string; bankName: string; name: string };
        const rightAccount = right as { archivedDate?: string; bankName: string; name: string };
        if (!!leftAccount.archivedDate !== !!rightAccount.archivedDate) {
          return leftAccount.archivedDate ? 1 : -1;
        }

        return `${leftAccount.bankName}-${leftAccount.name}`.localeCompare(
          `${rightAccount.bankName}-${rightAccount.name}`,
        );
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
