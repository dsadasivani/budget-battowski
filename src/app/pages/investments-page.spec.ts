import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import { InvestmentAccountDialog } from './investments-page';
import { BudgetStore } from '../budget.store';
import { InvestmentRepository } from '../data/investment.repository';
import { InvestmentStore } from '../stores/investment.store';

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

    const typeButtons = fixture.nativeElement.querySelectorAll(
      '.type-picker button',
    ) as NodeListOf<HTMLButtonElement>;
    typeButtons[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Track a recurring plan');
  });

  it('renders through the Material dialog overlay', async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentAccountDialog],
      providers: [
        provideNoopAnimations(),
        {
          provide: InvestmentStore,
          useValue: {
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
