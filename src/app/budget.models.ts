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
  uid?: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: WorkspaceRole;
  createdDate: string;
  archivedDate?: string;
}

export interface UserProfile {
  uid?: string;
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
  ownerEmail: string;
  ownerUid?: string;
  memberUids?: string[];
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

export interface Loan extends OwnedRecord {
  lender: string;
  loanType: string;
  principal: number;
  outstanding: number;
  annualRate: number;
  emi: number;
  startDate: string;
  endDate: string;
  notes: string;
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
