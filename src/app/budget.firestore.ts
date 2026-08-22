import type { FirebaseApp } from 'firebase/app';
import type { DocumentReference, Firestore, Unsubscribe } from 'firebase/firestore';

import { getBudgetFirestore } from './firebase.client';
import { FirestoreWriteCoordinator, MAX_BATCH_WRITES } from './data/firestore-write-coordinator';
import { normalizeEmail } from './domain/identity/identity';
import type { BudgetMutationSet } from './domain/mutations/budget-mutations';
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
  WorkspaceMember,
} from './budget.models';

const WORKSPACE_COLLECTION = 'budgetWorkspaces';
const USER_DIRECTORY_COLLECTION = 'budgetUserDirectory';
const USER_DIRECTORY_EMAIL_COLLECTION = 'budgetUserDirectoryByEmail';
const USER_PRIVATE_COLLECTION = 'budgetUserPrivate';
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

function activeMemberUids(workspace: Workspace): string[] {
  return workspace.members.filter((member) => !member.archivedDate).map((member) => member.uid);
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
    private readonly identity?: {
      uid: string;
      email: string;
      members: readonly WorkspaceMember[];
    },
  ) {}

  async listen<TName extends BudgetCollectionName>(
    collectionName: TName,
    next: (records: BudgetDataMap[TName][]) => void,
    error: (error: unknown) => void,
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
      (snapshotError) => error(snapshotError),
    );
  }

  static async listAccessibleWorkspaces(
    app: FirebaseApp,
    identity: { uid: string },
  ): Promise<Workspace[]> {
    const { collection, getDocs, getFirestore, query, where } = await import('firebase/firestore');
    const db = getFirestore(app);
    const workspacesRef = collection(db, WORKSPACE_COLLECTION);
    const uidSnapshot = await getDocs(
      query(workspacesRef, where('memberUids', 'array-contains', identity.uid)),
    );

    return uidSnapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() as Omit<Workspace, 'id'>;
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
      'loanAccounts',
      'loanEvents',
      'loanReconciliations',
      'loanDocuments',
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

        if (operationCount === MAX_BATCH_WRITES) {
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

  static async ensurePersonalWorkspace(
    app: FirebaseApp,
    userUid: string,
    userEmail: string,
    displayName: string,
    photoUrl?: string,
  ): Promise<Workspace> {
    const { doc, getDoc, getFirestore, serverTimestamp, setDoc } =
      await import('firebase/firestore');
    const db = getFirestore(app);
    const workspaceRef = doc(db, WORKSPACE_COLLECTION, userUid);
    const snapshot = await getDoc(workspaceRef);

    if (snapshot.exists()) {
      const data = snapshot.data() as Omit<Workspace, 'id'>;
      if (data.ownerUid === userUid && Array.isArray(data.members)) {
        return { id: snapshot.id, ...data };
      }
      throw new Error('The personal workspace does not satisfy the UID identity schema.');
    }

    const today = new Date().toISOString();
    const workspace: Workspace = {
      id: userUid,
      name: `${displayName || userEmail}'s workspace`,
      ownerUid: userUid,
      memberUids: [userUid],
      members: [
        {
          email: userEmail,
          uid: userUid,
          displayName: displayName || userEmail,
          photoUrl,
          role: 'owner',
          createdDate: today,
        },
      ],
      createdDate: today,
      updatedDate: today,
    };

    await setDoc(workspaceRef, {
      ...stripUndefined(workspaceWithoutId(workspace)),
      memberUids: [userUid],
      updatedAt: serverTimestamp(),
    });

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
    const workspace: Workspace = {
      id: workspaceRef.id,
      name: name.trim() || 'New workspace',
      ownerUid: ownerProfile.uid,
      memberUids: [ownerProfile.uid, ...editorProfiles.map((profile) => profile.uid)],
      members: [
        {
          email: ownerProfile.email,
          uid: ownerProfile.uid,
          displayName: ownerProfile.displayName || ownerProfile.email,
          photoUrl: ownerProfile.photoUrl,
          role: 'owner',
          createdDate: today,
        },
        ...editorProfiles.map((profile) => ({
          email: profile.email,
          uid: profile.uid,
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
      memberUids: activeMemberUids(workspace),
      updatedAt: serverTimestamp(),
    });

    return workspace;
  }

  static async upsertUserProfile(app: FirebaseApp, profile: UserProfile): Promise<void> {
    const { doc, getFirestore, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = getFirestore(app);

    await Promise.all([
      setDoc(
        doc(db, USER_DIRECTORY_COLLECTION, profile.uid),
        {
          uid: profile.uid,
          email: profile.email,
          displayName: profile.displayName,
          photoUrl: profile.photoUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
      setDoc(
        doc(db, USER_DIRECTORY_EMAIL_COLLECTION, normalizeEmail(profile.email)),
        {
          uid: profile.uid,
          email: normalizeEmail(profile.email),
          displayName: profile.displayName,
          photoUrl: profile.photoUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
      setDoc(
        doc(db, USER_PRIVATE_COLLECTION, profile.uid),
        {
          uid: profile.uid,
          onboarding: profile.onboarding,
          updatedDate: profile.updatedDate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ]);
  }

  static async findUserProfile(app: FirebaseApp, uid: string): Promise<UserProfile | null> {
    const { doc, getDoc, getFirestore } = await import('firebase/firestore');
    const db = getFirestore(app);
    const [directory, privateProfile] = await Promise.all([
      getDoc(doc(db, USER_DIRECTORY_COLLECTION, uid)),
      getDoc(doc(db, USER_PRIVATE_COLLECTION, uid)),
    ]);
    if (!directory.exists()) {
      return null;
    }
    return {
      ...(directory.data() as UserProfile),
      ...(privateProfile.exists() ? privateProfile.data() : {}),
      uid,
    } as UserProfile;
  }

  static async findUserProfileByEmail(
    app: FirebaseApp,
    email: string,
  ): Promise<UserProfile | null> {
    const { doc, getDoc, getFirestore } = await import('firebase/firestore');
    const db = getFirestore(app);
    const normalizedEmail = normalizeEmail(email);
    const indexedDirectory = await getDoc(
      doc(db, USER_DIRECTORY_EMAIL_COLLECTION, normalizedEmail),
    );
    return indexedDirectory.exists() ? (indexedDirectory.data() as UserProfile) : null;
  }

  private ownedRecord<T extends BudgetRecord>(record: T): T {
    if (!this.identity || !('memberEmail' in record) || record.ownerUid) {
      return record;
    }
    const memberEmail = record.memberEmail;
    const ownerUid = memberEmail
      ? this.identity.members.find(
          (member) => normalizeEmail(member.email) === normalizeEmail(memberEmail),
        )?.uid
      : this.identity.uid;
    return ownerUid ? ({ ...record, ownerUid } as T) : record;
  }

  private withOwnedMutations(mutations: BudgetMutationSet): BudgetMutationSet {
    return Object.fromEntries(
      Object.entries(mutations).map(([collectionName, value]) => {
        if (!value) {
          return [collectionName, value];
        }
        return [
          collectionName,
          {
            ...value,
            creates: value.creates.map((record: BudgetRecord) => this.ownedRecord(record)),
            updates: value.updates.map(
              (update: { record: BudgetRecord; expectedVersion: number }) => ({
                ...update,
                record: this.ownedRecord(update.record),
              }),
            ),
          },
        ];
      }),
    ) as BudgetMutationSet;
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const db = await this.database();

    await setDoc(
      doc(db, WORKSPACE_COLLECTION, workspace.id),
      {
        ...stripUndefined(workspaceWithoutId(workspace)),
        memberUids: activeMemberUids(workspace),
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
    const { id, ...data } = this.ownedRecord(record);

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
    for (let offset = 0; offset < records.length; offset += MAX_BATCH_WRITES) {
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();
      for (const record of records.slice(offset, offset + MAX_BATCH_WRITES)) {
        const { id, ...data } = this.ownedRecord(record);
        batch.set(doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, id), {
          ...stripUndefined(data),
          updatedAt: timestamp,
        });
      }
      await batch.commit();
    }
  }

  async executeMutations(mutations: BudgetMutationSet): Promise<void> {
    const db = await this.database();
    await new FirestoreWriteCoordinator(db, this.workspaceId).execute(
      this.withOwnedMutations(mutations),
    );
  }

  async delete(collectionName: BudgetCollectionName, recordId: string): Promise<void> {
    const { deleteDoc, doc } = await import('firebase/firestore');
    const db = await this.database();

    await deleteDoc(doc(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName, recordId));
  }

  async deleteFutureLoanExpenses(loanId: string, cutoffDate: string): Promise<string[]> {
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const db = await this.database();
    const snapshot = await getDocs(
      query(
        collection(db, WORKSPACE_COLLECTION, this.workspaceId, 'expenses'),
        where('sourceLoanId', '==', loanId),
      ),
    );
    const cutoffMonth = cutoffDate.slice(0, 7);
    const futureDocuments = snapshot.docs.filter((snapshotDocument) => {
      const expense = snapshotDocument.data() as Pick<ExpenseEntry, 'date' | 'month'>;
      return expense.date ? expense.date >= cutoffDate : expense.month >= cutoffMonth;
    });
    await this.deleteDocumentReferences(futureDocuments.map((document) => document.ref));
    return futureDocuments.map((document) => document.id);
  }

  async deleteLoanAccountCascade(
    loanId: string,
    cutoffDate: string,
  ): Promise<{ futureExpenseIds: string[] }> {
    const { collection, doc, getDocs, query, where } = await import('firebase/firestore');
    const db = await this.database();
    const childCollections = ['loanEvents', 'loanReconciliations', 'loanDocuments'] as const;
    const childSnapshots = await Promise.all(
      childCollections.map((collectionName) =>
        getDocs(
          query(
            collection(db, WORKSPACE_COLLECTION, this.workspaceId, collectionName),
            where('loanId', '==', loanId),
          ),
        ),
      ),
    );
    const futureExpenseIds = await this.deleteFutureLoanExpenses(loanId, cutoffDate);
    const childReferences = childSnapshots.flatMap((snapshot) =>
      snapshot.docs.map((document) => document.ref),
    );
    await this.deleteDocumentReferences([
      ...childReferences,
      doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'loanAccounts', loanId),
      // A migrated account can retain a same-id legacy document during rolling migration.
      doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'loans', loanId),
    ]);
    return { futureExpenseIds };
  }

  async deleteLegacyLoanCascade(loanId: string, cutoffDate: string): Promise<void> {
    const { deleteDoc, doc } = await import('firebase/firestore');
    const db = await this.database();
    await this.deleteFutureLoanExpenses(loanId, cutoffDate);
    await deleteDoc(doc(db, WORKSPACE_COLLECTION, this.workspaceId, 'loans', loanId));
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
        for (let offset = 0; offset < snapshot.docs.length; offset += MAX_BATCH_WRITES) {
          const batch = writeBatch(db);
          for (const snapshotDocument of snapshot.docs.slice(offset, offset + MAX_BATCH_WRITES)) {
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

  private async deleteDocumentReferences(references: readonly DocumentReference[]): Promise<void> {
    if (!references.length) {
      return;
    }
    const { writeBatch } = await import('firebase/firestore');
    const db = await this.database();
    for (let offset = 0; offset < references.length; offset += MAX_BATCH_WRITES) {
      const batch = writeBatch(db);
      for (const reference of references.slice(offset, offset + MAX_BATCH_WRITES)) {
        batch.delete(reference);
      }
      await batch.commit();
    }
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

      if (collectionName === 'loanAccounts') {
        return (left as { lender: string }).lender.localeCompare(
          (right as { lender: string }).lender,
        );
      }

      if (collectionName === 'loanEvents') {
        const leftEvent = left as { effectiveDate: string; id: string };
        const rightEvent = right as { effectiveDate: string; id: string };
        return `${rightEvent.effectiveDate}-${rightEvent.id}`.localeCompare(
          `${leftEvent.effectiveDate}-${leftEvent.id}`,
        );
      }

      if (collectionName === 'loanReconciliations') {
        return (right as { asOfDate: string }).asOfDate.localeCompare(
          (left as { asOfDate: string }).asOfDate,
        );
      }

      return (left as { id: string }).id.localeCompare((right as { id: string }).id);
    });
  }
}
