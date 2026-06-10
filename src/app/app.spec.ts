import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { App } from './app';
import { BulkEditorDialog, type BulkEditorData } from './bulk-editor-dialog';
import {
  buildProcessedImportCsv,
  createBudgetImportTemplateCsv,
  parseBudgetImportCsv,
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

  it('should archive recurring parents instead of deleting their past range', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      archiveMonthlyTemplate: (
        template: unknown,
        month: string,
      ) => {
        archivedDate?: string;
        endDate?: string;
        auditTrail?: Array<{
          operation: string;
          effectiveEndDate?: string;
          effectiveStartDate?: string;
        }>;
      };
      templateVersionForMonth: (template: unknown, month: string) => unknown | null;
    };

    const archived = app.archiveMonthlyTemplate(
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2021-01-01',
        auditTrail: [
          {
            id: 'updated',
            operation: 'updated',
            recordedDate: '2022-04-01',
            effectiveStartDate: '2022-05-01',
            effectiveEndDate: '2022-07-31',
            name: 'Rent',
            categoryId: 'category-home',
            amount: 25000,
          },
        ],
      },
      '2022-07',
    );

    expect(archived.archivedDate).toBeTruthy();
    expect(archived.endDate).toBe('2022-07-31');
    expect(archived.auditTrail?.at(-1)).toMatchObject({
      operation: 'deleted',
      effectiveStartDate: '2022-08-01',
    });
    expect(app.templateVersionForMonth(archived, '2022-07')).toBeTruthy();
    expect(app.templateVersionForMonth(archived, '2022-08')).toBeNull();
  });

  it('should not use stale audit versions after a recurring parent is archived', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      archiveMonthlyTemplate: (template: unknown, month: string) => unknown;
      templateVersionForMonth: (template: unknown, month: string) => unknown | null;
    };

    const archived = app.archiveMonthlyTemplate(
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 9000,
        type: 'recurring',
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
      '2026-05',
    );

    expect(app.templateVersionForMonth(archived, '2026-04')).toBeNull();
    expect(app.templateVersionForMonth(archived, '2026-05')).toBeTruthy();
    expect(app.templateVersionForMonth(archived, '2026-08')).toBeNull();
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

  it('should validate recurring update dates and amount before applying', () => {
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

    dialog.templates[0].startDate = '2026-05-01';
    dialog.templates[0].endDate = '2026-04-30';
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

  it('should show archived recurring parents in the deleted recurring table', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        initialTabIndex: 1,
        templates: [
          ...dialogData.templates,
          {
            id: 'fixed-archived',
            name: 'Archived rent',
            categoryId: 'category-home',
            amount: 9000,
            type: 'recurring',
            startDate: '2026-08-01',
            endDate: '2026-04-30',
            archivedDate: '2026-05-01T00:00:00.000Z',
            auditTrail: [
              {
                id: 'updated',
                operation: 'updated',
                recordedDate: '2026-04-25T00:00:00.000Z',
                effectiveStartDate: '2026-05-01',
                effectiveEndDate: '2026-05-31',
                name: 'Archived rent',
                categoryId: 'category-home',
                amount: 8500,
              },
              {
                id: 'deleted',
                operation: 'deleted',
                recordedDate: '2026-05-01T00:00:00.000Z',
                effectiveStartDate: '2026-05-01',
                name: 'Archived rent',
                categoryId: 'category-home',
                amount: 9000,
              },
            ],
          },
        ],
      },
    });

    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      templates: Array<{ id: string }>;
      deletedTemplates: Array<{ id: string }>;
      deletedRecurringSummary: (template: unknown) => {
        amount: number;
        endDate?: string;
        startDate?: string;
      };
    };

    expect(dialog.templates.map((template) => template.id)).toEqual(['fixed-rent']);
    expect(dialog.deletedTemplates.map((template) => template.id)).toEqual(['fixed-archived']);
    expect(dialog.deletedRecurringSummary(dialog.deletedTemplates[0])).toMatchObject({
      amount: 8500,
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });

    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Deleted Recurring Expenses');
    expect(compiled.textContent).toContain('Archived rent');
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

describe('budget CSV import helpers', () => {
  it('should generate a template with import status output columns', () => {
    const template = createBudgetImportTemplateCsv();

    expect(template).toContain('recordType');
    expect(template).toContain('status');
    expect(template).toContain('comments');
    expect(template).toContain('recurring_expense');
  });

  it('should validate each row and map valid rows into app collections', () => {
    const csv = [
      'recordType,name,categoryName,monthlyBudget,color,amount,month,date,type',
      'category,Food,,15000,#1f7a8c,,,,',
      'expense,Groceries,Food,,,1200,2026-06,2026-06-04,one-time',
      'expense,Broken,Unknown,,,nope,2026-06,2026-06-05,one-time',
    ].join('\n');

    const parsed = parseBudgetImportCsv(csv, []);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].collectionName).toBe('categories');
    expect(parsed.rows[1].collectionName).toBe('expenses');
    expect(parsed.rows[2].status).toBe('error');
    expect(parsed.rows[2].comments.join(' ')).toContain('amount must be a number');
    expect(parsed.rows[2].comments.join(' ')).toContain('categoryName "Unknown" was not found');
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
