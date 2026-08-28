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
});
