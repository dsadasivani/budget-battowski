import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import { InvestmentAccountDialog } from './investments-page';
import { BudgetStore } from '../budget.store';
import { InvestmentRepository } from '../data/investment.repository';
import {
  InvestmentStore,
  type MutualFundSearchResult,
  type NpsSearchResult,
  type StockSearchResult,
} from '../stores/investment.store';

describe('InvestmentAccountDialog', () => {
  it('renders the add-investment form when opened', async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment: vi.fn(),
            searchStocks: vi.fn(),
            searchMutualFunds: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDialog);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain('Add investment');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Find stock');
    expect(fixture.nativeElement.textContent).not.toContain('Upstox');
    expect(fixture.nativeElement.textContent).not.toContain('Track a recurring plan');
    expect(fixture.nativeElement.textContent).toContain('Broker / demat account (optional)');
    expect(
      fixture.nativeElement.querySelector('.stock-search-row input[formcontrolname="name"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.stock-search-row button')?.textContent).toContain(
      'Find stock',
    );

    const typeButtons = fixture.nativeElement.querySelectorAll(
      '.type-picker button',
    ) as NodeListOf<HTMLButtonElement>;
    typeButtons[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Track a recurring plan');
    expect(fixture.nativeElement.textContent).toContain('AMC / investment platform (optional)');
    expect(fixture.nativeElement.querySelector('.fund-search-row button')?.textContent).toContain(
      'Find scheme',
    );
  });

  it('fills read-only stock metadata after a search result is selected', async () => {
    const stock: StockSearchResult = {
      name: 'Reliance Industries Limited',
      tradingSymbol: 'RELIANCE',
      exchange: 'NSE',
      instrumentKey: 'NSE_EQ|INE002A01018',
      isin: 'INE002A01018',
    };
    const searchStocks = vi.fn(async () => [stock]);
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment: vi.fn(),
            searchStocks,
            searchMutualFunds: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.form.controls.name.setValue('Reliance');

    await dialog.searchCatalog();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.stock-search-row .catalog-results'),
    ).not.toBeNull();

    dialog.selectStock(stock);
    fixture.detectChanges();

    expect(searchStocks).toHaveBeenCalledWith('Reliance');
    expect(dialog.form.getRawValue()).toEqual(
      expect.objectContaining({
        name: stock.name,
        tradingSymbol: stock.tradingSymbol,
        exchange: stock.exchange,
        providerKey: stock.instrumentKey,
        isin: stock.isin,
        institution: '',
      }),
    );
    const metadataInputs = fixture.nativeElement.querySelectorAll(
      '.form-grid input[readonly]',
    ) as NodeListOf<HTMLInputElement>;
    expect(metadataInputs).toHaveLength(4);
  });

  it('resets the form and catalog state when the investment type changes', async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment: vi.fn(),
            searchStocks: vi.fn(),
            searchMutualFunds: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const dialog = TestBed.createComponent(InvestmentAccountDialog).componentInstance;
    dialog.form.patchValue({
      name: 'Reliance Industries Limited',
      institution: 'Zerodha',
      tradingSymbol: 'RELIANCE',
      providerKey: 'NSE_EQ|INE002A01018',
      investedAmount: '10000',
    });
    dialog.stockResults.set([
      {
        name: 'Reliance Industries Limited',
        tradingSymbol: 'RELIANCE',
        exchange: 'NSE',
        instrumentKey: 'NSE_EQ|INE002A01018',
      },
    ]);
    dialog.error.set('Previous error');

    dialog.selectType('MUTUAL_FUND');

    expect(dialog.form.getRawValue()).toEqual(
      expect.objectContaining({
        type: 'MUTUAL_FUND',
        name: '',
        institution: '',
        tradingSymbol: '',
        providerKey: '',
        investedAmount: '0',
        plan: '',
        option: '',
      }),
    );
    expect(dialog.stockResults()).toEqual([]);
    expect(dialog.fundResults()).toEqual([]);
    expect(dialog.error()).toBe('');
  });

  it('fills read-only mutual fund metadata after a scheme is selected', async () => {
    const fund: MutualFundSearchResult = {
      schemeCode: '120503',
      schemeName: 'HDFC Index Fund Nifty 50 Plan - Direct Plan - Growth',
    };
    const searchMutualFunds = vi.fn(async () => [fund]);
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment: vi.fn(),
            searchStocks: vi.fn(),
            searchMutualFunds,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.selectType('MUTUAL_FUND');
    dialog.form.controls.name.setValue('HDFC Index');

    await dialog.searchCatalog();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.fund-search-row .catalog-results')).not.toBeNull();

    dialog.selectFund(fund);
    fixture.detectChanges();

    expect(searchMutualFunds).toHaveBeenCalledWith('HDFC Index');
    expect(dialog.form.getRawValue()).toEqual(
      expect.objectContaining({
        name: fund.schemeName,
        schemeCode: fund.schemeCode,
        plan: 'Direct',
        option: 'Growth',
        institution: '',
      }),
    );
    const metadataInputs = fixture.nativeElement.querySelectorAll(
      '.form-grid input[readonly]',
    ) as NodeListOf<HTMLInputElement>;
    expect(metadataInputs).toHaveLength(3);
  });

  it('filters saved broker tags and persists a new value with the investment', async () => {
    const accounts = signal([
      { type: 'STOCK', institution: 'Zerodha' },
      { type: 'STOCK', institution: 'ICICI Direct' },
      { type: 'MUTUAL_FUND', institution: 'HDFC Mutual Fund' },
    ]);
    const addInvestment = vi.fn(async () => ({ id: 'investment-1' }));
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts,
            addInvestment,
            searchStocks: vi.fn(),
            searchMutualFunds: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.institutionInput.setValue('zero');

    expect(dialog.institutionOptions()).toEqual(['Zerodha']);

    dialog.selectInstitution('Zerodha');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-chip-row')?.textContent).toContain('Zerodha');
    dialog.removeInstitution();

    dialog.form.patchValue({
      name: 'Reliance Industries Limited',
      tradingSymbol: 'RELIANCE',
      providerKey: 'NSE_EQ|INE002A01018',
      isin: 'INE002A01018',
    });
    dialog.institutionInput.setValue('Dhan');
    await dialog.save();

    expect(addInvestment).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STOCK', institution: 'Dhan' }),
    );

    accounts.update((current) => [...current, { type: 'STOCK', institution: 'Dhan' }]);
    dialog.removeInstitution();
    dialog.institutionInput.setValue('dhan');
    expect(dialog.institutionOptions()).toEqual(['Dhan']);
  });

  it('searches, selects, and saves official NPS scheme holdings', async () => {
    const scheme: NpsSearchResult = {
      schemeCode: 'SM007001',
      schemeName: 'ICICI PRUDENTIAL PENSION FUND SCHEME E - TIER I',
      pfmName: 'ICICI Prudential Pension Fund Management Co. Ltd.',
      nav: '75.2029',
      navDate: '2026-08-28',
      tier: 'I',
      assetClass: 'E',
      channel: 'POP',
    };
    const searchNps = vi.fn(async () => [scheme]);
    const addInvestment = vi.fn(async () => ({ id: 'investment-1' }));
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment,
            searchStocks: vi.fn(),
            searchMutualFunds: vi.fn(),
            searchNps,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(InvestmentAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.selectType('NPS');
    dialog.form.controls.name.setValue('My NPS Tier I');
    dialog.npsSearchInput.setValue('ICICI scheme E Tier I POP');

    await dialog.searchNpsCatalog();
    fixture.detectChanges();

    expect(searchNps).toHaveBeenCalledWith('ICICI scheme E Tier I POP');
    expect(fixture.nativeElement.querySelector('.nps-search-row .catalog-results')).not.toBeNull();

    dialog.selectNpsScheme(scheme);
    dialog.selectNpsScheme({
      ...scheme,
      schemeCode: 'SM007004',
      schemeName: 'ICICI PRUDENTIAL PENSION FUND SCHEME E - TIER II',
      tier: 'II',
    });
    expect(dialog.npsHoldings()).toHaveLength(1);
    expect(dialog.error()).toContain('already contains Tier I schemes');
    dialog.setNpsUnits(scheme.schemeCode, '10');
    fixture.detectChanges();

    expect(dialog.npsAllocationTotal()).toBe(100);
    expect(dialog.npsAllocationComplete()).toBe(true);
    expect(dialog.form.controls.currentValue.value).toBe('752.03');
    expect(fixture.nativeElement.querySelector('.nps-holding')?.textContent).toContain(
      scheme.schemeCode,
    );
    const metrics = fixture.nativeElement.querySelector('.nps-holding-metrics')?.textContent;
    expect(metrics).toContain('₹75.2029');
    expect(metrics).toContain('₹752');
    expect(metrics).toContain('Aug 28, 2026');

    const valueBeforeAllocationChange = dialog.form.controls.currentValue.value;
    dialog.setNpsAllocationPercentage(scheme.schemeCode, '99');
    expect(dialog.form.controls.currentValue.value).toBe(valueBeforeAllocationChange);
    await dialog.save();
    expect(dialog.error()).toContain('exactly 100%');
    expect(addInvestment).not.toHaveBeenCalled();

    dialog.setNpsAllocationPercentage(scheme.schemeCode, '100');
    await dialog.save();

    expect(addInvestment).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My NPS Tier I',
        type: 'NPS',
        instrument: {
          kind: 'NPS',
          provider: 'NPS_TRUST',
          schemeHoldings: [
            {
              schemeCode: scheme.schemeCode,
              schemeName: scheme.schemeName,
              pfmName: scheme.pfmName,
              assetClass: 'E',
              tier: 'I',
              channel: 'POP',
              allocationPercentage: '100',
              units: '10',
              nav: scheme.nav,
              navDate: scheme.navDate,
            },
          ],
        },
        openingSnapshot: expect.objectContaining({
          asOfDate: scheme.navDate,
          currentValue: '752.03',
        }),
      }),
    );
    expect(close).toHaveBeenCalledWith({ id: 'investment-1' });
  });

  it('renders through the Material dialog overlay', async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment: vi.fn(),
            searchStocks: vi.fn(),
            searchMutualFunds: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const reference = TestBed.inject(MatDialog).open(InvestmentAccountDialog, {
      width: 'min(760px, 96vw)',
      maxHeight: '92vh',
      autoFocus: 'first-tabbable',
    });
    await reference.afterOpened().toPromise();

    expect(document.querySelector('mat-dialog-container h2')?.textContent).toContain(
      'Add investment',
    );
    reference.close();
  });

  it('resolves the application-scoped store through the Material overlay', async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: BudgetStore,
          useValue: {
            workspaceId: signal(''),
            investments: signal([]),
            selectedMonth: signal('2026-08'),
            firebase: { app: null },
          },
        },
        { provide: InvestmentRepository, useValue: { disconnect: vi.fn() } },
      ],
    }).compileComponents();

    const reference = TestBed.inject(MatDialog).open(InvestmentAccountDialog);
    await reference.afterOpened().toPromise();

    expect(document.querySelector('mat-dialog-container h2')?.textContent).toContain(
      'Add investment',
    );
    reference.close();
  });

  it('saves a half-yearly fixed-amount step-up SIP with its upcoming month', async () => {
    const addInvestment = vi.fn(async () => ({ id: 'investment-1' }));
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: InvestmentStore,
          useValue: {
            accounts: signal([]),
            addInvestment,
            searchStocks: vi.fn(),
            searchMutualFunds: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(InvestmentAccountDialog);
    const dialog = fixture.componentInstance;
    dialog.form.patchValue({
      type: 'MUTUAL_FUND',
      name: 'Index fund',
      schemeCode: '120503',
      plan: 'Direct',
      option: 'Growth',
      recurringEnabled: true,
      recurringAmount: '5000',
      frequency: 'MONTHLY',
      recurringStartDate: '2026-01-01',
      sipType: 'STEP_UP',
      stepUpValue: '500',
      stepUpFrequency: 'HALF_YEARLY',
      stepUpMonth: '2026-07',
    });

    await dialog.save();

    expect(addInvestment).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
    expect(close).toHaveBeenCalledWith({ id: 'investment-1' });
  });
});
