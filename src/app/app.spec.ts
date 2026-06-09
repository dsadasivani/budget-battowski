import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { App } from './app';
import { BulkEditorDialog, type BulkEditorData } from './bulk-editor-dialog';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the budget dashboard title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')?.textContent).toContain('Budget Battowski');
  });

  it('should carry the latest monthly income into future months', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      incomes: { set: (records: unknown[]) => void };
      monthlyIncome: () => number;
      selectedMonth: { set: (month: string) => void };
    };

    app.incomes.set([
      {
        id: 'income-salary:2026-05',
        source: 'Salary',
        amount: 120000,
        cadence: 'monthly',
        notes: '',
        month: '2026-05',
      },
    ]);

    app.selectedMonth.set('2026-06');
    expect(app.monthlyIncome()).toBe(120000);
  });
});

describe('BulkEditorDialog', () => {
  const dialogData: BulkEditorData = {
    scope: 'monthly',
    selectedMonth: '2026-05',
    categories: [{ id: 'category-home', name: 'Home', monthlyBudget: 35000, color: '#1f7a8c' }],
    incomes: [
      { id: 'income-salary', source: 'Salary', amount: 120000, cadence: 'monthly', notes: '' },
    ],
    templates: [
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        endDate: '2026-12-31',
      },
    ],
    expenses: [
      {
        id: 'expense-rent',
        month: '2026-05',
        date: '2026-05-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: 'Prepopulated from recurring plan',
        templateId: 'fixed-rent',
      },
    ],
    investments: [
      {
        id: 'investment-sip',
        name: 'Index SIP',
        amount: 15000,
        frequency: 'recurring',
        date: '2026-05-01',
        startDate: '2026-05-01',
        notes: '',
      },
    ],
    loans: [
      {
        id: 'loan-home',
        lender: 'Bank',
        loanType: 'Home loan',
        principal: 4000000,
        outstanding: 3200000,
        annualRate: 8.7,
        emi: 38000,
        startDate: '2024-01-01',
        endDate: '2036-12-31',
        notes: '',
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkEditorDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('should render only expenses in the scoped monthly editor', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Monthly Entry Editor');
    expect(compiled.textContent).toContain('Expenses');
    expect(compiled.textContent).not.toContain('Recurring Expenses');
    expect(compiled.textContent).not.toContain('Income');
    expect(compiled.textContent).not.toContain('Loans');
  });

  it('should render investments in the scoped planning editor', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: { ...dialogData, scope: 'planning', initialTabIndex: 2 },
    });

    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Income & Budget Editor');
    expect(compiled.textContent).toContain('Income');
    expect(compiled.textContent).toContain('Categories');
    expect(compiled.textContent).toContain('Investments');
    expect(compiled.textContent).not.toContain('Recurring Plans');
    expect(compiled.textContent).not.toContain('Loans');
  });
});
