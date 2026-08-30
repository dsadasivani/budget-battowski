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

  it('confirms and deletes a transaction without leaving the account page', async () => {
    const deleteTransaction = vi.fn(async () => undefined);
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
            deletingTransactionId: signal(null),
            canDelete: vi.fn(() => true),
            canDeleteTransaction: vi.fn(() => true),
            deleteTransaction,
            display: (value: string | undefined) => Number(value ?? 0),
          },
        },
        { provide: BudgetStore, useValue: { showPageSkeleton: signal(false) } },
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

    await page.deleteTransaction(account, transaction);

    expect(dialogOpen).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Delete contribution?',
          confirmLabel: 'Delete transaction',
        }),
      }),
    );
    expect(deleteTransaction).toHaveBeenCalledWith(account, transaction);
    expect(snackOpen).toHaveBeenCalledWith('Transaction deleted.', 'Dismiss', { duration: 3500 });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('InvestmentAccountDetailPage NPS holdings', () => {
  it('shows every scheme with its units, NAV, value, and recurring contribution split', async () => {
    const npsAccount: InvestmentAccount = {
      ...account,
      id: 'nps-1',
      name: 'My NPS',
      type: 'NPS',
      instrument: {
        kind: 'NPS',
        provider: 'NPS_TRUST',
        schemeHoldings: [
          {
            schemeCode: 'SCHEME_E',
            schemeName: 'Pension Fund Scheme E',
            pfmName: 'Example Pension Fund',
            assetClass: 'E',
            tier: 'I',
            channel: 'POP',
            allocationPercentage: '75',
            units: '100',
            nav: '50',
            navDate: '2026-08-29',
          },
          {
            schemeCode: 'SCHEME_G',
            schemeName: 'Pension Fund Scheme G',
            pfmName: 'Example Pension Fund',
            assetClass: 'G',
            tier: 'I',
            channel: 'POP',
            allocationPercentage: '25',
            units: '50',
            nav: '25',
            navDate: '2026-08-29',
          },
        ],
      },
      recurringPlan: {
        enabled: true,
        amount: '1000',
        frequency: 'MONTHLY',
        startDate: '2026-08-01',
      },
      summary: { ...account.summary, currentValue: '6250' },
    };
    const holdings =
      npsAccount.instrument?.kind === 'NPS' ? npsAccount.instrument.schemeHoldings : [];

    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDetailPage],
      providers: [
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([npsAccount]),
            loading: signal(false),
            transactionsFor: vi.fn(() => []),
            deletingAccountId: signal(null),
            deletingTransactionId: signal(null),
            canDelete: vi.fn(() => true),
            canDeleteTransaction: vi.fn(() => true),
            display: (value: string | undefined) => Number(value ?? 0),
            npsHoldingsFor: vi.fn(() => holdings),
            npsHoldingValue: (holding: (typeof holdings)[number]) =>
              (Number(holding.units) * Number(holding.nav ?? 0)).toString(),
            recurringPlanDisplayAmount: vi.fn(() => '1000'),
            recurringPlanIsUpcoming: vi.fn(() => false),
          },
        },
        { provide: BudgetStore, useValue: { showPageSkeleton: signal(false) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => npsAccount.id } } },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDetailPage);
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.nps-scheme-card');
    const text = fixture.nativeElement.textContent;
    const schemeLayout = fixture.nativeElement.querySelector('.nps-scheme-grid');

    expect(cards).toHaveLength(2);
    expect(schemeLayout.classList.contains('list')).toBe(true);
    expect(text).toContain('Pension Fund Scheme E');
    expect(text).toContain('Pension Fund Scheme G');
    expect(text).toContain('75%');
    expect(text).toContain('25%');
    expect(text).toContain('₹5,000');
    expect(text).toContain('₹1,250');
    expect(fixture.nativeElement.querySelector('.plan-allocations')?.textContent).toContain('₹750');

    fixture.nativeElement
      .querySelector('button[aria-label="Show NPS schemes in grid view"]')
      .click();
    fixture.detectChanges();

    expect(schemeLayout.classList.contains('grid')).toBe(true);
    expect(
      fixture.nativeElement
        .querySelector('button[aria-label="Show NPS schemes in grid view"]')
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('InvestmentAccountDetailPage government rate details', () => {
  it('shows the applied rate, verified period, configuration source, and official publication', async () => {
    const ppfAccount: InvestmentAccount = {
      ...account,
      summary: {
        ...account.summary,
        valuationSource: 'INTERNAL',
        refreshStatus: 'CURRENT',
        valuationDate: '2026-08-30',
        appliedGovernmentRate: {
          scheme: 'PPF',
          annualRate: '7.1',
          effectiveFrom: '2026-07-01',
          effectiveTo: '2026-09-30',
          sourceUrl: 'https://example.gov.in/ppf-rate',
          publishedDate: '2026-06-30',
          verifiedAt: '2026-08-30T00:00:00.000Z',
          configurationSource: 'FIRESTORE',
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDetailPage],
      providers: [
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([ppfAccount]),
            loading: signal(false),
            transactionsFor: vi.fn(() => []),
            deletingAccountId: signal(null),
            deletingTransactionId: signal(null),
            canDelete: vi.fn(() => true),
            canDeleteTransaction: vi.fn(() => true),
            display: (value: string | undefined) => Number(value ?? 0),
            npsHoldingsFor: vi.fn(() => []),
            npsHoldingValue: vi.fn(() => '0'),
            recurringPlanDisplayAmount: vi.fn(() => '0'),
            recurringPlanIsUpcoming: vi.fn(() => false),
          },
        },
        { provide: BudgetStore, useValue: { showPageSkeleton: signal(false) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => ppfAccount.id } } },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDetailPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    const source = fixture.nativeElement.querySelector('.account-details a');

    expect(text).toContain('Current calculated value');
    expect(text).toContain('7.1% p.a.');
    expect(text).toContain('Jul 1, 2026');
    expect(text).toContain('Sep 30, 2026');
    expect(text).toContain('Central configuration');
    expect(source.getAttribute('href')).toBe('https://example.gov.in/ppf-rate');
  });
});
