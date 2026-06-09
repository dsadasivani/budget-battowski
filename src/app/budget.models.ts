export type ExpenseType = 'recurring' | 'one-time';
export type Cadence = 'monthly' | 'annual' | 'variable';
export type InvestmentFrequency = 'recurring' | 'one-time';

export interface IncomeSource {
  id: string;
  source: string;
  amount: number;
  cadence: Cadence;
  notes: string;
  month?: string;
  createdDate?: string;
  startDate?: string;
  endDate?: string;
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
  type: 'recurring';
  createdDate?: string;
  startDate?: string;
  endDate?: string;
}

export interface ExpenseEntry {
  id: string;
  month: string;
  date?: string;
  name: string;
  categoryId: string;
  amount: number;
  type: ExpenseType;
  note: string;
  templateId?: string;
}

export interface InvestmentEntry {
  id: string;
  name: string;
  amount: number;
  frequency: InvestmentFrequency;
  date?: string;
  startDate?: string;
  endDate?: string;
  notes: string;
  createdDate?: string;
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
  endDate: string;
  notes: string;
}

export interface BudgetDataMap {
  categories: BudgetCategory;
  incomes: IncomeSource;
  templates: ExpenseTemplate;
  expenses: ExpenseEntry;
  investments: InvestmentEntry;
  loans: Loan;
}

export type BudgetCollectionName = keyof BudgetDataMap;
export type BudgetRecord = BudgetDataMap[BudgetCollectionName];
