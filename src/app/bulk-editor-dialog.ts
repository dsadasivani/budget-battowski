import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
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
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseTemplateAuditVersion,
  IncomeSource,
  InvestmentEntry,
  InvestmentFrequency,
  Loan,
} from './budget.models';

type DraftRow<T extends { id: string }> = T & { isNew?: boolean; pendingDelete?: boolean };
type DraftExpense = DraftRow<ExpenseEntry> & {
  endDate?: string;
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

function dateMonthKey(date?: string): string | undefined {
  const [year, month] = (date ?? '').split('-');
  return year && month ? `${year}-${month.padStart(2, '0')}` : undefined;
}

function expenseMonthKey(expense: Pick<ExpenseEntry, 'date' | 'month'>): string {
  return dateMonthKey(expense.date) ?? expense.month;
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
  protected readonly incomeCadences: Cadence[] = ['monthly', 'annual', 'variable'];
  protected readonly investmentFrequencies: InvestmentFrequency[] = ['one-time', 'recurring'];

  protected readonly categories: Array<DraftRow<BudgetCategory>>;
  protected readonly incomes: Array<DraftRow<IncomeSource>>;
  protected readonly templates: DraftTemplate[];
  protected readonly deletedTemplates: ExpenseTemplate[];
  protected readonly expenses: DraftExpense[];
  protected readonly investments: Array<DraftRow<InvestmentEntry>>;
  protected readonly loans: Array<DraftRow<Loan>>;
  protected readonly title: string;
  protected readonly showMonthlyTables: boolean;
  protected readonly showPlanningTables: boolean;
  protected readonly showLoanTables: boolean;
  protected readonly initialTabIndex: number;
  protected readonly expandedTemplateIds = new Set<string>();
  private readonly originalTemplatesById: Map<string, ExpenseTemplate>;
  protected validationError = '';

  constructor(
    private readonly dialogRef: MatDialogRef<BulkEditorDialog, BulkEditorResult>,
    @Inject(MAT_DIALOG_DATA) protected readonly data: BulkEditorData,
  ) {
    const templates = cloneRows(data.templates);
    this.originalTemplatesById = new Map(templates.map((template) => [template.id, template]));
    this.categories = cloneRows(data.categories);
    this.incomes = cloneRows(data.incomes);
    this.templates = templates
      .filter((template) => !template.archivedDate)
      .map((template) => ({
        ...template,
        startDate: template.startDate || monthStartDate(data.selectedMonth),
      }));
    this.deletedTemplates = templates
      .filter((template) => !!template.archivedDate)
      .sort((a, b) => (b.archivedDate ?? '').localeCompare(a.archivedDate ?? ''));
    this.expenses = cloneRows(data.expenses)
      .filter((expense) => expenseMonthKey(expense) === data.selectedMonth)
      .map<DraftExpense>((expense) => ({
        ...expense,
        date: expense.date || monthStartDate(expense.month || data.selectedMonth),
      }));
    this.investments = cloneRows(data.investments).map((investment) => ({
      ...investment,
      date: investment.date || monthStartDate(data.selectedMonth),
      frequency: investment.frequency || 'one-time',
    }));
    this.loans = cloneRows(data.loans);
    this.title =
      data.scope === 'monthly'
        ? 'Monthly Entry Editor'
        : data.scope === 'planning'
          ? 'Income & Budget Editor'
          : 'Loans & EMI Editor';
    this.showMonthlyTables = data.scope === 'monthly';
    this.showPlanningTables = data.scope === 'planning';
    this.showLoanTables = data.scope === 'loans';
    this.initialTabIndex = data.initialTabIndex ?? 0;
  }

  protected addExpense(): void {
    this.expenses.unshift({
      id: id('expense'),
      month: this.data.selectedMonth,
      date: monthStartDate(this.data.selectedMonth),
      name: '',
      categoryId: '',
      amount: undefined as unknown as number,
      type: 'one-time',
      note: '',
      isNew: true,
    });
  }

  protected addRecurringExpense(): void {
    this.templates.unshift({
      id: id('fixed'),
      name: '',
      categoryId: '',
      amount: undefined as unknown as number,
      type: 'recurring',
      createdDate: todayDate(),
      startDate: monthStartDate(this.data.selectedMonth),
      endDate: '',
      skippedMonths: [],
      isNew: true,
    });
  }

  protected addIncome(): void {
    this.incomes.unshift({
      id: id('income'),
      source: '',
      amount: undefined as unknown as number,
      cadence: '' as Cadence,
      notes: '',
      month: this.data.selectedMonth,
      createdDate: todayDate(),
      startDate: '',
      endDate: '',
      isNew: true,
    });
  }

  protected addCategory(): void {
    this.categories.unshift({
      id: id('category'),
      name: '',
      monthlyBudget: undefined as unknown as number,
      color: '',
      isNew: true,
    });
  }

  protected addLoan(): void {
    this.loans.unshift({
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
    });
  }

  protected addInvestment(): void {
    this.investments.unshift({
      id: id('investment'),
      name: '',
      amount: undefined as unknown as number,
      frequency: 'one-time',
      date: monthStartDate(this.data.selectedMonth),
      startDate: '',
      endDate: '',
      notes: '',
      createdDate: todayDate(),
      isNew: true,
    });
  }

  protected visibleRowCount(): number {
    return this.visibleRows().length;
  }

  protected activeRowCount(): number {
    if (this.showMonthlyTables) {
      return [...this.expenses, ...this.templates].filter((row) => !row.pendingDelete).length;
    }

    return this.visibleRows().filter((row) => !row.pendingDelete).length;
  }

  protected deletedRowCount(): number {
    return this.visibleRows().filter((row) => row.pendingDelete).length;
  }

  protected toggleDelete(row: DraftRow<{ id: string }>): void {
    row.pendingDelete = !row.pendingDelete;
  }

  protected toggleTemplateAudit(templateId: string): void {
    if (this.expandedTemplateIds.has(templateId)) {
      this.expandedTemplateIds.delete(templateId);
      return;
    }

    this.expandedTemplateIds.add(templateId);
  }

  protected isTemplateAuditExpanded(templateId: string): boolean {
    return this.expandedTemplateIds.has(templateId);
  }

  protected recurringAuditRows(template: ExpenseTemplate): RecurringAuditRow[] {
    return (template.auditTrail ?? [])
      .filter((audit) => this.isHistoricalAuditVersion(audit))
      .map((audit) => this.auditRowFromVersion(audit))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected deletedRecurringAuditRows(template: ExpenseTemplate): RecurringAuditRow[] {
    return (template.auditTrail ?? [])
      .filter((audit) => audit.operation.toLowerCase() !== 'created')
      .map((audit) => this.auditRowFromVersion(audit))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.recordedDate ?? '').localeCompare(a.recordedDate ?? ''));
  }

  protected deletedRecurringSummary(template: ExpenseTemplate): RecurringAuditRow {
    if (!template.startDate || !template.endDate || template.startDate <= template.endDate) {
      return {
        id: template.id,
        amount: template.amount,
        categoryId: template.categoryId,
        endDate: template.endDate,
        label: 'Archived recurring expense',
        name: template.name,
        operation: 'Deleted',
        recordedDate: template.archivedDate,
        startDate: template.startDate,
      };
    }

    const historicalRow = this.deletedRecurringAuditRows(template)
      .filter((audit) => audit.operation !== 'Deleted')
      .sort(
        (a, b) =>
          (b.endDate ?? '').localeCompare(a.endDate ?? '') ||
          (b.startDate ?? '').localeCompare(a.startDate ?? ''),
      )[0];

    return (
      historicalRow ?? {
        id: template.id,
        amount: template.amount,
        categoryId: template.categoryId,
        endDate: template.endDate,
        label: 'Archived recurring expense',
        name: template.name,
        operation: 'Deleted',
        recordedDate: template.archivedDate,
        startDate: template.startDate,
      }
    );
  }

  protected categoryName(categoryId: string): string {
    return this.categories.find((category) => category.id === categoryId)?.name ?? 'Uncategorized';
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
      this.validationError = 'Every active loan must have both start and end dates.';
      return;
    }

    const recurringValidationError = this.recurringValidationError();
    if (recurringValidationError) {
      this.validationError = recurringValidationError;
      return;
    }

    const createdDate = todayDate();
    const expenseRows = this.activeExpenseRows();
    const templates = this.templates
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
          createdDate: template.createdDate || createdDate,
          startDate: optionalDate(template.startDate) || monthStartDate(this.data.selectedMonth),
          endDate: optionalDate(template.endDate),
          skippedMonths: template.skippedMonths ?? [],
          archivedDate: template.archivedDate,
          auditTrail: template.auditTrail ?? [],
        };
      });
    const expenses = this.showMonthlyTables
      ? expenseRows.map((expense) => ({
          id: expense.id,
          month: dateMonthKey(dateValue(expense.date)) || expense.month || this.data.selectedMonth,
          date:
            optionalDate(expense.date) || monthStartDate(expense.month || this.data.selectedMonth),
          name: expense.name.trim() || 'Expense',
          categoryId: expense.categoryId,
          amount: toNumber(expense.amount),
          type: expense.templateId ? ('recurring' as const) : ('one-time' as const),
          note: expense.note ?? '',
          templateId: expense.templateId || undefined,
        }))
      : this.data.expenses;

    this.dialogRef.close({
      scope: this.data.scope,
      categories: this.activeRows(this.categories).map((category) => ({
        id: category.id,
        name: category.name.trim() || 'Category',
        monthlyBudget: toNumber(category.monthlyBudget),
        color: category.color || '#1f7a8c',
      })),
      incomes: this.activeRows(this.incomes).map((income) => ({
        id: income.id,
        source: income.source.trim() || 'Income',
        amount: toNumber(income.amount),
        cadence: income.cadence || 'monthly',
        notes: income.notes ?? '',
        month: income.month || this.data.selectedMonth,
        createdDate: income.createdDate || createdDate,
        startDate: optionalDate(income.startDate),
        endDate: optionalDate(income.endDate),
      })),
      templates,
      expenses,
      investments: this.activeRows(this.investments).map((investment) => ({
        id: investment.id,
        name: investment.name.trim() || 'Investment',
        amount: toNumber(investment.amount),
        frequency: investment.frequency || 'one-time',
        date: optionalDate(investment.date) || monthStartDate(this.data.selectedMonth),
        startDate:
          investment.frequency === 'recurring'
            ? optionalDate(investment.startDate) || optionalDate(investment.date)
            : optionalDate(investment.startDate),
        endDate: optionalDate(investment.endDate),
        notes: investment.notes ?? '',
        createdDate: investment.createdDate || createdDate,
      })),
      loans: this.activeRows(this.loans).map((loan) => ({
        id: loan.id,
        lender: loan.lender.trim() || 'Lender',
        loanType: loan.loanType.trim() || 'Loan',
        principal: toNumber(loan.principal),
        outstanding: toNumber(loan.outstanding),
        annualRate: toNumber(loan.annualRate),
        emi: toNumber(loan.emi),
        startDate: requiredDate(loan.startDate),
        endDate: requiredDate(loan.endDate),
        notes: loan.notes ?? '',
      })),
      deleted: {
        categories: this.deletedIds(this.categories),
        incomes: this.deletedIds(this.incomes),
        templates: this.deletedIds(this.templates),
        expenses: this.deletedIds(this.expenses),
        investments: this.deletedIds(this.investments),
        loans: this.deletedIds(this.loans),
      },
    });
  }

  protected hasLoanDateErrors(): boolean {
    return this.activeRows(this.loans).some(
      (loan) => !dateValue(loan.startDate) || !dateValue(loan.endDate),
    );
  }

  private visibleRows(): Array<DraftRow<{ id: string }>> {
    if (this.showMonthlyTables) {
      return [...this.expenses, ...this.templates, ...this.deletedTemplates];
    }

    if (this.showPlanningTables) {
      return [...this.incomes, ...this.investments, ...this.categories];
    }

    return this.loans;
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
    return this.expenses
      .filter((expense) => !expense.pendingDelete)
      .map(({ isNew: _isNew, pendingDelete: _pendingDelete, ...expense }) => expense);
  }

  private recurringValidationError(): string {
    if (!this.showMonthlyTables) {
      return '';
    }

    const earliestStartDate = monthStartDate(this.data.selectedMonth);

    for (const template of this.templates) {
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

      const startDate = optionalDate(template.startDate) || monthStartDate(this.data.selectedMonth);
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
    const selectedStartDate = monthStartDate(this.data.selectedMonth);

    return (
      toNumber(template.amount) !== original.amount ||
      (optionalDate(template.startDate) || selectedStartDate) !==
        (optionalDate(original.startDate) || selectedStartDate) ||
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
}
