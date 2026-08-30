import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

import type {
  InvestmentAccount,
  InvestmentTransaction,
} from '../domain/investments/investment.models';

const WORKSPACES = 'budgetWorkspaces';
const ACCOUNTS = 'investmentAccounts';
const TRANSACTIONS = 'investmentTransactions';
const LEGACY_INVESTMENTS = 'investments';
const MAX_BATCH_WRITES = 500;

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, withoutUndefined(child)]),
  ) as T;
}

function documentData<T extends { id: string }>(record: T): Omit<T, 'id'> {
  const { id: _id, ...data } = record;
  return withoutUndefined(data);
}

@Injectable({ providedIn: 'root' })
export class InvestmentRepository {
  private db?: Firestore;
  private workspaceId?: string;
  private unsubscribes: Unsubscribe[] = [];

  connect(
    app: FirebaseApp,
    workspaceId: string,
    onAccounts: (accounts: InvestmentAccount[]) => void,
    onTransactions: (transactions: InvestmentTransaction[]) => void,
    onError: (error: unknown) => void,
  ): void {
    this.disconnect();
    this.db = getFirestore(app);
    this.workspaceId = workspaceId;
    this.unsubscribes = [
      onSnapshot(
        collection(this.db, WORKSPACES, workspaceId, ACCOUNTS),
        (snapshot) =>
          onAccounts(
            snapshot.docs
              .map((item) => ({ id: item.id, ...item.data() }) as InvestmentAccount)
              .sort((a, b) => a.name.localeCompare(b.name)),
          ),
        onError,
      ),
      onSnapshot(
        collection(this.db, WORKSPACES, workspaceId, TRANSACTIONS),
        (snapshot) =>
          onTransactions(
            snapshot.docs
              .map((item) => ({ id: item.id, ...item.data() }) as InvestmentTransaction)
              .sort((a, b) => b.date.localeCompare(a.date)),
          ),
        onError,
      ),
    ];
  }

  disconnect(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
    this.workspaceId = undefined;
  }

  async saveAccount(account: InvestmentAccount): Promise<void> {
    const [db, workspaceId] = this.context();
    await setDoc(doc(db, WORKSPACES, workspaceId, ACCOUNTS, account.id), documentData(account));
  }

  async saveTransactionAndSummary(
    transaction: InvestmentTransaction,
    account: InvestmentAccount,
  ): Promise<void> {
    const [db, workspaceId] = this.context();
    const batch = writeBatch(db);
    batch.set(
      doc(db, WORKSPACES, workspaceId, TRANSACTIONS, transaction.id),
      documentData(transaction),
    );
    batch.set(doc(db, WORKSPACES, workspaceId, ACCOUNTS, account.id), documentData(account));
    await batch.commit();
  }

  async saveAccounts(accounts: readonly InvestmentAccount[]): Promise<void> {
    if (!accounts.length) return;
    const [db, workspaceId] = this.context();
    const batch = writeBatch(db);
    for (const account of accounts)
      batch.set(doc(db, WORKSPACES, workspaceId, ACCOUNTS, account.id), documentData(account));
    await batch.commit();
  }

  async deleteTransactionAndSummary(
    transactionId: string,
    account: InvestmentAccount,
  ): Promise<void> {
    const [db, workspaceId] = this.context();
    const batch = writeBatch(db);
    batch.delete(doc(db, WORKSPACES, workspaceId, TRANSACTIONS, transactionId));
    batch.set(doc(db, WORKSPACES, workspaceId, ACCOUNTS, account.id), documentData(account));
    await batch.commit();
  }

  async deleteAccountAndTransactions(
    accountId: string,
    transactionIds: readonly string[],
    legacySourceId?: string,
  ): Promise<void> {
    const [db, workspaceId] = this.context();
    const remainingIds = [...new Set(transactionIds)];
    const finalWriteCount = legacySourceId ? 2 : 1;
    const finalTransactionLimit = MAX_BATCH_WRITES - finalWriteCount;

    while (remainingIds.length > finalTransactionLimit) {
      const batch = writeBatch(db);
      for (const transactionId of remainingIds.splice(0, MAX_BATCH_WRITES)) {
        batch.delete(doc(db, WORKSPACES, workspaceId, TRANSACTIONS, transactionId));
      }
      await batch.commit();
    }

    const finalBatch = writeBatch(db);
    for (const transactionId of remainingIds) {
      finalBatch.delete(doc(db, WORKSPACES, workspaceId, TRANSACTIONS, transactionId));
    }
    finalBatch.delete(doc(db, WORKSPACES, workspaceId, ACCOUNTS, accountId));
    if (legacySourceId) {
      finalBatch.delete(doc(db, WORKSPACES, workspaceId, LEGACY_INVESTMENTS, legacySourceId));
    }
    await finalBatch.commit();
  }

  private context(): [Firestore, string] {
    if (!this.db || !this.workspaceId) throw new Error('Investment repository is not connected.');
    return [this.db, this.workspaceId];
  }
}
