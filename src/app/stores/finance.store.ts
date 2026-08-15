import { Injectable, signal } from '@angular/core';
import type {
  BudgetCategory,
  ExpenseEntry,
  IncomeSource,
  InvestmentEntry,
  Loan,
} from '../budget.models';

function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class FinanceStore {
  readonly selectedMonth = signal(currentMonth());
  readonly categories = signal<BudgetCategory[]>([]);
  readonly incomes = signal<IncomeSource[]>([]);
  readonly expenses = signal<ExpenseEntry[]>([]);
  readonly investments = signal<InvestmentEntry[]>([]);
  readonly loans = signal<Loan[]>([]);
}
