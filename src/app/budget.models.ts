export type ExpenseType = 'recurring' | 'one-time';
export type Cadence = 'monthly' | 'one-time';
export type InvestmentFrequency =
  'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'annual' | 'one-time';
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
export type PaymentModeType = 'cash' | 'upi' | 'credit-card' | 'debit-card' | 'internet-banking';
export type PaymentModeProvider =
  'PhonePe' | 'Apple Pay' | 'Samsung Pay' | 'Google Pay' | 'Paytm' | 'BHIM';
export const CASH_PAYMENT_MODE_ID = 'payment-mode-cash';
export type PaymentCardType =
  'rupay' | 'maestro' | 'diners-club' | 'master-card' | 'american-express' | 'visa';

export interface UserIdentity {
  uid: string;
  email: string;
}

export interface PersistedRecord {
  id: string;
  version?: number;
}

export interface OwnedRecord extends PersistedRecord {
  ownerUid?: string;
  memberEmail?: string;
}

export interface PaymentMode extends OwnedRecord {
  type: PaymentModeType;
  name: string;
  provider?: PaymentModeProvider;
  cardType?: PaymentCardType;
  lastFour?: string;
  bankName?: PaymentBankName;
  paymentAccountId?: string;
  workspaceGlobal?: boolean;
  createdDate?: string;
  updatedDate?: string;
  archivedDate?: string;
}

export interface PaymentAccount extends OwnedRecord {
  name: string;
  bankName: PaymentBankName;
  lastFour: string;
  createdDate?: string;
  updatedDate?: string;
  archivedDate?: string;
}

export interface WorkspaceMember {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: WorkspaceRole;
  createdDate: string;
  archivedDate?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  updatedDate: string;
  onboarding?: OnboardingProgress;
}

export type OnboardingStepStatus = 'pending' | 'completed' | 'skipped';

export interface OnboardingProgress {
  activeStepId: string;
  steps: Record<string, OnboardingStepStatus>;
  updatedDate: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
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

export interface IncomeSource extends OwnedRecord {
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

export interface BudgetCategory extends PersistedRecord {
  name: string;
  monthlyBudget: number;
  color: string;
  type?: CategoryType;
  budgetVersions?: CategoryBudgetVersion[];
  archivedDate?: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: readonly BudgetCategory[] = [
  {
    id: 'category-food-dining',
    name: 'Food & Dining',
    monthlyBudget: 0,
    color: '#f97316',
    type: 'Expenses',
  },
  {
    id: 'category-groceries',
    name: 'Groceries',
    monthlyBudget: 0,
    color: '#16a34a',
    type: 'Expenses',
  },
  {
    id: 'category-housing',
    name: 'Housing',
    monthlyBudget: 0,
    color: '#2563eb',
    type: 'Expenses',
  },
  {
    id: 'category-transport',
    name: 'Transport',
    monthlyBudget: 0,
    color: '#0891b2',
    type: 'Expenses',
  },
  {
    id: 'category-shopping',
    name: 'Shopping',
    monthlyBudget: 0,
    color: '#db2777',
    type: 'Expenses',
  },
  {
    id: 'category-bills-utilities',
    name: 'Bills & Utilities',
    monthlyBudget: 0,
    color: '#ca8a04',
    type: 'Expenses',
  },
  {
    id: 'category-health',
    name: 'Health',
    monthlyBudget: 0,
    color: '#dc2626',
    type: 'Expenses',
  },
  {
    id: 'category-entertainment',
    name: 'Entertainment',
    monthlyBudget: 0,
    color: '#7c3aed',
    type: 'Expenses',
  },
  {
    id: 'category-family-kids',
    name: 'Family & Kids',
    monthlyBudget: 0,
    color: '#ea580c',
    type: 'Expenses',
  },
  {
    id: 'category-education',
    name: 'Education',
    monthlyBudget: 0,
    color: '#4f46e5',
    type: 'Expenses',
  },
  {
    id: 'category-travel',
    name: 'Travel',
    monthlyBudget: 0,
    color: '#0d9488',
    type: 'Expenses',
  },
  {
    id: 'category-insurance',
    name: 'Insurance',
    monthlyBudget: 0,
    color: '#475569',
    type: 'Expenses',
  },
  {
    id: 'category-personal-care',
    name: 'Personal Care',
    monthlyBudget: 0,
    color: '#be185d',
    type: 'Expenses',
  },
];

export interface CategoryBudgetVersion {
  effectiveMonth: string;
  monthlyBudget: number;
  recordedDate: string;
}

export type CategoryRemapStep = 'categories' | 'expenses' | 'templates' | 'incomes' | 'investments';

export interface CategoryRemapOperation {
  id: string;
  sourceCategoryId: string;
  replacementCategoryId: string;
  replacementCategory?: BudgetCategory;
  sourceArchivedDate: string;
  createdBy?: string;
  createdDate: string;
  updatedDate: string;
  status: 'pending' | 'running' | 'failed' | 'completed';
  completedSteps: CategoryRemapStep[];
  attempts: number;
  lastError?: string;
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

export interface ExpenseTemplate extends OwnedRecord {
  name: string;
  categoryId: string;
  amount: number;
  type: 'recurring';
  frequency?: InvestmentFrequency;
  createdDate?: string;
  startDate?: string;
  effectiveStartDate?: string;
  endDate?: string;
  skippedMonths?: string[];
  archivedDate?: string;
  paymentModeId?: string;
  auditTrail?: ExpenseTemplateAuditVersion[];
}

export interface ExpenseEntry extends OwnedRecord {
  month: string;
  date?: string;
  name: string;
  categoryId: string;
  amount: number;
  type: ExpenseType;
  note: string;
  templateId?: string;
  sourceLoanId?: string;
  paymentModeId?: string;
  source?: 'manual' | 'sms';
  sourceSmsTransactionId?: string;
}

export type SmsTransactionDecision = 'pending' | 'accept' | 'discard';
export type SmsTransactionStatus = 'pending' | 'processed' | 'discarded' | 'failed';
export type SmsFinancialTransactionType =
  'debit' | 'credit' | 'refund' | 'transfer' | 'withdrawal' | 'unknown';

export interface SmsTransaction extends PersistedRecord {
  ownerUid: string;
  source: 'sms';
  deviceId: string;
  sourceEventId: string;
  sender: string;
  rawMessage?: string;
  receivedAt: string;
  transactionDate?: string;
  amount?: number;
  currency?: string;
  transactionType: SmsFinancialTransactionType;
  merchant?: string;
  description?: string;
  bankName?: string;
  accountLastFour?: string;
  referenceNumber?: string;
  paymentAccountId?: string;
  paymentModeId?: string;
  suggestedCategoryId?: string;
  categoryId?: string;
  notes?: string;
  decision: SmsTransactionDecision;
  status: SmsTransactionStatus;
  parserId?: string;
  parserVersion?: string;
  confidence?: number;
  duplicateFingerprint?: string;
  expenseId?: string;
  createdDate: string;
  updatedDate: string;
  processedDate?: string;
}

export interface InvestmentEntry extends OwnedRecord {
  name: string;
  amount: number;
  categoryId?: string;
  frequency: InvestmentFrequency;
  date?: string;
  startDate?: string;
  effectiveStartDate?: string;
  endDate?: string;
  notes: string;
  createdDate?: string;
  skippedMonths?: string[];
  sourceInvestmentId?: string;
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

export interface BudgetDataMap {
  paymentAccounts: PaymentAccount;
  paymentModes: PaymentMode;
  categories: BudgetCategory;
  incomes: IncomeSource;
  templates: ExpenseTemplate;
  expenses: ExpenseEntry;
  investments: InvestmentEntry;
  loanAccounts: LoanAccount;
  loanEvents: LoanEvent;
  loanReconciliations: LoanReconciliation;
  loanDocuments: LoanDocumentMetadata;
}

export type BudgetCollectionName = keyof BudgetDataMap;
export type BudgetRecord = BudgetDataMap[BudgetCollectionName];
import type {
  LoanAccount,
  LoanDocumentMetadata,
  LoanEvent,
  LoanReconciliation,
} from './domain/loans/loan.models';
