import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNativeDateAdapter } from '@angular/material/core';

import type {
  BudgetCategory,
  Cadence,
  CategoryType,
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseTemplateAuditVersion,
  IncomeAuditVersion,
  IncomeSource,
  InvestmentAuditVersion,
  InvestmentEntry,
  InvestmentFrequency,
  Loan,
  LoanAuditVersion,
} from './budget.models';

type DraftRow<T extends { id: string }> = T & { isNew?: boolean; pendingDelete?: boolean };
type DraftExpense = DraftRow<ExpenseEntry> & {
  endDate?: string;
  isSuggested?: boolean;
  suggestionMonth?: string;
  startDate?: string;
};
type DraftTemplate = DraftRow<ExpenseTemplate>;
type RecurringAuditRow = {
  id: string;
  amount: number;
  categoryId: string;
  endDate?: string;
  label: string;
  name: string;
  operation: string;
  recordedDate?: string;
  startDate?: string;
};
type AuditDisplayRow = {
  id: string;
  amount: number;
  endDate?: string;
  name: string;
  operation: string;
  recordedDate?: string;
  startDate?: string;
};
export type BulkEditorScope = 'monthly' | 'planning' | 'loans';

export interface BulkEditorData {
  scope: BulkEditorScope;
  initialTabIndex?: number;
  selectedMonth: string;
  categories: BudgetCategory[];
  incomes: IncomeSource[];
  templates: ExpenseTemplate[];
  expenses: ExpenseEntry[];
  investments: InvestmentEntry[];
  loans: Loan[];
}

export interface BulkEditorResult {
  scope: BulkEditorScope;
  categories: BudgetCategory[];
  incomes: IncomeSource[];
  templates: ExpenseTemplate[];
  expenses: ExpenseEntry[];
  investments: InvestmentEntry[];
  loans: Loan[];
  deleted: {
    categories: string[];
    incomes: string[];
    templates: string[];
    expenses: string[];
    investments: string[];
    loans: string[];
  };
}

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function toNumber(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function optionalDate(value: string | undefined): string | undefined {
  return dateValue(value);
}

function dateValue(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return typeof value === 'string' ? value || undefined : undefined;
}

function requiredDate(value: unknown): string {
  return dateValue(value) ?? '';
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartDate(month: string): string {
  return `${month}-01`;
}

function addMonths(month: string, offset: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const shifted = new Date(year, monthIndex - 1 + offset, 1);

  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthStartDate(): string {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return monthStartDate(month);
}

function dateMonthKey(date?: string): string | undefined {
  const [year, month] = (date ?? '').split('-');
  return year && month ? `${year}-${month.padStart(2, '0')}` : undefined;
}

function expenseMonthKey(expense: Pick<ExpenseEntry, 'date' | 'month'>): string {
  return dateMonthKey(expense.date) ?? expense.month;
}

function expenseSuggestionKey(expense: Pick<ExpenseEntry, 'name' | 'categoryId'>): string {
  return `${expense.name.trim().toLowerCase()}::${expense.categoryId}`;
}

function isOneTimeExpense(expense: ExpenseEntry): boolean {
  const runtimeType = (expense as unknown as { type?: string }).type;
  return !expense.templateId && runtimeType !== 'recurring' && runtimeType !== 'investment';
}

function isOneTimeInvestment(investment: Pick<InvestmentEntry, 'frequency'>): boolean {
  return investment.frequency === 'one-time';
}

@Component({
  selector: 'app-bulk-editor-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './bulk-editor-dialog.html',
  styleUrl: './bulk-editor-dialog.scss',
})
export class BulkEditorDialog {
  private readonly dialogRef =
    inject<MatDialogRef<BulkEditorDialog, BulkEditorResult>>(MatDialogRef);
  protected readonly data = inject<BulkEditorData>(MAT_DIALOG_DATA);

  protected readonly incomeCadences: Cadence[] = [
    'daily',
    'weekly',
    'bi-weekly',
    'monthly',
    'quarterly',
    'half-yearly',
    'annual',
    'one-time',
  ];
  protected readonly investmentFrequencies: InvestmentFrequency[] = [
    'weekly',
    'monthly',
    'quarterly',
    'half-yearly',
    'annual',
    'one-time',
  ];
  protected readonly recurringFrequencies: InvestmentFrequency[] = this.investmentFrequencies;
  protected readonly categoryTypes: CategoryType[] = ['Income', 'Investments', 'Expenses'];

  private readonly sourceTemplates = cloneRows(this.data.templates);
  private readonly originalIncomesById = new Map(
    this.data.incomes.map((income) => [income.id, { ...income }]),
  );
  private readonly originalInvestmentsById = new Map(
    this.data.investments.map((investment) => [investment.id, { ...investment }]),
  );
  private readonly originalLoansById = new Map(
    this.data.loans.map((loan) => [loan.id, { ...loan }]),
  );
  private readonly originalTemplatesById = new Map(
    this.sourceTemplates.map((template) => [template.id, template]),
  );

  protected readonly categories = signal<Array<DraftRow<BudgetCategory>>>(
    cloneRows(this.data.categories).map((category) => ({
      ...category,
      type: category.type || 'Expenses',
    })),
  );
  protected readonly incomes = signal<Array<DraftRow<IncomeSource>>>(
    cloneRows(this.data.incomes).map((income) => ({
      ...income,
      month: income.month
        ? monthStartDate(dateMonthKey(income.month) ?? income.month)
        : income.month,
    })),
  );
  protected readonly templates = signal<DraftTemplate[]>(
    this.sourceTemplates
      .filter((template) => !template.archivedDate)
      .map((template) => ({
        ...template,
        frequency: template.frequency || 'monthly',
        startDate: template.startDate || currentMonthStartDate(),
      })),
  );
  protected readonly expenses = signal<DraftExpense[]>(this.buildExpenseRows());
  protected readonly investments = signal<Array<DraftRow<InvestmentEntry>>>(
    cloneRows(this.data.investments).map((investment) => ({
      ...investment,
      date: investment.date || monthStartDate(this.data.selectedMonth),
      frequency: investment.frequency || 'one-time',
    })),
  );
  protected readonly loans = signal<Array<DraftRow<Loan>>>(cloneRows(this.data.loans));
  protected readonly title = computed(() =>
    this.data.scope === 'monthly'
      ? 'Monthly Entry Editor'
      : this.data.scope === 'planning'
        ? 'Income & Budget Editor'
        : 'Loans & EMI Editor',
  );
  protected readonly showMonthlyTables = computed(() => this.data.scope === 'monthly');
  protected readonly showPlanningTables = computed(() => this.data.scope === 'planning');
  protected readonly showLoanTables = computed(() => this.data.scope === 'loans');
  protected readonly initialTabIndex = computed(() => this.data.initialTabIndex ?? 0);
  protected readonly expandedTemplateIds = signal(new Set<string>());
  protected readonly expandedAuditIds = signal(new Set<string>());
  protected readonly validationError = signal('');

  private buildExpenseRows(): DraftExpense[] {
    const currentMonthExpenses = cloneRows(this.data.expenses)
      .filter((expense) => expenseMonthKey(expense) === this.data.selectedMonth)
      .map<DraftExpense>((expense) => ({
        ...expense,
        date: expense.date || monthStartDate(expense.month || this.data.selectedMonth),
      }));
    const currentExpenseKeys = new Set(
      currentMonthExpenses
        .filter((expense) => isOneTimeExpense(expense))
        .map((expense) => expenseSuggestionKey(expense)),
    );
    const suggestedExpensesByKey = new Map<string, DraftExpense>();
    const earliestSuggestionMonth = addMonths(this.data.selectedMonth, -3);

    for (const expense of this.data.expenses) {
      const expenseMonth = expenseMonthKey(expense);
      if (
        !isOneTimeExpense(expense) ||
        !expenseMonth ||
        expenseMonth < earliestSuggestionMonth ||
        expenseMonth >= this.data.selectedMonth ||
        !expense.name.trim()
      ) {
        continue;
      }

      const suggestionKey = expenseSuggestionKey(expense);
      const existingSuggestion = suggestedExpensesByKey.get(suggestionKey);
      if (currentExpenseKeys.has(suggestionKey)) {
        continue;
      }

      if (existingSuggestion && (existingSuggestion.suggestionMonth ?? '') >= expenseMonth) {
        continue;
      }

      suggestedExpensesByKey.set(suggestionKey, {
        id: id('expense-suggestion'),
        month: this.data.selectedMonth,
        date: monthStartDate(this.data.selectedMonth),
        name: expense.name,
        categoryId: expense.categoryId,
        amount: undefined as unknown as number,
        type: 'one-time',
        note: '',
        isSuggested: true,
        suggestionMonth: expenseMonth,
      });
    }

    return [...currentMonthExpenses, ...suggestedExpensesByKey.values()];
  }

  protected addExpense(): void {
    this.expenses.update((expenses) => [
      {
        id: id('expense'),
        month: this.data.selectedMonth,
        date: monthStartDate(this.data.selectedMonth),
        name: '',
        categoryId: '',
        amount: undefined as unknown as number,
        type: 'one-time',
        note: '',
        isNew: true,
      },
      ...expenses,
    ]);
  }

  protected addRecurringExpense(): void {
    this.templates.update((templates) => [
      {
        id: id('fixed'),
        name: '',
        categoryId: '',
        amount: undefined as unknown as number,
        type: 'recurring',
        frequency: 'monthly',
        createdDate: todayDate(),
        startDate: currentMonthStartDate(),
        endDate: '',
        skippedMonths: [],
        isNew: true,
      },
      ...templates,
    ]);
  }

  protected addIncome(): void {
    this.incomes.update((incomes) => [
      {
        id: id('income'),
        source: '',
        amount: undefined as unknown as number,
        cadence: '' as Cadence,
        categoryId: '',
        notes: '',
        month: this.data.selectedMonth,
        createdDate: todayDate(),
        startDate: '',
        endDate: '',
        isNew: true,
      },
      ...incomes,
    ]);
  }

  protected addCategory(): void {
    this.categories.update((categories) => [
      {
        id: id('category'),
        name: '',
        monthlyBudget: undefined as unknown as number,
        color: '',
        type: 'Expenses',
        isNew: true,
      },
      ...categories,
    ]);
  }

  protected addLoan(): void {
    this.loans.update((loans) => [
      {
        id: id('loan'),
        lender: '',
        loanType: '',
        principal: undefined as unknown as number,
        outstanding: undefined as unknown as number,
        annualRate: undefined as unknown as number,
        emi: undefined as unknown as number,
        startDate: '',
        endDate: '',
        notes: '',
        isNew: true,
      },
      ...loans,
    ]);
  }

  protected addInvestment(): void {
    this.investments.update((investments) => [
      {
        id: id('investment'),
        name: '',
        amount: undefined as unknown as number,
        categoryId: '',
        frequency: 'one-time',
        date: monthStartDate(this.data.selectedMonth),
        startDate: '',
        endDate: '',
        notes: '',
        createdDate: todayDate(),
        isNew: true,
      },
      ...investments,
    ]);
  }

  protected visibleRowCount(): number {
    return this.visibleRows().length;
  }

  protected activeRowCount(): number {
    if (this.showMonthlyTables()) {
      return [...this.expenses(), ...this.templates()].filter((row) => !row.pendingDelete).length;
    }

    return this.visibleRows().filter((row) => !row.pendingDelete).length;
  }

  protected deletedRowCount(): number {
    return this.visibleRows().filter((row) => row.pendingDelete).length;
  }

  protected toggleDelete(row: DraftRow<{ id: string }>): void {
    row.pendingDelete = !row.pendingDelete;
    this.refreshRows();
  }

  private refreshRows(): void {
    this.categories.update((rows) => [...rows]);
    this.incomes.update((rows) => [...rows]);
    this.templates.update((rows) => [...rows]);
    this.expenses.update((rows) => [...rows]);
    this.investments.update((rows) => [...rows]);
    this.loans.update((rows) => [...rows]);
  }

  protected toggleTemplateAudit(templateId: string): void {
    this.expandedTemplateIds.update((ids) => {
      const next = new Set(ids);
      next.has(templateId) ? next.delete(templateId) : next.add(templateId);
      return next;
    });
  }

  protected isTemplateAuditExpanded(templateId: string): boolean {
    return this.expandedTemplateIds().has(templateId);
  }

  protected toggleAudit(recordId: string): void {
    this.expandedAuditIds.update((ids) => {
      const next = new Set(ids);
      next.has(recordId) ? next.delete(recordId) : next.add(recordId);
      return next;
    });
  }

  protected isAuditExpanded(recordId: string): boolean {
    return this.expandedAuditIds().has(recordId);
  }

  protected recurringAuditRows(template: ExpenseTemplate): RecurringAuditRow[] {
    return (template.auditTrail ?? [])
      .filter((audit) => this.isHistoricalAuditVersion(audit))
      .map((audit) => this.auditRowFromVersion(audit))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected incomeAuditRows(income: IncomeSource): AuditDisplayRow[] {
    return (income.auditTrail ?? [])
      .filter((audit) => this.isVisibleAuditOperation(audit.operation))
      .map((audit) => ({
        id: audit.id,
        operation: this.auditOperationLabel(audit.operation),
        name: audit.source,
        amount: audit.amount,
        recordedDate: audit.recordedDate,
        startDate: audit.effectiveStartDate || audit.startDate || audit.month,
        endDate: audit.effectiveEndDate || audit.endDate,
      }))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected investmentAuditRows(investment: InvestmentEntry): AuditDisplayRow[] {
    return (investment.auditTrail ?? [])
      .filter((audit) => this.isVisibleAuditOperation(audit.operation))
      .map((audit) => ({
        id: audit.id,
        operation: this.auditOperationLabel(audit.operation),
        name: audit.name,
        amount: audit.amount,
        recordedDate: audit.recordedDate,
        startDate:
          audit.effectiveStartDate ||
          audit.startDate ||
          audit.date ||
          monthStartDate(this.data.selectedMonth),
        endDate: audit.effectiveEndDate || audit.endDate,
      }))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected loanAuditRows(loan: Loan): AuditDisplayRow[] {
    return (loan.auditTrail ?? [])
      .filter((audit) => this.isVisibleAuditOperation(audit.operation))
      .map((audit) => ({
        id: audit.id,
        operation: this.auditOperationLabel(audit.operation),
        name: `${audit.lender} ${audit.loanType}`.trim(),
        amount: audit.emi,
        recordedDate: audit.recordedDate,
        startDate: audit.effectiveStartDate || audit.startDate,
        endDate: audit.effectiveEndDate || audit.endDate,
      }))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected categoryName(categoryId: string): string {
    return (
      this.categories().find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
    );
  }

  protected categoriesByType(type: CategoryType): Array<DraftRow<BudgetCategory>> {
    return this.categories().filter((category) => (category.type ?? 'Expenses') === type);
  }

  protected auditMonthLabel(date: string | undefined, fallback: string): string {
    const month = dateMonthKey(date);
    if (!month) {
      return fallback;
    }

    const [year, monthIndex] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
      new Date(year, monthIndex - 1, 1),
    );
  }

  protected auditDateTimeLabel(date: string | undefined): string {
    if (!date) {
      return 'Not recorded';
    }

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(parsed);
  }

  protected apply(): void {
    if (this.hasLoanDateErrors()) {
      this.validationError.set('Every active loan must have both start and end dates.');
      return;
    }

    const recurringValidationError = this.recurringValidationError();
    if (recurringValidationError) {
      this.validationError.set(recurringValidationError);
      return;
    }

    const createdDate = todayDate();
    const expenseRows = this.activeExpenseRows();
    const templates = this.templates()
      .filter((template) => !template.pendingDelete)
      .map((template) => {
        const original = this.originalTemplatesById.get(template.id);

        return {
          id: template.id,
          name: template.isNew
            ? template.name.trim() || 'Recurring expense'
            : original?.name || template.name.trim() || 'Recurring expense',
          categoryId: template.isNew
            ? template.categoryId
            : original?.categoryId || template.categoryId,
          amount: toNumber(template.amount),
          type: 'recurring' as const,
          frequency: template.frequency || 'monthly',
          createdDate: template.createdDate || createdDate,
          startDate: optionalDate(template.startDate) || currentMonthStartDate(),
          endDate: optionalDate(template.endDate),
          skippedMonths: template.skippedMonths ?? [],
          archivedDate: template.archivedDate,
          auditTrail: template.auditTrail ?? [],
        };
      });
    const expenses = this.showMonthlyTables()
      ? expenseRows.map((expense) => ({
          id: expense.id,
          month: dateMonthKey(dateValue(expense.date)) || expense.month || this.data.selectedMonth,
          date:
            optionalDate(expense.date) || monthStartDate(expense.month || this.data.selectedMonth),
          name: expense.name.trim() || 'Expense',
          categoryId: expense.categoryId,
          amount: toNumber(expense.amount),
          type: expense.templateId
            ? ('recurring' as const)
            : expense.type === 'recurring'
              ? ('recurring' as const)
              : ('one-time' as const),
          note: expense.note ?? '',
          templateId: expense.templateId || undefined,
        }))
      : this.data.expenses;

    this.dialogRef.close({
      scope: this.data.scope,
      categories: this.activeRows(this.categories()).map((category) => ({
        id: category.id,
        name: category.name.trim() || 'Category',
        monthlyBudget: toNumber(category.monthlyBudget),
        color: category.color || '#1f7a8c',
        type: category.type || 'Expenses',
      })),
      incomes: this.incomes()
        .filter((income) => !income.pendingDelete)
        .map((income) => ({
          id: income.id,
          source: income.isNew
            ? income.source.trim() || 'Income'
            : this.originalIncomesById.get(income.id)?.source || income.source.trim() || 'Income',
          amount: toNumber(income.amount),
          cadence: income.isNew
            ? income.cadence || 'monthly'
            : this.originalIncomesById.get(income.id)?.cadence || income.cadence || 'monthly',
          notes: income.notes ?? '',
          categoryId: income.categoryId,
          month: dateMonthKey(dateValue(income.month)) || income.month || this.data.selectedMonth,
          createdDate: income.createdDate || createdDate,
          startDate: optionalDate(income.startDate),
          endDate: optionalDate(income.endDate),
          auditTrail: income.auditTrail ?? [],
        })),
      templates,
      expenses,
      investments: this.investments()
        .filter((investment) => !investment.pendingDelete)
        .map((investment) => ({
          id: investment.id,
          name: investment.isNew
            ? investment.name.trim() || 'Investment'
            : this.originalInvestmentsById.get(investment.id)?.name ||
              investment.name.trim() ||
              'Investment',
          amount: toNumber(investment.amount),
          categoryId: investment.categoryId,
          frequency: investment.frequency || 'one-time',
          date: optionalDate(investment.date) || monthStartDate(this.data.selectedMonth),
          startDate: !isOneTimeInvestment(investment)
            ? optionalDate(investment.startDate) || optionalDate(investment.date)
            : optionalDate(investment.startDate),
          endDate: optionalDate(investment.endDate),
          notes: investment.notes ?? '',
          createdDate: investment.createdDate || createdDate,
          skippedMonths: investment.skippedMonths ?? [],
          sourceInvestmentId: investment.sourceInvestmentId,
          auditTrail: investment.auditTrail ?? [],
        })),
      loans: this.loans()
        .filter((loan) => !loan.pendingDelete)
        .map((loan) => ({
          id: loan.id,
          lender: loan.isNew
            ? loan.lender.trim() || 'Lender'
            : this.originalLoansById.get(loan.id)?.lender || loan.lender.trim() || 'Lender',
          loanType: loan.isNew
            ? loan.loanType.trim() || 'Loan'
            : this.originalLoansById.get(loan.id)?.loanType || loan.loanType.trim() || 'Loan',
          principal: toNumber(loan.principal),
          outstanding: toNumber(loan.outstanding),
          annualRate: toNumber(loan.annualRate),
          emi: toNumber(loan.emi),
          startDate: requiredDate(loan.startDate),
          endDate: requiredDate(loan.endDate),
          notes: loan.notes ?? '',
          auditTrail: loan.auditTrail ?? [],
        })),
      deleted: {
        categories: this.deletedIds(this.categories()),
        incomes: this.deletedIds(this.incomes()),
        templates: this.deletedIds(this.templates()),
        expenses: this.deletedIds(this.expenses()),
        investments: this.deletedIds(this.investments()),
        loans: this.deletedIds(this.loans()),
      },
    });
  }

  protected hasLoanDateErrors(): boolean {
    return this.activeRows(this.loans()).some(
      (loan) => !dateValue(loan.startDate) || !dateValue(loan.endDate),
    );
  }

  private visibleRows(): Array<DraftRow<{ id: string }>> {
    if (this.showMonthlyTables()) {
      return [...this.expenses(), ...this.templates()];
    }

    if (this.showPlanningTables()) {
      return [...this.incomes(), ...this.investments(), ...this.categories()];
    }

    return this.loans();
  }

  private activeRows<T extends { id: string }>(rows: Array<DraftRow<T>>): T[] {
    return rows
      .filter((row) => !row.pendingDelete)
      .map(({ isNew: _isNew, pendingDelete: _pendingDelete, ...row }) => row as T);
  }

  private deletedIds<T extends { id: string }>(rows: Array<DraftRow<T>>): string[] {
    return rows.filter((row) => row.pendingDelete).map((row) => row.id);
  }

  private activeExpenseRows(): DraftExpense[] {
    return this.expenses()
      .filter((expense) => !expense.pendingDelete)
      .filter((expense) => !expense.isSuggested || this.isSuggestedExpenseReady(expense))
      .map(({ isNew: _isNew, pendingDelete: _pendingDelete, ...expense }) => expense);
  }

  private isSuggestedExpenseReady(expense: DraftExpense): boolean {
    const amount = Number(expense.amount);
    return Number.isFinite(amount) && amount > 0;
  }

  private recurringValidationError(): string {
    if (!this.showMonthlyTables()) {
      return '';
    }

    const earliestStartDate = currentMonthStartDate();

    for (const template of this.templates()) {
      if (template.pendingDelete) {
        continue;
      }

      const original = this.originalTemplatesById.get(template.id);
      const isCreate = template.isNew || !original;
      const isUpdate = !!original && this.isRecurringDraftChanged(template, original);
      if (!isCreate && !isUpdate) {
        continue;
      }

      const amount = Number(template.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return 'Amount is mandatory for every active recurring expense.';
      }

      const startDate = optionalDate(template.startDate) || currentMonthStartDate();
      const endDate = optionalDate(template.endDate);

      if (isUpdate && startDate < earliestStartDate) {
        return 'Recurring updates can only start from the selected month or a future month.';
      }

      if (endDate && endDate <= startDate) {
        return 'Recurring end date must be greater than the start date.';
      }
    }

    return '';
  }

  private isRecurringDraftChanged(template: DraftTemplate, original: ExpenseTemplate): boolean {
    const currentStartDate = currentMonthStartDate();

    return (
      toNumber(template.amount) !== original.amount ||
      (template.frequency || 'monthly') !== (original.frequency || 'monthly') ||
      (optionalDate(template.startDate) || currentStartDate) !==
        (optionalDate(original.startDate) || currentStartDate) ||
      (optionalDate(template.endDate) || '') !== (optionalDate(original.endDate) || '')
    );
  }

  private auditRowFromVersion(audit: ExpenseTemplateAuditVersion): RecurringAuditRow {
    return {
      id: audit.id,
      operation:
        audit.operation === 'created'
          ? 'Created'
          : audit.operation === 'deleted'
            ? 'Deleted'
            : 'Updated',
      label:
        audit.operation === 'deleted'
          ? 'Future records stopped from the next version'
          : 'Previous values kept for past months',
      name: audit.name,
      categoryId: audit.categoryId,
      amount: audit.amount,
      recordedDate: audit.recordedDate,
      startDate: audit.effectiveStartDate || audit.startDate,
      endDate: audit.effectiveEndDate || audit.endDate,
    };
  }

  private isHistoricalAuditVersion(audit: ExpenseTemplateAuditVersion): boolean {
    const operation = audit.operation.toLowerCase();
    return operation !== 'created' && operation !== 'deleted';
  }

  private isVisibleAuditOperation(
    operation:
      | ExpenseTemplateAuditVersion['operation']
      | IncomeAuditVersion['operation']
      | InvestmentAuditVersion['operation']
      | LoanAuditVersion['operation'],
  ): boolean {
    return operation !== 'created';
  }

  private auditOperationLabel(operation: string): string {
    return operation === 'deleted' ? 'Deleted' : operation === 'updated' ? 'Updated' : 'Created';
  }
}
