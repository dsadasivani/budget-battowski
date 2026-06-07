export type ExpenseType = 'recurring' | 'one-time' | 'investment';
export type Cadence = 'monthly' | 'annual' | 'variable';

export interface IncomeSource {
  id: string;
  source: string;
  amount: number;
  cadence: Cadence;
  notes: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  monthlyBudget: number;
  color: string;
}

export interface ExpenseTemplate {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  type: Exclude<ExpenseType, 'one-time'>;
}

export interface ExpenseEntry {
  id: string;
  month: string;
  name: string;
  categoryId: string;
  amount: number;
  type: ExpenseType;
  note: string;
  templateId?: string;
}

export interface Loan {
  id: string;
  lender: string;
  loanType: string;
  principal: number;
  outstanding: number;
  annualRate: number;
  emi: number;
  startDate: string;
  notes: string;
}

export interface BudgetDataMap {
  categories: BudgetCategory;
  incomes: IncomeSource;
  templates: ExpenseTemplate;
  expenses: ExpenseEntry;
  loans: Loan;
}

export type BudgetCollectionName = keyof BudgetDataMap;
export type BudgetRecord = BudgetDataMap[BudgetCollectionName];
