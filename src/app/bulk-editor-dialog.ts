import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import type {
  BudgetCategory,
  Cadence,
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseType,
  IncomeSource,
  Loan,
} from './budget.models';

type DraftRow<T extends { id: string }> = T & { pendingDelete?: boolean };
export type BulkEditorScope = 'monthly' | 'planning' | 'loans';

export interface BulkEditorData {
  scope: BulkEditorScope;
  selectedMonth: string;
  categories: BudgetCategory[];
  incomes: IncomeSource[];
  templates: ExpenseTemplate[];
  expenses: ExpenseEntry[];
  loans: Loan[];
}

export interface BulkEditorResult {
  categories: BudgetCategory[];
  incomes: IncomeSource[];
  templates: ExpenseTemplate[];
  expenses: ExpenseEntry[];
  loans: Loan[];
  deleted: {
    categories: string[];
    incomes: string[];
    templates: string[];
    expenses: string[];
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

@Component({
  selector: 'app-bulk-editor-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  templateUrl: './bulk-editor-dialog.html',
  styleUrl: './bulk-editor-dialog.scss',
})
export class BulkEditorDialog {
  protected readonly incomeCadences: Cadence[] = ['monthly', 'annual', 'variable'];
  protected readonly expenseTypes: ExpenseType[] = ['one-time', 'recurring', 'investment'];
  protected readonly fixedTypes: Array<Exclude<ExpenseType, 'one-time'>> = [
    'recurring',
    'investment',
  ];

  protected readonly categories: Array<DraftRow<BudgetCategory>>;
  protected readonly incomes: Array<DraftRow<IncomeSource>>;
  protected readonly templates: Array<DraftRow<ExpenseTemplate>>;
  protected readonly expenses: Array<DraftRow<ExpenseEntry>>;
  protected readonly loans: Array<DraftRow<Loan>>;
  protected readonly title: string;
  protected readonly showMonthlyTables: boolean;
  protected readonly showPlanningTables: boolean;
  protected readonly showLoanTables: boolean;

  constructor(
    private readonly dialogRef: MatDialogRef<BulkEditorDialog, BulkEditorResult>,
    @Inject(MAT_DIALOG_DATA) protected readonly data: BulkEditorData,
  ) {
    this.categories = cloneRows(data.categories);
    this.incomes = cloneRows(data.incomes);
    this.templates = cloneRows(data.templates);
    this.expenses = cloneRows(data.expenses);
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
  }

  protected addExpense(): void {
    this.expenses.unshift({
      id: id('expense'),
      month: this.data.selectedMonth,
      name: 'New expense',
      categoryId: this.categories[0]?.id ?? '',
      amount: 0,
      type: 'one-time',
      note: '',
    });
  }

  protected addIncome(): void {
    this.incomes.unshift({
      id: id('income'),
      source: 'New income',
      amount: 0,
      cadence: 'monthly',
      notes: '',
    });
  }

  protected addCategory(): void {
    this.categories.unshift({
      id: id('category'),
      name: 'New category',
      monthlyBudget: 0,
      color: '#1f7a8c',
    });
  }

  protected addLoan(): void {
    this.loans.unshift({
      id: id('loan'),
      lender: 'New lender',
      loanType: 'Loan',
      principal: 0,
      outstanding: 0,
      annualRate: 0,
      emi: 0,
      startDate: new Date().toISOString().slice(0, 10),
      notes: '',
    });
  }

  protected addTemplate(): void {
    this.templates.unshift({
      id: id('fixed'),
      name: 'New fixed item',
      categoryId: this.categories[0]?.id ?? '',
      amount: 0,
      type: 'recurring',
    });
  }

  protected toggleDelete(row: DraftRow<{ id: string }>): void {
    row.pendingDelete = !row.pendingDelete;
  }

  protected apply(): void {
    this.dialogRef.close({
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
        cadence: income.cadence,
        notes: income.notes ?? '',
      })),
      templates: this.activeRows(this.templates).map((template) => ({
        id: template.id,
        name: template.name.trim() || 'Fixed item',
        categoryId: template.categoryId,
        amount: toNumber(template.amount),
        type: template.type,
      })),
      expenses: this.activeRows(this.expenses).map((expense) => ({
        id: expense.id,
        month: expense.month || this.data.selectedMonth,
        name: expense.name.trim() || 'Expense',
        categoryId: expense.categoryId,
        amount: toNumber(expense.amount),
        type: expense.type,
        note: expense.note ?? '',
        templateId: expense.templateId || undefined,
      })),
      loans: this.activeRows(this.loans).map((loan) => ({
        id: loan.id,
        lender: loan.lender.trim() || 'Lender',
        loanType: loan.loanType.trim() || 'Loan',
        principal: toNumber(loan.principal),
        outstanding: toNumber(loan.outstanding),
        annualRate: toNumber(loan.annualRate),
        emi: toNumber(loan.emi),
        startDate: loan.startDate,
        notes: loan.notes ?? '',
      })),
      deleted: {
        categories: this.deletedIds(this.categories),
        incomes: this.deletedIds(this.incomes),
        templates: this.deletedIds(this.templates),
        expenses: this.deletedIds(this.expenses),
        loans: this.deletedIds(this.loans),
      },
    });
  }

  private activeRows<T extends { id: string }>(rows: Array<DraftRow<T>>): T[] {
    return rows
      .filter((row) => !row.pendingDelete)
      .map(({ pendingDelete: _pendingDelete, ...row }) => row as T);
  }

  private deletedIds<T extends { id: string }>(rows: Array<DraftRow<T>>): string[] {
    return rows.filter((row) => row.pendingDelete).map((row) => row.id);
  }
}
