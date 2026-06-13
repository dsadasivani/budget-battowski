import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { App } from './app';
import { BulkEditorDialog, type BulkEditorData } from './bulk-editor-dialog';
import {
  buildProcessedImportCsv,
  createBudgetImportTemplateCsv,
  createBudgetImportTemplateWorkbook,
  parseBudgetImportCsv,
  parseBudgetImportFile,
} from './budget-import.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("should default the month picker to today's month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      selectedMonth: () => string;
      pickerYear: () => number;
      openMonthPicker: () => void;
    };

    app.openMonthPicker();

    expect(app.selectedMonth()).toBe('2026-06');
    expect(app.pickerYear()).toBe(2026);
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

  it('should treat legacy expenses without an explicit type as one-time entries', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      expenses: {
        set: (records: unknown[]) => void;
      };
      oneTimeTotal: () => number;
      selectedEntries: () => Array<{ id: string; name: string }>;
      selectedMonth: { set: (month: string) => void };
    };

    app.selectedMonth.set('2026-06');
    app.expenses.set([
      {
        id: 'expense-legacy',
        month: '2026-06',
        date: '2026-06-04',
        name: 'Groceries',
        categoryId: 'category-food',
        amount: 1200,
        note: '',
      },
    ]);

    expect(app.selectedEntries().map((expense) => expense.id)).toContain('expense-legacy');
    expect(app.oneTimeTotal()).toBe(1200);
  });

  it('should approve reviewed recurring expenses into the selected month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<{ sourceId: string; sourceType: string }>;
      expenses: {
        (): Array<{ amount: number; month: string; templateId?: string }>;
      };
      firebase: { mode: string };
      hasMonthlyReviewRows: () => boolean;
      selectedEntries: () => Array<{ amount: number; templateId?: string }>;
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-01-01',
      },
    ]);

    expect(app.hasMonthlyReviewRows()).toBe(true);

    await app.applyMonthlyReview({
      rows: [
        {
          id: 'expense:fixed-rent',
          sourceId: 'fixed-rent',
          sourceType: 'expense',
          label: 'Rent',
          categoryName: 'Home',
          amount: 26000,
        },
      ],
    });

    expect(app.expenses()).toHaveLength(1);
    expect(app.selectedEntries()[0]).toMatchObject({
      amount: 26000,
      templateId: 'fixed-rent',
    });
    expect(app.buildMonthlyReviewRows('2026-06')).not.toContainEqual(
      expect.objectContaining({ sourceId: 'fixed-rent', sourceType: 'expense' }),
    );
    expect(app.hasMonthlyReviewRows()).toBe(false);
  });

  it('should require current recurring investments to be reviewed before they count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<{ sourceId: string; sourceType: string }>;
      firebase: { mode: string };
      investmentTotal: () => number;
      investmentPlans: () => Array<{ id: string; sourceInvestmentId?: string }>;
      investments: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; frequency: string; sourceInvestmentId?: string }>;
      };
      selectedMonth: { set: (month: string) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.investments.set([
      {
        id: 'sip-index',
        name: 'Index SIP',
        amount: 12000,
        categoryId: 'category-invest',
        frequency: 'recurring',
        startDate: '2026-01-01',
        notes: '',
      },
    ]);

    expect(app.investmentTotal()).toBe(0);

    await app.applyMonthlyReview({
      rows: [
        {
          id: 'investment:sip-index',
          sourceId: 'sip-index',
          sourceType: 'investment',
          label: 'Index SIP',
          categoryName: 'Investments',
          amount: 15000,
        },
      ],
    });

    expect(app.investmentTotal()).toBe(15000);
    expect(app.investments().some((record) => record.sourceInvestmentId === 'sip-index')).toBe(
      true,
    );
    expect(app.investmentPlans()).toEqual([
      expect.objectContaining({
        id: 'sip-index',
      }),
    ]);
    expect(app.buildMonthlyReviewRows('2026-06')).not.toContainEqual(
      expect.objectContaining({ sourceId: 'sip-index', sourceType: 'investment' }),
    );
  });

  it('should ignore monthly review actions for past months', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      expenses: { (): unknown[] };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      syncStatus: () => string;
      templates: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-05');
    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-01-01',
      },
    ]);

    await app.applyMonthlyReview({
      rows: [
        {
          id: 'expense:fixed-rent',
          sourceId: 'fixed-rent',
          sourceType: 'expense',
          label: 'Rent',
          categoryName: 'Home',
          amount: 26000,
        },
      ],
    });

    expect(app.expenses()).toHaveLength(0);
    expect(app.syncStatus()).toContain('current and future months');
  });

  it('should version recurring parent updates from the selected month forward', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        amount: number;
        startDate?: string;
        auditTrail?: Array<{ amount: number; effectiveEndDate?: string }>;
      };
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
    };

    const next = app.normalizeMonthlyTemplate({ ...previous, amount: 30000 }, previous, '2022-07');

    expect(next.amount).toBe(30000);
    expect(next.startDate).toBe('2022-07-01');
    expect(next.auditTrail?.at(-1)).toMatchObject({
      amount: 25000,
      effectiveEndDate: '2022-06-30',
    });
  });

  it('should keep the old recurring version until a future selected start date', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        startDate?: string;
        auditTrail?: Array<{ effectiveEndDate?: string }>;
      };
      templateVersionForMonth: (template: unknown, month: string) => { amount: number } | null;
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
    };

    const next = app.normalizeMonthlyTemplate(
      { ...previous, amount: 32000, startDate: '2022-09-01' },
      previous,
      '2022-07',
    );

    expect(next.startDate).toBe('2022-09-01');
    expect(next.auditTrail?.at(-1)?.effectiveEndDate).toBe('2022-08-31');
    expect(app.templateVersionForMonth(next, '2022-08')?.amount).toBe(25000);
    expect(app.templateVersionForMonth(next, '2022-09')?.amount).toBe(32000);
  });

  it('should keep recurring parent name and category immutable during updates', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        name: string;
        categoryId: string;
        amount: number;
      };
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
    };

    const next = app.normalizeMonthlyTemplate(
      { ...previous, name: 'Lease', categoryId: 'category-other', amount: 30000 },
      previous,
      '2022-07',
    );

    expect(next.name).toBe('Rent');
    expect(next.categoryId).toBe('category-home');
    expect(next.amount).toBe(30000);
  });

  it('should avoid duplicate recurring update audit rows', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        auditTrail?: Array<{ operation: string; effectiveEndDate?: string }>;
      };
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
      auditTrail: [
        {
          id: 'audit-existing',
          operation: 'updated',
          recordedDate: '2022-07-01',
          effectiveStartDate: '2021-01-01',
          effectiveEndDate: '2022-06-30',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 25000,
          startDate: '2021-01-01',
        },
      ],
    };

    const next = app.normalizeMonthlyTemplate(
      { ...previous, amount: 30000, auditTrail: previous.auditTrail },
      previous,
      '2022-07',
    );

    expect(next.auditTrail).toHaveLength(1);
    expect(next.auditTrail?.[0].effectiveEndDate).toBe('2022-06-30');
  });

  it('should hard delete recurring parents and remove only future generated expenses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      applyBulkChanges: (result: unknown) => Promise<void>;
      categories: { set: (records: unknown[]) => void };
      expenses: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; month: string; templateId?: string; type: string }>;
      };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string }>;
      };
    };
    const category = {
      id: 'category-home',
      name: 'Home',
      monthlyBudget: 35000,
      color: '#1f7a8c',
    };
    const template = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2026-01-01',
    };

    app.selectedMonth.set('2026-01');
    app.firebase.mode = 'local';
    app.categories.set([category]);
    app.templates.set([template]);
    app.expenses.set([
      {
        id: 'expense-jun',
        month: '2026-06',
        date: '2026-06-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: '',
        templateId: 'fixed-rent',
      },
      {
        id: 'expense-jul',
        month: '2026-07',
        date: '2026-07-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: '',
        templateId: 'fixed-rent',
      },
    ]);

    await app.applyBulkChanges({
      scope: 'monthly',
      categories: [category],
      incomes: [],
      templates: [],
      expenses: [],
      investments: [],
      loans: [],
      deleted: {
        categories: [],
        incomes: [],
        templates: ['fixed-rent'],
        expenses: [],
        investments: [],
        loans: [],
      },
    });

    const juneExpense = app.expenses().find((expense) => expense.id === 'expense-jun');
    expect(app.templates().some((record) => record.id === 'fixed-rent')).toBe(false);
    expect(app.expenses().map((expense) => expense.id)).toContain('expense-jun');
    expect(app.expenses().map((expense) => expense.id)).not.toContain('expense-jul');
    expect(juneExpense).toMatchObject({ type: 'recurring' });
    expect(juneExpense?.templateId).toBeUndefined();
  });

  it('should close loan deletes at the current month and remove only future EMI expenses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      applyBulkChanges: (result: unknown) => Promise<void>;
      expenses: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; month: string; templateId?: string }>;
      };
      firebase: { mode: string };
      loans: {
        set: (records: unknown[]) => void;
        (): Array<{
          id: string;
          endDate: string;
          auditTrail?: Array<{ operation: string; effectiveEndDate?: string }>;
        }>;
      };
    };
    const loan = {
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
    };

    app.firebase.mode = 'local';
    app.loans.set([loan]);
    const expenses = [
      {
        id: 'emi-jun',
        month: '2026-06',
        date: '2026-06-01',
        name: 'Home loan EMI',
        categoryId: '',
        amount: 38000,
        type: 'recurring',
        note: '',
        templateId: 'loan:loan-home',
      },
      {
        id: 'emi-jul',
        month: '2026-07',
        date: '2026-07-01',
        name: 'Home loan EMI',
        categoryId: '',
        amount: 38000,
        type: 'recurring',
        note: '',
        templateId: 'loan:loan-home',
      },
    ];

    app.expenses.set(expenses);

    await app.applyBulkChanges({
      scope: 'loans',
      categories: [],
      incomes: [],
      templates: [],
      expenses,
      investments: [],
      loans: [],
      deleted: {
        categories: [],
        incomes: [],
        templates: [],
        expenses: [],
        investments: [],
        loans: ['loan-home'],
      },
    });

    expect(app.loans()[0].endDate).toBe('2026-06-30');
    expect(app.loans()[0].auditTrail?.at(-1)).toMatchObject({
      operation: 'deleted',
      effectiveEndDate: '2026-06-30',
    });
    expect(app.expenses().map((expense) => expense.id)).toContain('emi-jun');
    expect(app.expenses().map((expense) => expense.id)).not.toContain('emi-jul');
  });

  it('should preserve the selected loan start date during updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      applyBulkChanges: (result: unknown) => Promise<void>;
      firebase: { mode: string };
      loans: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; startDate: string; emi: number }>;
      };
    };
    const loan = {
      id: 'loan-car',
      lender: 'Bank',
      loanType: 'Car loan',
      principal: 800000,
      outstanding: 500000,
      annualRate: 9,
      emi: 18000,
      startDate: '2026-06-01',
      endDate: '2030-05-31',
      notes: '',
    };

    app.firebase.mode = 'local';
    app.loans.set([loan]);

    await app.applyBulkChanges({
      scope: 'loans',
      categories: [],
      incomes: [],
      templates: [],
      expenses: [],
      investments: [],
      loans: [{ ...loan, emi: 19000, startDate: '2025-01-01' }],
      deleted: {
        categories: [],
        incomes: [],
        templates: [],
        expenses: [],
        investments: [],
        loans: [],
      },
    });

    expect(app.loans()[0]).toMatchObject({ startDate: '2025-01-01', emi: 19000 });
  });

  it('should show generated loan EMI expenses with the special display category', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      categoryName: (categoryId: string) => string;
      buildDefaultMonthEntries: (month: string) => Array<{ categoryId: string; name: string }>;
      loans: { set: (records: unknown[]) => void };
    };

    app.loans.set([
      {
        id: 'loan-home',
        lender: 'Bank',
        loanType: 'Home loan',
        principal: 4000000,
        outstanding: 3200000,
        annualRate: 8.7,
        emi: 38000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        notes: '',
      },
    ]);

    const loanExpense = app
      .buildDefaultMonthEntries('2026-06')
      .find((expense) => expense.name.includes('Bank - Home loan'));

    expect(loanExpense).toBeTruthy();
    expect(loanExpense?.name).toBe('Bank - Home loan');
    expect(loanExpense?.categoryId).toBe('category-loan-emi');
    expect(app.categoryName(loanExpense?.categoryId ?? '')).toBe('Loan EMI');
  });

  it('should materialize past recurring expenses while current months wait for review', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      buildDefaultMonthEntries: (
        month: string,
      ) => Array<{ name: string; templateId?: string; type: string }>;
      templates: { set: (records: unknown[]) => void };
    };

    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-05-01',
      },
    ]);

    expect(app.buildDefaultMonthEntries('2026-05')).toContainEqual(
      expect.objectContaining({
        name: 'Rent',
        templateId: 'fixed-rent',
        type: 'recurring',
      }),
    );
    expect(
      app
        .buildDefaultMonthEntries('2026-06')
        .some((expense) => expense.templateId === 'fixed-rent'),
    ).toBe(false);
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

  it('should render expenses and recurring parents in the scoped monthly editor', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Monthly Entry Editor');
    expect(compiled.textContent).toContain('Expenses');
    expect(compiled.textContent).toContain('Recurring');
    expect(compiled.textContent).not.toContain('Income');
    expect(compiled.textContent).not.toContain('Loans');
  });

  it('should suggest previous one-time expenses that are not already in the selected month', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-grocery-apr',
            month: '2026-04',
            date: '2026-04-10',
            name: 'Groceries',
            categoryId: 'category-home',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-medical-jan',
            month: '2026-01',
            date: '2026-01-10',
            name: 'Medical',
            categoryId: 'category-home',
            amount: 900,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-fuel-apr',
            month: '2026-04',
            date: '2026-04-12',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-fuel-may',
            month: '2026-05',
            date: '2026-05-02',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2600,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      expenses: Array<{
        name: string;
        categoryId: string;
        isSuggested?: boolean;
        suggestionMonth?: string;
      }>;
    };

    const suggestions = dialog.expenses.filter((expense) => expense.isSuggested);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      name: 'Groceries',
      categoryId: 'category-home',
      suggestionMonth: '2026-04',
    });
  });

  it('should save recurring parents separately and infer expense types', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      addExpense: () => void;
      apply: () => void;
      expenses: Array<{ name: string; amount: number; categoryId: string; templateId?: string }>;
    };

    dialog.addExpense();
    dialog.expenses[0].name = 'Snacks';
    dialog.expenses[0].amount = 450;
    dialog.expenses[0].categoryId = 'category-home';
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.templates).toHaveLength(1);
    expect(result.expenses.find((expense: { name: string }) => expense.name === 'Rent')?.type).toBe(
      'recurring',
    );
    expect(
      result.expenses.find((expense: { name: string }) => expense.name === 'Snacks')?.type,
    ).toBe('one-time');
  });

  it('should not persist untouched suggested one-time expense rows', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-grocery-apr',
            month: '2026-04',
            date: '2026-04-10',
            name: 'Groceries',
            categoryId: 'category-home',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
    };

    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.expenses.some((expense: { name: string }) => expense.name === 'Groceries')).toBe(
      false,
    );
  });

  it('should persist suggested one-time expense rows after an amount is entered', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-grocery-apr',
            month: '2026-04',
            date: '2026-04-10',
            name: 'Groceries',
            categoryId: 'category-home',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      expenses: Array<{ name: string; amount: number; isSuggested?: boolean }>;
    };

    const suggestion = dialog.expenses.find((expense) => expense.isSuggested);
    if (suggestion) {
      suggestion.amount = 3300;
    }
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(
      result.expenses.find((expense: { name: string }) => expense.name === 'Groceries'),
    ).toMatchObject({
      amount: 3300,
      month: '2026-05',
      type: 'one-time',
    });
  });

  it('should keep existing recurring name and category unchanged from the modal', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      templates: Array<{ name: string; categoryId: string; amount: number }>;
    };

    dialog.templates[0].name = 'Lease';
    dialog.templates[0].categoryId = '';
    dialog.templates[0].amount = 26000;
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.templates[0]).toMatchObject({
      name: 'Rent',
      categoryId: 'category-home',
      amount: 26000,
    });
  });

  it('should keep non-updatable income, investment, and loan fields unchanged from the modal', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      incomes: Array<{ source: string; cadence: string; amount: number }>;
      investments: Array<{ name: string; amount: number }>;
      loans: Array<{ lender: string; loanType: string; emi: number }>;
    };

    dialog.incomes[0].source = 'Changed salary';
    dialog.incomes[0].cadence = 'annual';
    dialog.incomes[0].amount = 130000;
    dialog.investments[0].name = 'Changed SIP';
    dialog.investments[0].amount = 18000;
    dialog.loans[0].lender = 'Changed bank';
    dialog.loans[0].loanType = 'Changed loan';
    dialog.loans[0].emi = 39000;
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.incomes[0]).toMatchObject({
      source: 'Salary',
      cadence: 'monthly',
      amount: 130000,
    });
    expect(result.investments[0]).toMatchObject({ name: 'Index SIP', amount: 18000 });
    expect(result.loans[0]).toMatchObject({
      lender: 'Bank',
      loanType: 'Home loan',
      emi: 39000,
    });
  });

  it('should allow unchanged recurring parents with historical starts', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        templates: [{ ...dialogData.templates[0], startDate: '2021-01-01' }],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      validationError: string;
    };

    dialog.apply();

    expect(dialog.validationError).toBe('');
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('should allow new recurring parents to start before the selected month', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      addRecurringExpense: () => void;
      apply: () => void;
      templates: Array<{
        amount: number;
        categoryId: string;
        name: string;
        startDate?: string;
      }>;
      validationError: string;
    };

    dialog.addRecurringExpense();
    dialog.templates[0].name = 'Hyd Rent';
    dialog.templates[0].categoryId = 'category-home';
    dialog.templates[0].amount = 35000;
    dialog.templates[0].startDate = '2026-05-01';
    dialog.apply();

    expect(dialog.validationError).toBe('');
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('should default new recurring parents to the current month, not selected month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: { ...dialogData, selectedMonth: '2026-01' },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      addRecurringExpense: () => void;
      templates: Array<{ startDate?: string }>;
    };

    dialog.addRecurringExpense();

    expect(dialog.templates[0].startDate).toBe('2026-06-01');
  });

  it('should validate recurring update dates and amount before applying', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      templates: Array<{ amount: number; startDate?: string; endDate?: string }>;
      validationError: string;
    };

    dialog.templates[0].amount = undefined as unknown as number;
    dialog.apply();

    expect(dialog.validationError).toContain('Amount is mandatory');
    expect(dialogRef.close).not.toHaveBeenCalled();

    dialog.templates[0].amount = 25000;
    dialog.templates[0].startDate = '2026-04-01';
    dialog.apply();

    expect(dialog.validationError).toContain('selected month or a future month');
    expect(dialogRef.close).not.toHaveBeenCalled();

    dialog.templates[0].startDate = '2026-06-01';
    dialog.templates[0].endDate = '2026-05-31';
    dialog.apply();

    expect(dialog.validationError).toContain('greater than the start date');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('should show only historical recurring audit rows', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      recurringAuditRows: (template: unknown) => Array<{
        amount: number;
        operation: string;
        recordedDate?: string;
      }>;
    };

    const rows = dialog.recurringAuditRows({
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 9000,
      type: 'recurring',
      startDate: '2026-08-01',
      auditTrail: [
        {
          id: 'created',
          operation: 'created',
          recordedDate: '2026-05-01',
          effectiveStartDate: '2026-05-01',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 8500,
        },
        {
          id: 'updated',
          operation: 'updated',
          recordedDate: '2026-07-01',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-07-31',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 8500,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 8500,
      operation: 'Updated',
      recordedDate: '2026-07-01',
    });
  });

  it('should show legacy-cased recurring audit rows', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      recurringAuditRows: (template: unknown) => Array<{ amount: number; operation: string }>;
    };

    const rows = dialog.recurringAuditRows({
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 9000,
      type: 'recurring',
      startDate: '2026-08-01',
      auditTrail: [
        {
          id: 'updated',
          operation: 'Updated',
          recordedDate: '2026-07-01',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-07-31',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 8500,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 8500, operation: 'Updated' });
  });

  it('should keep the audit expand button visible for recurring history', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        initialTabIndex: 1,
        templates: [
          {
            ...dialogData.templates[0],
            amount: 9000,
            startDate: '2026-08-01',
            auditTrail: [
              {
                id: 'updated',
                operation: 'updated',
                recordedDate: '2026-07-01',
                effectiveStartDate: '2026-05-01',
                effectiveEndDate: '2026-07-31',
                name: 'Rent',
                categoryId: 'category-home',
                amount: 8500,
              },
            ],
          },
        ],
      },
    });

    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('expand_more');
  });

  it('should format recurring audit timestamps for display', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      auditDateTimeLabel: (date: string | undefined) => string;
    };

    expect(dialog.auditDateTimeLabel(undefined)).toBe('Not recorded');
    expect(dialog.auditDateTimeLabel('not-a-date')).toBe('not-a-date');
    expect(dialog.auditDateTimeLabel('2026-07-01T10:30:00.000Z')).toContain('2026');
    expect(dialog.auditDateTimeLabel('2026-07-01T10:30:00.000Z')).toMatch(/\d{2}:\d{2}/);
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

describe('budget import helpers', () => {
  it('should generate a template with import status output columns', () => {
    const template = createBudgetImportTemplateCsv();

    expect(template).toContain('recordType');
    expect(template).toContain('status');
    expect(template).toContain('comments');
    expect(template).toContain('recurring_expense');
  });

  it('should add existing categories to the workbook master sheet', async () => {
    const XLSX = await import('xlsx');
    const workbookBlob = await createBudgetImportTemplateWorkbook([
      {
        id: 'category-home',
        name: 'Home',
        monthlyBudget: 35000,
        color: '#1f7a8c',
        type: 'Expenses',
      },
      {
        id: 'category-mf',
        name: 'Mutual Funds',
        monthlyBudget: 20000,
        color: '#047857',
        type: 'Investments',
      },
    ]);
    const workbook = XLSX.read(await workbookBlob.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(
      workbook.Sheets['master_categories'],
      { defval: '' },
    );

    expect(workbook.SheetNames[0]).toBe('master_categories');
    expect(rows).toContainEqual(
      expect.objectContaining({
        name: 'Home',
        type: 'Expenses',
        monthlyBudget: 35000,
        color: '#1f7a8c',
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        name: 'Mutual Funds',
        type: 'Investments',
      }),
    );
  });

  it('should ignore the workbook master sheet during import parsing', async () => {
    const workbookBlob = await createBudgetImportTemplateWorkbook([
      {
        id: 'category-home',
        name: 'Home',
        monthlyBudget: 35000,
        color: '#1f7a8c',
        type: 'Expenses',
      },
    ]);
    const file = new File([workbookBlob], 'budget-template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const parsed = await parseBudgetImportFile(file, []);

    expect(parsed.rows.every((row) => row.values['sheet'] !== 'master_categories')).toBe(true);
    expect(parsed.rows.some((row) => row.comments.join(' ').includes('master_categories'))).toBe(
      false,
    );
  });

  it('should validate each row and map valid rows into app collections', () => {
    const csv = [
      'recordType,name,categoryName,monthlyBudget,color,amount,month,date',
      'category,Food,,15000,#1f7a8c,,,',
      'expense,Groceries,Food,,,1200,2026-06,2026-06-04',
      'expense,Broken,Unknown,,,nope,2026-06,2026-06-05',
    ].join('\n');

    const parsed = parseBudgetImportCsv(csv, []);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].collectionName).toBe('categories');
    expect(parsed.rows[1].collectionName).toBe('expenses');
    expect((parsed.rows[1].record as { type: string }).type).toBe('one-time');
    expect(parsed.rows[2].status).toBe('error');
    expect(parsed.rows[2].comments.join(' ')).toContain('amount must be a number');
    expect(parsed.rows[2].comments.join(' ')).toContain('categoryName "Unknown" was not found');
  });

  it('should skip rows already marked successful in processed imports', () => {
    const csv = [
      'recordType,name,monthlyBudget,status,comments',
      'category,Food,15000,success,Imported into categories.',
      'category,Travel,12000,error,Fix and retry.',
    ].join('\n');

    const parsed = parseBudgetImportCsv(csv, []);

    expect(parsed.rows[0].status).toBe('success');
    expect(parsed.rows[0].collectionName).toBeUndefined();
    expect(parsed.rows[0].comments.join(' ')).toContain('Previously imported; skipped');
    expect(parsed.rows[1].collectionName).toBe('categories');
  });

  it('should build processed CSV files with status and comments columns', () => {
    const parsed = parseBudgetImportCsv('recordType,name,monthlyBudget\ncategory,Food,15000', []);
    parsed.rows[0].status = 'success';
    parsed.rows[0].comments.push('Imported into categories.');

    const output = buildProcessedImportCsv(parsed.headers, parsed.rows);

    expect(output.split('\n')[0]).toContain('status,comments');
    expect(output).toContain('success,Imported into categories.');
  });
});
