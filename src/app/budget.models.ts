export type ExpenseType = 'recurring' | 'one-time';
export type Cadence =
  | 'daily'
  | 'weekly'
  | 'bi-weekly'
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'annual'
  | 'one-time'
  | 'variable';
export type InvestmentFrequency = 'recurring' | 'one-time';
export type CategoryType = 'Income' | 'Investments' | 'Expenses';

export interface IncomeAuditVersion {
  id: string;
  operation: 'created' | 'updated' | 'deleted';
  recordedDate: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  source: string;
  amount: number;
  cadence: Cadence;
  categoryId?: string;
  notes?: string;
  month?: string;
  startDate?: string;
  endDate?: string;
}

export interface IncomeSource {
  id: string;
  source: string;
  amount: number;
  cadence: Cadence;
  categoryId?: string;
  notes: string;
  month?: string;
  createdDate?: string;
  startDate?: string;
  endDate?: string;
  auditTrail?: IncomeAuditVersion[];
}

export interface BudgetCategory {
  id: string;
  name: string;
  monthlyBudget: number;
  color: string;
  type?: CategoryType;
}

export interface ExpenseTemplateAuditVersion {
  id: string;
  operation: 'created' | 'updated' | 'deleted';
  recordedDate: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  name: string;
  categoryId: string;
  amount: number;
  startDate?: string;
  endDate?: string;
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
  skippedMonths?: string[];
  archivedDate?: string;
  auditTrail?: ExpenseTemplateAuditVersion[];
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
  categoryId?: string;
  frequency: InvestmentFrequency;
  date?: string;
  startDate?: string;
  endDate?: string;
  notes: string;
  createdDate?: string;
  auditTrail?: InvestmentAuditVersion[];
}

export interface InvestmentAuditVersion {
  id: string;
  operation: 'created' | 'updated' | 'deleted';
  recordedDate: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  name: string;
  amount: number;
  categoryId?: string;
  frequency: InvestmentFrequency;
  date?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
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
  auditTrail?: LoanAuditVersion[];
}

export interface LoanAuditVersion {
  id: string;
  operation: 'created' | 'updated' | 'deleted';
  recordedDate: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  lender: string;
  loanType: string;
  principal: number;
  outstanding: number;
  annualRate: number;
  emi: number;
  startDate: string;
  endDate: string;
  notes?: string;
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
