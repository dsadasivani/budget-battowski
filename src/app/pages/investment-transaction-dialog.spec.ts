import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import type { InvestmentAccount, NpsSchemeHolding } from '../domain/investments/investment.models';
import { InvestmentStore } from '../stores/investment.store';
import {
  InvestmentEditDialog,
  InvestmentTransactionDialog,
  RecurringPlanDialog,
} from './investment-detail-page';

const holdings: NpsSchemeHolding[] = [
  {
    schemeCode: 'SCHEME_E',
    schemeName: 'Pension Fund Scheme E',
    allocationPercentage: '75',
    units: '100',
    nav: '75',
    navDate: '2026-08-29',
  },
  {
    schemeCode: 'SCHEME_G',
    schemeName: 'Pension Fund Scheme G',
    allocationPercentage: '25',
    units: '50',
    nav: '50',
    navDate: '2026-08-29',
  },
];

const account: InvestmentAccount = {
  id: 'nps-1',
  schemaVersion: 2,
  name: 'My NPS',
  type: 'NPS',
  status: 'ACTIVE',
  paymentModeId: 'payment-mode-owner',
  instrument: { kind: 'NPS', provider: 'NPS_TRUST', schemeHoldings: holdings },
  recurringPlan: {
    enabled: true,
    amount: '1000',
    frequency: 'MONTHLY',
    startDate: '2026-08-01',
  },
  summary: {
    totalContributions: '10000',
    totalWithdrawals: '0',
    remainingCostBasis: '10000',
    currentQuantity: '0',
    currentValue: '11000',
    realizedReturn: '0',
    unrealizedReturn: '1000',
    overallReturnAmount: '1000',
    overallReturnPercentage: '10',
  },
  createdDate: '2026-08-01T00:00:00Z',
  updatedDate: '2026-08-01T00:00:00Z',
};

describe('InvestmentTransactionDialog NPS allocations', () => {
  it('prefills scheme amounts and calculates contribution units from the latest NAV', async () => {
    const addTransaction = vi.fn(async () => undefined);
    const fetchLatestNpsHoldings = vi.fn(async () => holdings);
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [InvestmentTransactionDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { account, liquidation: false } },
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: InvestmentStore,
          useValue: {
            effectiveRecurring: vi.fn(() => '1000'),
            npsHoldingsFor: vi.fn(() => holdings),
            fetchLatestNpsHoldings,
            display: (value: string | undefined) => Number(value ?? 0),
            addTransaction,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentTransactionDialog);
    const dialog = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchLatestNpsHoldings).toHaveBeenCalledWith(account);
    expect(dialog.npsNavFetched()).toBe(true);
    expect(dialog.npsSchemeAllocations()).toEqual([
      expect.objectContaining({ schemeCode: 'SCHEME_E', amount: '750', units: '10' }),
      expect.objectContaining({ schemeCode: 'SCHEME_G', amount: '250', units: '5' }),
    ]);
    expect(
      fixture.nativeElement.querySelector('textarea[formControlName="schemeAllocations"]'),
    ).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.nps-transaction-allocation')).toHaveLength(2);
    expect(
      fixture.nativeElement.querySelector('input[aria-label^="Allotted units for"]'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Calculated units');

    await dialog.save();

    expect(addTransaction).toHaveBeenCalledWith(
      account,
      expect.objectContaining({
        amount: '1000',
        paymentModeId: 'payment-mode-owner',
        source: 'RECURRING',
        schemeAllocations: [
          expect.objectContaining({
            schemeCode: 'SCHEME_E',
            amount: '750',
            units: '10',
            nav: '75',
            navDate: '2026-08-29',
            unitsSource: 'CALCULATED',
          }),
          expect.objectContaining({
            schemeCode: 'SCHEME_G',
            amount: '250',
            units: '5',
            nav: '50',
            navDate: '2026-08-29',
            unitsSource: 'CALCULATED',
          }),
        ],
      }),
    );
    expect(close).toHaveBeenCalledWith(true);
  });

  it('fetches all current scheme NAVs on demand for an ad-hoc contribution', async () => {
    const manualAccount: InvestmentAccount = { ...account, recurringPlan: undefined };
    const latestHoldings = [
      { ...holdings[0], nav: '80', navDate: '2026-08-30' },
      { ...holdings[1], nav: '40', navDate: '2026-08-30' },
    ];
    const fetchLatestNpsHoldings = vi.fn(async () => latestHoldings);
    await TestBed.configureTestingModule({
      imports: [InvestmentTransactionDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { account: manualAccount, liquidation: false } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: {
            effectiveRecurring: vi.fn(() => '0'),
            npsHoldingsFor: vi.fn(() => holdings),
            fetchLatestNpsHoldings,
            display: (value: string | undefined) => Number(value ?? 0),
            addTransaction: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentTransactionDialog);
    const dialog = fixture.componentInstance;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Not allocated');
    expect(fixture.nativeElement.querySelectorAll('.nps-transaction-allocation')).toHaveLength(2);

    dialog.form.controls.amount.setValue('1000');
    dialog.setNpsTransactionTotal('1000');
    fixture.detectChanges();

    const fetchButton = fixture.nativeElement.querySelector(
      'button[aria-label="Fetch latest NAVs for all NPS schemes"]',
    );
    expect(fixture.nativeElement.textContent).toContain('Fetch latest NAVs');
    fetchButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchLatestNpsHoldings).toHaveBeenCalledWith(manualAccount);
    expect(dialog.npsSchemeAllocations()).toEqual([
      expect.objectContaining({ schemeCode: 'SCHEME_E', amount: '750', units: '9.375' }),
      expect.objectContaining({ schemeCode: 'SCHEME_G', amount: '250', units: '6.25' }),
    ]);
    expect(fixture.nativeElement.textContent).toContain('Latest NAVs fetched for all schemes.');
  });
});

describe('InvestmentEditDialog NPS allocations', () => {
  it('lets an existing NPS account replace missing allocations with a structured 100% split', async () => {
    const legacyHoldings = holdings.map(({ allocationPercentage: _, ...holding }) => holding);
    const legacyAccount: InvestmentAccount = {
      ...account,
      instrument: { kind: 'NPS', provider: 'NPS_TRUST', schemeHoldings: legacyHoldings },
      openingSnapshot: {
        asOfDate: '2026-08-01',
        investedAmount: '10000',
        currentValue: '11000',
        schemeHoldings: legacyHoldings,
      },
    };
    const updateAccount = vi.fn(async () => undefined);
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [InvestmentEditDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: legacyAccount },
        { provide: MatDialogRef, useValue: { close } },
        { provide: InvestmentStore, useValue: { updateAccount } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentEditDialog);
    const dialog = fixture.componentInstance;
    dialog.npsHoldings.update((current) =>
      current.map((holding) => ({
        ...holding,
        allocationPercentage: holding.schemeCode === 'SCHEME_E' ? '75' : '25',
      })),
    );
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('textarea[formControlName="npsHoldings"]'),
    ).toBeNull();
    expect(dialog.npsAllocationComplete()).toBe(true);
    await dialog.save();

    expect(updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        instrument: expect.objectContaining({
          schemeHoldings: [
            expect.objectContaining({ schemeCode: 'SCHEME_E', allocationPercentage: '75' }),
            expect.objectContaining({ schemeCode: 'SCHEME_G', allocationPercentage: '25' }),
          ],
        }),
        openingSnapshot: expect.objectContaining({
          schemeHoldings: [
            expect.objectContaining({ schemeCode: 'SCHEME_E', allocationPercentage: '75' }),
            expect.objectContaining({ schemeCode: 'SCHEME_G', allocationPercentage: '25' }),
          ],
        }),
      }),
    );
    expect(close).toHaveBeenCalledWith(true);
  });
});

describe('RecurringPlanDialog NPS allocations', () => {
  it('requires an existing NPS account to configure a 100% scheme split first', async () => {
    const legacyHoldings = holdings.map(({ allocationPercentage: _, ...holding }) => holding);
    const legacyAccount: InvestmentAccount = {
      ...account,
      instrument: { kind: 'NPS', provider: 'NPS_TRUST', schemeHoldings: legacyHoldings },
      recurringPlan: undefined,
    };
    const updateAccount = vi.fn(async () => undefined);
    await TestBed.configureTestingModule({
      imports: [RecurringPlanDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: legacyAccount },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: { npsHoldingsFor: vi.fn(() => legacyHoldings), updateAccount },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RecurringPlanDialog);
    const dialog = fixture.componentInstance;
    dialog.form.controls.amount.setValue('1000');
    await dialog.save();

    expect(dialog.error()).toContain('Edit investment');
    expect(updateAccount).not.toHaveBeenCalled();
  });
});
