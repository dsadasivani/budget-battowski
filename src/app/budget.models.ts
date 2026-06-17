export type ExpenseType = 'recurring' | 'one-time';
export type Cadence =
  | 'daily'
  | 'weekly'
  | 'bi-weekly'
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'annual'
  | 'one-time';
export type InvestmentFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'half-yearly'
  | 'annual'
  | 'one-time';
export type CategoryType = 'Income' | 'Investments' | 'Expenses';
export type WorkspaceRole = 'owner' | 'editor';
export const PAYMENT_BANK_OPTIONS = [
  { name: 'Default', iconSrc: '/bank-icons/bank-building-icon.svg' },
  { name: 'Indian Bank', iconSrc: '/bank-icons/Indian Bank Symbol PNG.png' },
  { name: 'IDFC FIRST', iconSrc: '/bank-icons/IDFC FIRST Bank Symbol PNG.png' },
  { name: 'Yes Bank', iconSrc: '/bank-icons/Yes Bank Symbol SVG.svg' },
  { name: 'IndusInd', iconSrc: '/bank-icons/IndusInd Bank Symbol PNG.png' },
  { name: 'Kotak Mahindra', iconSrc: '/bank-icons/Kotak Mahindra Bank Symbol PNG.png' },
  {
    name: 'Punjab National',
    iconSrc: '/bank-icons/Punjab National Bank Symbol PNG.png',
  },
  {
    name: 'Indian Overseas',
    iconSrc: '/bank-icons/Indian Overseas Bank Symbol PNG.png',
  },
  { name: 'Bank of Baroda', iconSrc: '/bank-icons/Bank of Baroda Symbol PNG.png' },
  { name: 'Bank of America', iconSrc: '/bank-icons/Bank of America Symbol SVG.svg' },
  { name: 'HSBC', iconSrc: '/bank-icons/HSBC Holdings Symbol SVG.svg' },
  { name: 'HDFC', iconSrc: '/bank-icons/HDFC Bank Symbol SVG.svg' },
  { name: 'SBI', iconSrc: '/bank-icons/State Bank of India Symbol SVG.svg' },
  { name: 'Axis', iconSrc: '/bank-icons/Axis Bank Symbol SVG.svg' },
  { name: 'ICICI', iconSrc: '/bank-icons/ICICI Bank Symbol SVG.svg' },
] as const;
export type PaymentBankName = (typeof PAYMENT_BANK_OPTIONS)[number]['name'];
export type PaymentModeType =
  | 'cash'
  | 'upi'
  | 'wallet'
  | 'credit-card'
  | 'debit-card'
  | 'internet-banking';
export type PaymentModeProvider =
  | 'PhonePe'
  | 'Apple Pay'
  | 'Samsung Pay'
  | 'Google Pay'
  | 'Paytm'
  | 'BHIM';
export type PaymentCardType =
  | 'rupay'
  | 'maestro'
  | 'diners-club'
  | 'master-card'
  | 'american-express'
  | 'visa';

export interface PaymentMode {
  id: string;
  type: PaymentModeType;
  name: string;
  provider?: PaymentModeProvider;
  cardType?: PaymentCardType;
  lastFour?: string;
  bankName?: PaymentBankName;
  paymentAccountId?: string;
  createdDate?: string;
  updatedDate?: string;
  archivedDate?: string;
}

export interface PaymentAccount {
  id: string;
  name: string;
  bankName: PaymentBankName;
  lastFour: string;
  createdDate?: string;
  updatedDate?: string;
  archivedDate?: string;
}

export interface WorkspaceMember {
  email: string;
  displayName: string;
  role: WorkspaceRole;
  createdDate: string;
  archivedDate?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerEmail: string;
  members: WorkspaceMember[];
  createdDate: string;
  updatedDate: string;
  archivedDate?: string;
}

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
  memberEmail?: string;
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
  memberEmail?: string;
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
  frequency?: InvestmentFrequency;
  startDate?: string;
  endDate?: string;
  memberEmail?: string;
  paymentModeId?: string;
}

export interface ExpenseTemplate {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  type: 'recurring';
  frequency?: InvestmentFrequency;
  createdDate?: string;
  startDate?: string;
  endDate?: string;
  skippedMonths?: string[];
  archivedDate?: string;
  memberEmail?: string;
  paymentModeId?: string;
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
  memberEmail?: string;
  paymentModeId?: string;
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
  skippedMonths?: string[];
  sourceInvestmentId?: string;
  memberEmail?: string;
  paymentModeId?: string;
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
  memberEmail?: string;
  paymentModeId?: string;
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
  memberEmail?: string;
  paymentModeId?: string;
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
  memberEmail?: string;
  paymentModeId?: string;
}

export interface BudgetDataMap {
  paymentAccounts: PaymentAccount;
  paymentModes: PaymentMode;
  categories: BudgetCategory;
  incomes: IncomeSource;
  templates: ExpenseTemplate;
  expenses: ExpenseEntry;
  investments: InvestmentEntry;
  loans: Loan;
}

export type BudgetCollectionName = keyof BudgetDataMap;
export type BudgetRecord = BudgetDataMap[BudgetCollectionName];
