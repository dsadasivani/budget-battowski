export type IsoDate = string;

export type LoanInterestCalculationMethod = 'monthly-reducing' | 'daily-reducing';
export type LoanDayCountConvention =
  'actual-360' | 'actual-365' | 'actual-366' | 'actual-actual' | '30-360';
export type LoanPrepaymentStrategy =
  'keep-emi-reduce-tenure' | 'keep-tenure-reduce-emi' | 'bank-specified';

export interface LoanRoundingPolicy {
  monetaryScale: 0 | 2;
  interestRounding: 'half-up' | 'half-even';
  installmentRounding: 'half-up' | 'half-even';
  finalInstallmentAdjustment: true;
}

export interface LoanCalculationPolicy {
  interestCalculationMethod: LoanInterestCalculationMethod;
  dayCountConvention: LoanDayCountConvention;
  compoundingFrequency: 'monthly';
  prepaymentTreatment: LoanPrepaymentStrategy;
  rounding: LoanRoundingPolicy;
}

export interface LoanContract {
  sanctionedAmount?: number;
  disbursedAmount: number;
  disbursementDate: IsoDate;
  firstEmiDate: IsoDate;
  originalTenureMonths?: number;
  contractualMaturityDate?: IsoDate;
  initialEmi: number;
  initialAnnualRate: number;
  /** Authoritative first-installment interest from a lender schedule, when supplied. */
  firstPeriodInterestAmount?: number;
  interestType: 'fixed' | 'floating';
  interestCalculationMethod: LoanInterestCalculationMethod;
  dayCountConvention: LoanDayCountConvention;
  compoundingFrequency: 'monthly';
  postPrepaymentStrategy: LoanPrepaymentStrategy;
  roundingPolicy: LoanRoundingPolicy;
  benchmark?: string;
  spread?: number;
}

export interface LoanAccount {
  id: string;
  schemaVersion: 2;
  lender: string;
  loanType: string;
  accountReferenceLastFour?: string;
  contract: LoanContract;
  notes: string;
  paymentModeId?: string;
  ownerUid?: string;
  memberEmail?: string;
  historyCoverageStartDate?: IsoDate;
  createdDate?: string;
  updatedDate?: string;
  archivedDate?: string;
  version?: number;
}

export type LoanEventSource = 'manual' | 'statement-import' | 'schedule-import' | 'system';

interface LoanEventBase {
  id: string;
  loanId: string;
  effectiveDate: IsoDate;
  notes?: string;
  source: LoanEventSource;
  sourceReference?: string;
  sourceFingerprint?: string;
  ownerUid?: string;
  memberEmail?: string;
  createdDate: string;
  version?: number;
}

export type LoanEvent =
  | (LoanEventBase & { type: 'balance-anchor'; amount: number })
  | (LoanEventBase & { type: 'disbursement'; amount: number })
  | (LoanEventBase & { type: 'emi-payment'; amount: number })
  | (LoanEventBase & { type: 'part-prepayment'; amount: number })
  | (LoanEventBase & { type: 'rate-change'; newAnnualRate: number })
  | (LoanEventBase & { type: 'emi-change'; newEmi: number })
  | (LoanEventBase & {
      type: 'tenure-change';
      newMaturityDate?: IsoDate;
      newRemainingInstallments?: number;
    })
  | (LoanEventBase & { type: 'charge' | 'penal-charge'; amount: number })
  | (LoanEventBase & { type: 'charge-reversal' | 'waiver' | 'refund'; amount: number })
  | (LoanEventBase & { type: 'adjustment'; amount: number })
  | (LoanEventBase & { type: 'moratorium-start' | 'moratorium-end' })
  | (LoanEventBase & { type: 'foreclosure'; amount?: number });

export type LoanEventType = LoanEvent['type'];

export interface LoanScheduleEntry {
  installmentNumber: number;
  dueDate: IsoDate;
  openingPrincipal: number;
  annualRate: number;
  interestDays?: number;
  interestAccrued: number;
  scheduledPayment: number;
  interestComponent: number;
  principalComponent: number;
  prepaymentAmount: number;
  charges: number;
  actualPaymentAmount?: number;
  actualPaymentDate?: IsoDate;
  closingPrincipal: number;
  status: 'future' | 'due' | 'paid' | 'partial' | 'overdue' | 'adjusted';
  provenance: 'recorded' | 'calculated' | 'projected';
  interimEvents?: LoanScheduleInterimEvent[];
}

export interface LoanScheduleInterimEvent {
  id: string;
  type: 'part-prepayment';
  effectiveDate: IsoDate;
  amount: number;
  openingPrincipal: number;
  closingPrincipal: number;
  provenance: 'recorded' | 'projected';
}

export interface LoanPosition {
  asOfDate: IsoDate;
  outstandingPrincipal: number;
  currentAnnualRate: number;
  currentEmi: number;
  principalRepaid?: number;
  interestPaid?: number;
  chargesPaid: number;
  prepaymentsMade: number;
  accruedInterest: number;
  remainingInstallments: number;
  nextPaymentDate?: IsoDate;
  nextPaymentAmount?: number;
  projectedPayoffDate?: IsoDate;
  futureInterest: number;
  projectedRemainingPayments: number;
  totalPaidToDate: number;
  status: 'active' | 'paid-off' | 'foreclosed' | 'future' | 'needs-attention';
  historyCoverage: 'complete' | 'partial';
  historyCoverageStartDate?: IsoDate;
}

export interface LoanTransactionView {
  id: string;
  date: IsoDate;
  type: LoanEventType;
  label: string;
  amount?: number;
  source: LoanEventSource;
  provenance: 'recorded';
}

export interface LoanCalculationDiagnostic {
  code:
    | 'history-partial'
    | 'invalid-event'
    | 'non-amortizing'
    | 'maturity-exceeded'
    | 'unsupported-event'
    | 'payment-shortfall';
  severity: 'info' | 'warning' | 'error';
  message: string;
  eventId?: string;
}

export interface LoanCalculationResult {
  position: LoanPosition;
  schedule: LoanScheduleEntry[];
  transactions: LoanTransactionView[];
  diagnostics: LoanCalculationDiagnostic[];
}

export interface LoanReconciliation {
  id: string;
  loanId: string;
  asOfDate: IsoDate;
  lenderReportedOutstanding: number;
  calculatedOutstanding: number;
  difference: number;
  tolerance: number;
  sourceKind: 'manual' | 'bank-statement' | 'repayment-schedule' | 'certificate';
  sourceDocumentId?: string;
  status: 'matched' | 'mismatch' | 'accepted-adjustment';
  notes?: string;
  ownerUid?: string;
  memberEmail?: string;
  createdDate: string;
  version?: number;
}

export interface LoanDocumentMetadata {
  id: string;
  loanId: string;
  name: string;
  kind: 'bank-statement' | 'repayment-schedule' | 'certificate' | 'other';
  periodStart?: IsoDate;
  periodEnd?: IsoDate;
  storageReference?: string;
  importStatus: 'metadata-only' | 'imported' | 'unsupported' | 'failed';
  notes?: string;
  ownerUid?: string;
  memberEmail?: string;
  createdDate: string;
  version?: number;
}

export const DEFAULT_LOAN_ROUNDING_POLICY: LoanRoundingPolicy = {
  monetaryScale: 2,
  interestRounding: 'half-up',
  installmentRounding: 'half-up',
  finalInstallmentAdjustment: true,
};
