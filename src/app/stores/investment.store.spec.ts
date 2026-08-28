import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetStore } from '../budget.store';
import { InvestmentRepository } from '../data/investment.repository';
import type {
  InvestmentAccount,
  InvestmentTransaction,
} from '../domain/investments/investment.models';
import { InvestmentStore } from './investment.store';

const account: InvestmentAccount = {
  id: 'investment-1',
  schemaVersion: 2,
  name: 'Index fund',
  type: 'MUTUAL_FUND',
  status: 'ACTIVE',
  legacySourceId: 'legacy-investment-1',
  summary: {
    totalContributions: '1000',
    totalWithdrawals: '0',
    remainingCostBasis: '1000',
    currentQuantity: '10',
    currentValue: '1100',
    realizedReturn: '0',
    unrealizedReturn: '100',
    overallReturnAmount: '100',
    overallReturnPercentage: '10',
  },
  ownerUid: 'owner-1',
  createdDate: '2026-08-28T00:00:00.000Z',
  updatedDate: '2026-08-28T00:00:00.000Z',
};

const transaction: InvestmentTransaction = {
  id: 'transaction-1',
  schemaVersion: 2,
  investmentId: account.id,
  type: 'SIP',
  date: '2026-08-28',
  amount: '1000',
  source: 'ADHOC',
  ownerUid: account.ownerUid,
  createdDate: '2026-08-28T00:00:00.000Z',
  updatedDate: '2026-08-28T00:00:00.000Z',
};

describe('InvestmentStore', () => {
  const deleteAccountAndTransactions = vi.fn(async () => undefined);
  const saveAccount = vi.fn(async () => undefined);
  const selectedMonth = signal('2026-08');
  let store: InvestmentStore;

  beforeEach(() => {
    vi.clearAllMocks();
    selectedMonth.set('2026-08');
    TestBed.configureTestingModule({
      providers: [
        InvestmentStore,
        {
          provide: BudgetStore,
          useValue: {
            workspaceId: signal(''),
            investments: signal([]),
            selectedMonth,
            userUid: signal('owner-1'),
            userEmail: signal('owner@example.com'),
            canWrite: signal(true),
            firebase: { app: null },
          },
        },
        {
          provide: InvestmentRepository,
          useValue: {
            deleteAccountAndTransactions,
            disconnect: vi.fn(),
            saveAccount,
          },
        },
      ],
    });
    store = TestBed.inject(InvestmentStore);
    store.accounts.set([account]);
    store.transactions.set([transaction]);
  });

  it('removes the selected account and its transactions after persistence succeeds', async () => {
    await store.deleteInvestment(account);

    expect(deleteAccountAndTransactions).toHaveBeenCalledWith(
      account.id,
      [transaction.id],
      account.legacySourceId,
    );
    expect(store.accounts()).toEqual([]);
    expect(store.transactions()).toEqual([]);
    expect(store.deletingAccountId()).toBeNull();
  });

  it('does not allow one member to delete another member’s investment', async () => {
    const otherMemberAccount = { ...account, ownerUid: 'owner-2' };

    await expect(store.deleteInvestment(otherMemberAccount)).rejects.toThrow(
      'You do not have permission to delete this investment.',
    );
    expect(deleteAccountAndTransactions).not.toHaveBeenCalled();
  });

  it('projects a step-up SIP amount for the selected future month', () => {
    selectedMonth.set('2027-01');
    store.accounts.set([
      {
        ...account,
        recurringPlan: {
          enabled: true,
          amount: '5000',
          frequency: 'MONTHLY',
          startDate: '2026-01-01',
          sipType: 'STEP_UP',
          stepUp: {
            enabled: true,
            type: 'FIXED_AMOUNT',
            value: '500',
            frequency: 'HALF_YEARLY',
            effectiveFrom: '2026-07-01',
          },
        },
      },
    ]);

    expect(store.effectiveRecurring(store.accounts()[0])).toBe('6000');
  });

  it('removes recurring plans from stock accounts and excludes them from commitments', async () => {
    const stockAccount: InvestmentAccount = {
      ...account,
      id: 'stock-1',
      name: 'Example stock',
      type: 'STOCK',
      recurringPlan: {
        enabled: true,
        amount: '5000',
        frequency: 'MONTHLY',
        startDate: '2026-01-01',
      },
    };
    store.accounts.set([stockAccount]);
    store.transactions.set([]);

    expect(store.effectiveRecurring(stockAccount)).toBe('0');
    expect(store.portfolio().recurringCommitmentMonthly).toBe('0');

    await store.updateAccount(stockAccount);

    expect(saveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: stockAccount.id, recurringPlan: undefined }),
    );
  });

  it('does not create a recurring plan when adding a stock account', async () => {
    const created = await store.addInvestment({
      name: 'Example stock',
      type: 'STOCK',
      recurringPlan: {
        enabled: true,
        amount: '5000',
        frequency: 'MONTHLY',
        startDate: '2026-01-01',
      },
    });

    expect(created.recurringPlan).toBeUndefined();
    expect(saveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STOCK', recurringPlan: undefined }),
    );
  });
});
