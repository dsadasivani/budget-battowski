import type { FirebaseApp } from 'firebase/app';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  InvestmentAccount,
  InvestmentTransaction,
} from '../domain/investments/investment.models';

const firestore = vi.hoisted(() => ({
  batchCommit: vi.fn(async () => undefined),
  batchDelete: vi.fn((_reference: unknown) => undefined),
  batchSet: vi.fn((_reference: unknown, _data: unknown) => undefined),
  setDoc: vi.fn(async (_reference: unknown, _data: unknown) => undefined),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => segments.join('/')),
  deleteDoc: vi.fn(async () => undefined),
  doc: vi.fn((...segments: unknown[]) => segments.join('/')),
  getFirestore: vi.fn(() => ({ kind: 'firestore' })),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: firestore.setDoc,
  writeBatch: vi.fn(() => ({
    commit: firestore.batchCommit,
    delete: firestore.batchDelete,
    set: firestore.batchSet,
  })),
}));

import { InvestmentRepository } from './investment.repository';

const account: InvestmentAccount = {
  id: 'investment-1',
  schemaVersion: 2,
  name: 'Reliance Industries',
  type: 'STOCK',
  status: 'ACTIVE',
  institution: undefined,
  summary: {
    totalContributions: '0',
    totalWithdrawals: '0',
    remainingCostBasis: '0',
    currentQuantity: '0',
    currentValue: '0',
    realizedReturn: '0',
    unrealizedReturn: '0',
    overallReturnAmount: '0',
    overallReturnPercentage: '0',
  },
  ownerUid: 'owner-uid',
  memberEmail: 'owner@example.com',
  createdDate: '2026-08-28T00:00:00.000Z',
  updatedDate: '2026-08-28T00:00:00.000Z',
};

const transaction: InvestmentTransaction = {
  id: 'transaction-1',
  schemaVersion: 2,
  investmentId: account.id,
  type: 'BUY',
  date: '2026-08-28',
  amount: '1000',
  source: 'ADHOC',
  ownerUid: account.ownerUid,
  memberEmail: account.memberEmail,
  createdDate: '2026-08-28T00:00:00.000Z',
  updatedDate: '2026-08-28T00:00:00.000Z',
};

describe('InvestmentRepository', () => {
  let repository: InvestmentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new InvestmentRepository();
    repository.connect({} as FirebaseApp, 'workspace-1', vi.fn(), vi.fn(), vi.fn());
  });

  it('uses the account id as the document path without persisting it as document data', async () => {
    await repository.saveAccount(account);

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.stringContaining('investmentAccounts/investment-1'),
      expect.not.objectContaining({ id: expect.anything() }),
    );
    expect(firestore.setDoc.mock.calls[0]?.[1]).not.toHaveProperty('institution');
  });

  it('strips client ids from transaction and account batch data', async () => {
    await repository.saveTransactionAndSummary(transaction, account);

    expect(firestore.batchSet).toHaveBeenCalledTimes(2);
    expect(firestore.batchSet.mock.calls[0]?.[1]).not.toHaveProperty('id');
    expect(firestore.batchSet.mock.calls[1]?.[1]).not.toHaveProperty('id');
    expect(firestore.batchCommit).toHaveBeenCalledOnce();
  });

  it('deletes an account, its transaction ledger, and its migrated source together', async () => {
    await repository.deleteAccountAndTransactions(
      account.id,
      [transaction.id, 'transaction-2'],
      'legacy-investment-1',
    );

    expect(firestore.batchDelete.mock.calls.map(([reference]) => reference)).toEqual([
      expect.stringContaining('investmentTransactions/transaction-1'),
      expect.stringContaining('investmentTransactions/transaction-2'),
      expect.stringContaining('investmentAccounts/investment-1'),
      expect.stringContaining('investments/legacy-investment-1'),
    ]);
    expect(firestore.batchCommit).toHaveBeenCalledOnce();
  });
});
