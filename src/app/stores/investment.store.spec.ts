import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetStore } from '../budget.store';
import {
  BUNDLED_GOVERNMENT_INTEREST_RATE_SET,
  GovernmentInterestRateRepository,
} from '../data/government-interest-rate.repository';
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
  const deleteTransactionAndSummary = vi.fn(
    async (_transactionId: string, _account: InvestmentAccount) => undefined,
  );
  const saveAccount = vi.fn(async (_account: InvestmentAccount) => undefined);
  const saveAccounts = vi.fn(async (_accounts: readonly InvestmentAccount[]) => undefined);
  const saveTransactionAndSummary = vi.fn(
    async (_transaction: InvestmentTransaction, _account: InvestmentAccount) => undefined,
  );
  const loadGovernmentInterestRates = vi.fn(async () => BUNDLED_GOVERNMENT_INTEREST_RATE_SET);
  const selectedMonth = signal('2026-08');
  const selectedMemberEmail = signal('ALL');
  const activeMembers = signal([
    { uid: 'owner-1', email: 'owner@example.com', displayName: 'Owner' },
    { uid: 'owner-2', email: 'member@example.com', displayName: 'Member' },
  ]);
  let store: InvestmentStore;

  beforeEach(() => {
    vi.clearAllMocks();
    selectedMonth.set('2026-08');
    selectedMemberEmail.set('ALL');
    TestBed.configureTestingModule({
      providers: [
        InvestmentStore,
        {
          provide: BudgetStore,
          useValue: {
            workspaceId: signal(''),
            investments: signal([]),
            selectedMonth,
            selectedMemberEmail,
            activeMembers,
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
            deleteTransactionAndSummary,
            disconnect: vi.fn(),
            saveAccount,
            saveAccounts,
            saveTransactionAndSummary,
          },
        },
        {
          provide: GovernmentInterestRateRepository,
          useValue: { load: loadGovernmentInterestRates },
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

  it('deletes a transaction and replaces the account with recalculated totals', async () => {
    await store.deleteTransaction(account, transaction);

    expect(deleteTransactionAndSummary).toHaveBeenCalledWith(
      transaction.id,
      expect.objectContaining({
        id: account.id,
        summary: expect.objectContaining({ totalContributions: '0' }),
      }),
    );
    expect(store.transactions()).toEqual([]);
    expect(store.accounts()[0].summary.totalContributions).toBe('0');
    expect(store.deletingTransactionId()).toBeNull();
  });

  it('reverses NPS scheme units when deleting an allocated contribution', async () => {
    const openingHolding = {
      schemeCode: 'SCHEME_E',
      schemeName: 'Pension Fund Scheme E',
      allocationPercentage: '100',
      units: '100',
      nav: '50',
      navDate: '2026-08-01',
    };
    const npsAccount: InvestmentAccount = {
      ...account,
      id: 'nps-1',
      name: 'NPS',
      type: 'NPS',
      instrument: {
        kind: 'NPS',
        provider: 'NPS_TRUST',
        schemeHoldings: [{ ...openingHolding, units: '120' }],
      },
      openingSnapshot: {
        asOfDate: '2026-08-01',
        investedAmount: '5000',
        currentValue: '5000',
        schemeHoldings: [openingHolding],
      },
    };
    const npsContribution: InvestmentTransaction = {
      ...transaction,
      id: 'nps-contribution-1',
      investmentId: npsAccount.id,
      type: 'CONTRIBUTION',
      amount: '1000',
      schemeAllocations: [{ schemeCode: 'SCHEME_E', amount: '1000', units: '20', nav: '50' }],
    };
    store.accounts.set([npsAccount]);
    store.transactions.set([npsContribution]);

    await store.deleteTransaction(npsAccount, npsContribution);

    const persistedAccount = deleteTransactionAndSummary.mock.calls.at(-1)?.[1];
    expect(persistedAccount?.instrument).toMatchObject({
      kind: 'NPS',
      schemeHoldings: [expect.objectContaining({ schemeCode: 'SCHEME_E', units: '100' })],
    });
    expect(persistedAccount?.summary).toMatchObject({
      totalContributions: '5000',
      currentValue: '5000',
    });
  });

  it('filters accounts, transactions, and portfolio totals by the selected workspace member', () => {
    const memberAccount: InvestmentAccount = {
      ...account,
      id: 'investment-2',
      name: 'Member fund',
      ownerUid: 'owner-2',
      memberEmail: 'member@example.com',
      summary: { ...account.summary, currentValue: '2200' },
    };
    const memberTransaction: InvestmentTransaction = {
      ...transaction,
      id: 'transaction-2',
      investmentId: memberAccount.id,
      ownerUid: memberAccount.ownerUid,
      memberEmail: memberAccount.memberEmail,
      amount: '2000',
    };
    store.accounts.set([account, memberAccount]);
    store.transactions.set([transaction, memberTransaction]);

    selectedMemberEmail.set('member@example.com');

    expect(store.visibleAccounts()).toEqual([memberAccount]);
    expect(store.visibleTransactions()).toEqual([memberTransaction]);
    expect(store.portfolio().currentValue).toBe('2200');
    expect(store.monthlyContributions()).toEqual([memberTransaction]);
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

  it('persists the verified applied government rate after refresh', async () => {
    const governmentAccount: InvestmentAccount = {
      ...account,
      id: 'ppf-1',
      name: 'PPF',
      type: 'PPF',
      openingSnapshot: {
        asOfDate: '2026-08-30',
        investedAmount: '360000',
        currentValue: '434324',
      },
      summary: { ...account.summary, currentValue: '436894', refreshStatus: 'STALE' },
    };
    store.accounts.set([governmentAccount]);
    store.transactions.set([]);

    await store.refresh();

    expect(saveAccounts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: governmentAccount.id,
        summary: expect.objectContaining({
          currentValue: '434324',
          refreshStatus: 'CURRENT',
          appliedGovernmentRate: expect.objectContaining({
            annualRate: '7.1',
            effectiveFrom: '2026-07-01',
            effectiveTo: '2026-09-30',
            configurationSource: 'BUNDLED',
          }),
        }),
      }),
    ]);
    expect(store.refreshResults()).toEqual([
      { provider: 'INTERNAL', success: true, updatedCount: 1, failedCount: 0 },
    ]);
  });

  it('marks a government valuation stale when central rates do not cover today', async () => {
    loadGovernmentInterestRates.mockResolvedValueOnce({ rates: [], source: 'FIRESTORE' });
    const governmentAccount: InvestmentAccount = {
      ...account,
      id: 'ssy-1',
      name: 'SSY',
      type: 'SSY',
      openingSnapshot: {
        asOfDate: '2026-08-30',
        investedAmount: '184500',
        currentValue: '192843',
      },
      summary: {
        ...account.summary,
        currentValue: '194161',
        refreshStatus: 'CURRENT',
        appliedGovernmentRate: {
          ...BUNDLED_GOVERNMENT_INTEREST_RATE_SET.rates[5],
          configurationSource: 'BUNDLED',
        },
      },
    };
    store.accounts.set([governmentAccount]);
    store.transactions.set([]);

    await store.refresh();

    expect(saveAccounts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: governmentAccount.id,
        summary: expect.not.objectContaining({
          appliedGovernmentRate: expect.anything(),
          refreshStatus: 'CURRENT',
        }),
      }),
    ]);
    expect(saveAccounts.mock.calls.at(-1)?.[0]?.[0].summary.refreshStatus).toBe('STALE');
    expect(store.refreshResults()).toEqual([
      {
        provider: 'INTERNAL',
        success: false,
        updatedCount: 0,
        failedCount: 1,
        errorCode: 'RATE_NOT_VERIFIED',
      },
    ]);
  });

  it('shows the configured amount for an upcoming plan and activates it within its start month', () => {
    store.accounts.set([
      {
        ...account,
        recurringPlan: {
          enabled: true,
          amount: '4000',
          frequency: 'MONTHLY',
          startDate: '2026-09-02',
          sipType: 'FIXED',
        },
      },
    ]);
    const upcomingAccount = store.accounts()[0];

    expect(store.effectiveRecurring(upcomingAccount)).toBe('0');
    expect(store.recurringPlanIsUpcoming(upcomingAccount)).toBe(true);
    expect(store.recurringPlanDisplayAmount(upcomingAccount)).toBe('4000');

    selectedMonth.set('2026-09');

    expect(store.effectiveRecurring(upcomingAccount)).toBe('4000');
    expect(store.recurringPlanIsUpcoming(upcomingAccount)).toBe(false);
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

  it('trims and persists a new investment institution tag', async () => {
    await store.addInvestment({
      name: 'Example stock',
      type: 'STOCK',
      institution: '  Dhan  ',
    });

    expect(saveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STOCK', institution: 'Dhan' }),
    );
  });

  it('stores a default payment mode for every supported investment type', async () => {
    for (const type of ['STOCK', 'MUTUAL_FUND', 'NPS', 'PPF', 'SSY'] as const) {
      const created = await store.addInvestment({
        name: `${type} investment`,
        type,
        paymentModeId: 'payment-mode-owner',
      });

      expect(created.paymentModeId).toBe('payment-mode-owner');
    }

    expect(saveAccount).toHaveBeenCalledTimes(5);
    expect(saveAccount.mock.calls.map(([saved]) => saved.type)).toEqual([
      'STOCK',
      'MUTUAL_FUND',
      'NPS',
      'PPF',
      'SSY',
    ]);
  });

  it('uses cash when a new investment has no explicit payment mode', async () => {
    const created = await store.addInvestment({
      name: 'Cash-funded investment',
      type: 'PPF',
    });

    expect(created.paymentModeId).toBe('payment-mode-cash');
    expect(saveAccount).toHaveBeenCalledWith(
      expect.objectContaining({ paymentModeId: 'payment-mode-cash' }),
    );
  });

  it('defaults a transaction to its account payment mode and allows an override', async () => {
    const linkedAccount = { ...account, paymentModeId: 'payment-mode-default' };

    await store.addTransaction(linkedAccount, {
      type: 'SIP',
      date: '2026-08-29',
      amount: '500',
      source: 'ADHOC',
    });
    await store.addTransaction(linkedAccount, {
      type: 'SIP',
      date: '2026-08-30',
      amount: '750',
      paymentModeId: 'payment-mode-override',
      source: 'ADHOC',
    });

    expect(saveTransactionAndSummary.mock.calls[0][0].paymentModeId).toBe('payment-mode-default');
    expect(saveTransactionAndSummary.mock.calls[1][0].paymentModeId).toBe('payment-mode-override');
  });

  it('uses cash for a transaction when an older investment has no linked payment mode', async () => {
    await store.addTransaction(account, {
      type: 'SIP',
      date: '2026-08-29',
      amount: '500',
      source: 'RECURRING',
    });

    expect(saveTransactionAndSummary.mock.calls[0][0].paymentModeId).toBe('payment-mode-cash');
  });

  it('totals linked investment transactions for the selected month and member', () => {
    store.transactions.set([
      { ...transaction, paymentModeId: 'payment-mode-owner' },
      {
        ...transaction,
        id: 'older-transaction',
        date: '2026-07-28',
        amount: '900',
        paymentModeId: 'payment-mode-owner',
      },
      { ...transaction, id: 'unlinked-transaction', amount: '400' },
    ]);

    expect(store.paymentModeUsage('payment-mode-owner')).toEqual({ amount: 1000, count: 1 });

    selectedMonth.set('2026-07');
    expect(store.paymentModeUsage('payment-mode-owner')).toEqual({ amount: 900, count: 1 });
  });
});
