import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type {
  InvestmentAccount,
  InvestmentTransaction,
} from '../domain/investments/investment.models';
import { BudgetStore } from '../budget.store';
import { InvestmentStore } from '../stores/investment.store';
import { InvestmentAccountDetailPage } from './investment-account-detail-page';

const account: InvestmentAccount = {
  id: 'investment-1',
  schemaVersion: 2,
  name: 'Public Provident Fund',
  type: 'PPF',
  status: 'ACTIVE',
  summary: {
    totalContributions: '1000',
    totalWithdrawals: '0',
    remainingCostBasis: '1000',
    currentQuantity: '1000',
    currentValue: '1050',
    realizedReturn: '0',
    unrealizedReturn: '50',
    overallReturnAmount: '50',
    overallReturnPercentage: '5',
  },
  ownerUid: 'owner-1',
  createdDate: '2026-08-28T00:00:00.000Z',
  updatedDate: '2026-08-28T00:00:00.000Z',
};

const transaction: InvestmentTransaction = {
  id: 'transaction-1',
  schemaVersion: 2,
  investmentId: account.id,
  type: 'CONTRIBUTION',
  date: '2026-08-28',
  amount: '1000',
  source: 'ADHOC',
  ownerUid: account.ownerUid,
  createdDate: '2026-08-28T00:00:00.000Z',
  updatedDate: '2026-08-28T00:00:00.000Z',
};

describe('InvestmentAccountDetailPage deletion', () => {
  it('confirms the destructive action, deletes the investment, and returns to the portfolio', async () => {
    const deleteInvestment = vi.fn(async () => undefined);
    const dialogOpen = vi.fn(() => ({ afterClosed: () => of(true) }));
    const navigate = vi.fn(async () => true);
    const snackOpen = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([account]),
            loading: signal(false),
            transactionsFor: vi.fn(() => [transaction]),
            deletingAccountId: signal(null),
            canDelete: vi.fn(() => true),
            deleteInvestment,
          },
        },
        {
          provide: BudgetStore,
          useValue: { showPageSkeleton: signal(false) },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => account.id } } },
        },
        { provide: MatDialog, useValue: { open: dialogOpen } },
        { provide: Router, useValue: { navigate } },
        { provide: MatSnackBar, useValue: { open: snackOpen } },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new InvestmentAccountDetailPage());

    await page.deleteInvestment(account);

    expect(dialogOpen).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Delete Public Provident Fund?',
          confirmLabel: 'Delete investment',
        }),
      }),
    );
    expect(deleteInvestment).toHaveBeenCalledWith(account);
    expect(snackOpen).toHaveBeenCalledWith('Investment deleted.', 'Dismiss', { duration: 3500 });
    expect(navigate).toHaveBeenCalledWith(['/investments']);
  });
});
