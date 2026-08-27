import { Injectable, signal } from '@angular/core';
import type { BudgetCategory, ExpenseEntry, IncomeSource, InvestmentEntry } from '../budget.models';
import type {
  LoanAccount,
  LoanDocumentMetadata,
  LoanEvent,
  LoanReconciliation,
} from '../domain/loans/loan.models';

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
  readonly loanAccounts = signal<LoanAccount[]>([]);
  readonly loanEvents = signal<LoanEvent[]>([]);
  readonly loanReconciliations = signal<LoanReconciliation[]>([]);
  readonly loanDocuments = signal<LoanDocumentMetadata[]>([]);
}
