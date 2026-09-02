import type { FirebaseApp } from 'firebase/app';
import type { Firestore, Unsubscribe } from 'firebase/firestore';

import type { ExpenseEntry, SmsTransaction } from '../budget.models';
import { expenseFromSms } from '../domain/sms/sms-review';
import { getBudgetFirestore } from '../firebase.client';

type EditableSmsFields = Pick<
  SmsTransaction,
  'categoryId' | 'paymentAccountId' | 'paymentModeId' | 'notes' | 'decision'
>;

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function withoutId<T extends { id: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...record } = value;
  return record;
}

export class SmsTransactionRepository {
  private db?: Firestore;

  constructor(
    private readonly app: FirebaseApp,
    private readonly workspaceId: string,
  ) {}

  async listen(
    next: (records: SmsTransaction[]) => void,
    error: (reason: unknown) => void,
  ): Promise<Unsubscribe> {
    const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
    const database = await this.database();
    return onSnapshot(
      query(
        collection(database, 'budgetWorkspaces', this.workspaceId, 'smsTransactions'),
        orderBy('createdDate', 'desc'),
      ),
      (snapshot) =>
        next(
          snapshot.docs.map((document) => {
            const data = document.data();
            const { createdAt: _createdAt, updatedAt: _updatedAt, ...record } = data;
            return { id: document.id, ...record } as SmsTransaction;
          }),
        ),
      error,
    );
  }

  async updateMany(ids: readonly string[], patch: Partial<EditableSmsFields>): Promise<void> {
    if (!ids.length) return;
    const { deleteField, doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const database = await this.database();
    const now = new Date().toISOString();
    for (let index = 0; index < ids.length; index += 450) {
      const batch = writeBatch(database);
      for (const id of ids.slice(index, index + 450)) {
        const storedPatch = Object.fromEntries(
          Object.entries(patch).map(([field, value]) => [
            field,
            value === undefined ? deleteField() : value,
          ]),
        );
        batch.update(doc(database, 'budgetWorkspaces', this.workspaceId, 'smsTransactions', id), {
          ...storedPatch,
          updatedDate: now,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }

  async submit(
    smsTransaction: SmsTransaction,
    memberEmail?: string,
  ): Promise<'processed' | 'discarded' | 'already-finalized'> {
    const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
    const database = await this.database();
    const smsRef = doc(
      database,
      'budgetWorkspaces',
      this.workspaceId,
      'smsTransactions',
      smsTransaction.id,
    );
    return runTransaction(database, async (transaction) => {
      const snapshot = await transaction.get(smsRef);
      if (!snapshot.exists()) throw new Error('SMS transaction no longer exists.');
      const current = { id: snapshot.id, ...snapshot.data() } as SmsTransaction;
      if (current.status !== 'pending') return 'already-finalized';
      const now = new Date().toISOString();
      if (current.decision === 'discard') {
        transaction.update(smsRef, {
          status: 'discarded',
          processedDate: now,
          updatedDate: now,
          updatedAt: serverTimestamp(),
        });
        return 'discarded';
      }
      if (current.decision !== 'accept') throw new Error('Choose Accept or Discard first.');
      const expense = expenseFromSms(current, memberEmail);
      const expenseRef = doc(
        database,
        'budgetWorkspaces',
        this.workspaceId,
        'expenses',
        expense.id,
      );
      const existingExpense = await transaction.get(expenseRef);
      if (existingExpense.exists()) {
        const existing = existingExpense.data() as Partial<ExpenseEntry>;
        if (existing.sourceSmsTransactionId !== current.id) {
          throw new Error('Expense identifier conflict.');
        }
      } else {
        transaction.set(expenseRef, {
          ...withoutUndefined(withoutId(expense) as unknown as Record<string, unknown>),
          version: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      transaction.update(smsRef, {
        status: 'processed',
        expenseId: expense.id,
        processedDate: now,
        updatedDate: now,
        updatedAt: serverTimestamp(),
      });
      return 'processed';
    });
  }

  private async database(): Promise<Firestore> {
    this.db ??= await getBudgetFirestore(this.app);
    return this.db;
  }
}
