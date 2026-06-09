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
  ExpenseType,
  IncomeSource,
  InvestmentEntry,
  InvestmentFrequency,
  Loan,
} from './budget.models';

type DraftRow<T extends { id: string }> = T & { isNew?: boolean; pendingDelete?: boolean };
type DraftExpense = DraftRow<ExpenseEntry> & {
  endDate?: string;
  recurringTemplateId?: string;
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
  protected readonly expenseTypes: ExpenseType[] = ['one-time', 'recurring'];
  protected readonly investmentFrequencies: InvestmentFrequency[] = ['one-time', 'recurring'];

  protected readonly categories: Array<DraftRow<BudgetCategory>>;
  protected readonly incomes: Array<DraftRow<IncomeSource>>;
  protected readonly templates: Array<DraftRow<ExpenseTemplate>>;
  protected readonly expenses: DraftExpense[];
  protected readonly investments: Array<DraftRow<InvestmentEntry>>;
  protected readonly loans: Array<DraftRow<Loan>>;
  protected readonly title: string;
  protected readonly showMonthlyTables: boolean;
  protected readonly showPlanningTables: boolean;
  protected readonly showLoanTables: boolean;
  protected readonly initialTabIndex: number;
  protected validationError = '';

  constructor(
    private readonly dialogRef: MatDialogRef<BulkEditorDialog, BulkEditorResult>,
    @Inject(MAT_DIALOG_DATA) protected readonly data: BulkEditorData,
  ) {
    this.categories = cloneRows(data.categories);
    this.incomes = cloneRows(data.incomes);
    this.templates = cloneRows(data.templates).map((template) => ({
      ...template,
      startDate: template.startDate || monthStartDate(data.selectedMonth),
    }));
    const recurringTemplateIds = new Set(data.templates.map((template) => template.id));
    this.expenses = [
      ...cloneRows(data.expenses)
        .filter((expense) => expenseMonthKey(expense) === data.selectedMonth)
        .filter((expense) => !expense.templateId || !recurringTemplateIds.has(expense.templateId))
        .map<DraftExpense>((expense) => ({
          ...expense,
          date: expense.date || monthStartDate(expense.month || data.selectedMonth),
        })),
      ...this.templates.map<DraftExpense>((template) => ({
        id: `template-row:${template.id}`,
        month: data.selectedMonth,
        date: template.startDate || monthStartDate(data.selectedMonth),
        name: template.name,
        categoryId: template.categoryId,
        amount: template.amount,
        type: 'recurring',
        note: '',
        recurringTemplateId: template.id,
        startDate: template.startDate || monthStartDate(data.selectedMonth),
        endDate: template.endDate || '',
      })),
    ];
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
      startDate: '',
      endDate: '',
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
    return this.visibleRows().filter((row) => !row.pendingDelete).length;
  }

  protected deletedRowCount(): number {
    return this.visibleRows().filter((row) => row.pendingDelete).length;
  }

  protected toggleDelete(row: DraftRow<{ id: string }>): void {
    row.pendingDelete = !row.pendingDelete;
  }

  protected apply(): void {
    if (this.hasLoanDateErrors()) {
      this.validationError = 'Every active loan must have both start and end dates.';
      return;
    }

    const createdDate = todayDate();
    const activeExpenseDrafts = this.activeExpenseRows();
    const recurringTemplateRows = activeExpenseDrafts.filter(
      (expense) => expense.type === 'recurring' && !expense.templateId?.startsWith('loan:'),
    );
    const expenseRows = activeExpenseDrafts.filter(
      (expense) => expense.type !== 'recurring' || expense.templateId?.startsWith('loan:'),
    );
    const templates = this.showMonthlyTables
      ? recurringTemplateRows.map((expense) => ({
          id: expense.recurringTemplateId || id('fixed'),
          name: expense.name.trim() || 'Recurring expense',
          categoryId: expense.categoryId,
          amount: toNumber(expense.amount),
          type: 'recurring' as const,
          createdDate:
            this.templates.find((template) => template.id === expense.recurringTemplateId)?.createdDate ||
            createdDate,
          startDate:
            optionalDate(expense.startDate) ||
            optionalDate(expense.date) ||
            monthStartDate(this.data.selectedMonth),
          endDate: optionalDate(expense.endDate),
        }))
      : this.activeRows(this.templates).map((template) => ({
          id: template.id,
          name: template.name.trim() || 'Recurring expense',
          categoryId: template.categoryId,
          amount: toNumber(template.amount),
          type: 'recurring' as const,
          createdDate: template.createdDate || createdDate,
          startDate: optionalDate(template.startDate) || monthStartDate(this.data.selectedMonth),
          endDate: optionalDate(template.endDate),
        }));
    const expenses = this.showMonthlyTables
      ? expenseRows.map((expense) => ({
          id: expense.id,
          month: dateMonthKey(dateValue(expense.date)) || expense.month || this.data.selectedMonth,
          date:
            optionalDate(expense.date) || monthStartDate(expense.month || this.data.selectedMonth),
          name: expense.name.trim() || 'Expense',
          categoryId: expense.categoryId,
          amount: toNumber(expense.amount),
          type: expense.type || 'one-time',
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
        templates: this.showMonthlyTables ? this.deletedTemplateIds() : this.deletedIds(this.templates),
        expenses: this.showMonthlyTables ? this.deletedExpenseIds() : this.deletedIds(this.expenses),
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
      return this.expenses;
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

  private deletedExpenseIds(): string[] {
    return this.expenses
      .filter(
        (expense) =>
          (expense.pendingDelete && !expense.recurringTemplateId) ||
          (!expense.pendingDelete &&
            !expense.isNew &&
            !expense.recurringTemplateId &&
            expense.type === 'recurring' &&
            !expense.templateId?.startsWith('loan:')),
      )
      .map((expense) => expense.id);
  }

  private deletedTemplateIds(): string[] {
    return this.expenses
      .filter(
        (expense) =>
          !!expense.recurringTemplateId &&
          (expense.pendingDelete || (!expense.pendingDelete && expense.type !== 'recurring')),
      )
      .map((expense) => expense.recurringTemplateId as string);
  }
}
