import type { OwnedRecord } from '../../budget.models';

export type InvestmentType = 'STOCK' | 'MUTUAL_FUND' | 'NPS' | 'PPF' | 'SSY';
export type InvestmentStatus = 'ACTIVE' | 'CLOSED';
export type InvestmentFrequencyV2 = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';
export type MutualFundSipType = 'FIXED' | 'STEP_UP';
export type InvestmentTransactionType =
  'BUY' | 'SIP' | 'CONTRIBUTION' | 'SELL' | 'REDEMPTION' | 'WITHDRAWAL';
export type InvestmentTransactionSource = 'RECURRING' | 'ADHOC' | 'LIQUIDATION';
export type ValuationSource = 'UPSTOX' | 'AMFI' | 'NPS_TRUST' | 'INTERNAL' | 'MANUAL';
export type RefreshStatus = 'CURRENT' | 'STALE' | 'FAILED';
export type DecimalString = string;

export interface StockInstrument {
  kind: 'STOCK';
  isin?: string;
  tradingSymbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  provider: 'UPSTOX';
  upstoxInstrumentKey: string;
}

export interface MutualFundInstrument {
  kind: 'MUTUAL_FUND';
  schemeCode: string;
  schemeName: string;
  isinGrowth?: string;
  isinReinvestment?: string;
  fundHouse?: string;
  plan?: string;
  option?: string;
  provider: 'AMFI';
}

export interface NpsSchemeHolding {
  schemeCode: string;
  schemeName?: string;
  pfmCode?: string;
  pfmName?: string;
  units: DecimalString;
  nav?: DecimalString;
  navDate?: string;
}

export interface NpsInstrument {
  kind: 'NPS';
  schemeHoldings: NpsSchemeHolding[];
  provider: 'NPS_TRUST';
}

export interface GovernmentSavingsInstrument {
  kind: 'PPF' | 'SSY';
  accountNumberLastFour?: string;
  beneficiaryName?: string;
  provider: 'INTERNAL';
}

export type InvestmentInstrument =
  StockInstrument | MutualFundInstrument | NpsInstrument | GovernmentSavingsInstrument;

export interface InvestmentOpeningSnapshot {
  asOfDate: string;
  investedAmount: DecimalString;
  currentValue?: DecimalString;
  quantity?: DecimalString;
  units?: DecimalString;
  schemeHoldings?: NpsSchemeHolding[];
}

export interface StepUpPlan {
  enabled: boolean;
  /** Kept as a union so existing percentage-based plans remain readable. New plans use FIXED_AMOUNT. */
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: DecimalString;
  frequency: InvestmentFrequencyV2;
  /** First scheduled increase date. New plans persist the selected month as its first day. */
  effectiveFrom: string;
}

export interface RecurringInvestmentPlan {
  enabled: boolean;
  amount: DecimalString;
  frequency: InvestmentFrequencyV2;
  startDate: string;
  endDate?: string;
  sipType?: MutualFundSipType;
  stepUp?: StepUpPlan;
}

export interface InvestmentSummary {
  totalContributions: DecimalString;
  totalWithdrawals: DecimalString;
  remainingCostBasis: DecimalString;
  currentQuantity: DecimalString;
  currentValue: DecimalString;
  realizedReturn: DecimalString;
  unrealizedReturn: DecimalString;
  overallReturnAmount: DecimalString;
  overallReturnPercentage: DecimalString;
  currentRecurringAmount?: DecimalString;
  recurringFrequency?: InvestmentFrequencyV2;
  valuationPrice?: DecimalString;
  valuationDate?: string;
  valuationSource?: ValuationSource;
  lastRefreshedAt?: string;
  refreshStatus?: RefreshStatus;
}

export interface InvestmentAccount extends OwnedRecord {
  schemaVersion: 2;
  name: string;
  type: InvestmentType;
  status: InvestmentStatus;
  institution?: string;
  instrument?: InvestmentInstrument;
  recurringPlan?: RecurringInvestmentPlan;
  openingSnapshot?: InvestmentOpeningSnapshot;
  summary: InvestmentSummary;
  legacySourceId?: string;
  needsInstrumentMapping?: boolean;
  createdDate: string;
  updatedDate: string;
}

export interface InvestmentTransaction extends OwnedRecord {
  schemaVersion: 2;
  investmentId: string;
  type: InvestmentTransactionType;
  date: string;
  amount: DecimalString;
  quantity?: DecimalString;
  units?: DecimalString;
  price?: DecimalString;
  nav?: DecimalString;
  unitsSource?: 'STATEMENT' | 'CALCULATED';
  source: InvestmentTransactionSource;
  notes?: string;
  schemeAllocations?: NpsSchemeHolding[];
  createdDate: string;
  updatedDate: string;
}

export interface PortfolioSummary {
  currentValue: DecimalString;
  investedAmount: DecimalString;
  overallReturnAmount: DecimalString;
  overallReturnPercentage: DecimalString;
  investedThisMonth: DecimalString;
  withdrawnThisMonth: DecimalString;
  recurringCommitmentMonthly: DecimalString;
}

export interface ProviderRefreshResult {
  provider: ValuationSource;
  success: boolean;
  updatedCount: number;
  failedCount: number;
  errorCode?: 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'NOT_CONFIGURED';
}

export const EMPTY_INVESTMENT_SUMMARY: InvestmentSummary = {
  totalContributions: '0',
  totalWithdrawals: '0',
  remainingCostBasis: '0',
  currentQuantity: '0',
  currentValue: '0',
  realizedReturn: '0',
  unrealizedReturn: '0',
  overallReturnAmount: '0',
  overallReturnPercentage: '0',
  refreshStatus: 'STALE',
};

export function isContributionType(type: InvestmentTransactionType): boolean {
  return type === 'BUY' || type === 'SIP' || type === 'CONTRIBUTION';
}

export function isWithdrawalType(type: InvestmentTransactionType): boolean {
  return type === 'SELL' || type === 'REDEMPTION' || type === 'WITHDRAWAL';
}

export function supportsRecurringPlan(type: InvestmentType): boolean {
  return type !== 'STOCK';
}
