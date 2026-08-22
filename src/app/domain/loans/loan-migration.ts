import type { Loan } from '../../budget.models';
import type { LoanAccount, LoanEvent } from './loan.models';
import { DEFAULT_LOAN_ROUNDING_POLICY } from './loan.models';

export interface LegacyLoanMigration {
  account: LoanAccount;
  anchor: LoanEvent;
  assumption: string;
}

export function migrateLegacyLoan(
  loan: Loan,
  balanceAsOfDate: string,
  createdDate = new Date().toISOString(),
): LegacyLoanMigration {
  const firstEmiDate = loan.startDate;
  const account: LoanAccount = {
    id: loan.id,
    schemaVersion: 2,
    lender: loan.lender,
    loanType: loan.loanType,
    contract: {
      sanctionedAmount: loan.principal,
      disbursedAmount: loan.principal,
      disbursementDate: loan.startDate,
      firstEmiDate,
      contractualMaturityDate: loan.endDate || undefined,
      initialEmi: loan.emi,
      initialAnnualRate: loan.annualRate,
      interestType: 'fixed',
      interestCalculationMethod: 'monthly-reducing',
      dayCountConvention: 'actual-365',
      compoundingFrequency: 'monthly',
      postPrepaymentStrategy: 'keep-emi-reduce-tenure',
      roundingPolicy: DEFAULT_LOAN_ROUNDING_POLICY,
    },
    notes: loan.notes,
    paymentModeId: loan.paymentModeId,
    ownerUid: loan.ownerUid,
    memberEmail: loan.memberEmail,
    historyCoverageStartDate: balanceAsOfDate,
    createdDate: loan.auditTrail?.[0]?.recordedDate ?? createdDate,
    updatedDate: createdDate,
    version: loan.version,
  };
  return {
    account,
    anchor: {
      id: `legacy-anchor-${loan.id}`,
      loanId: loan.id,
      type: 'balance-anchor',
      effectiveDate: balanceAsOfDate,
      amount: loan.outstanding,
      source: 'legacy-migration',
      notes: 'Opening balance imported from the legacy manually maintained outstanding value.',
      ownerUid: loan.ownerUid,
      memberEmail: loan.memberEmail,
      createdDate,
    },
    assumption: `Legacy outstanding was recorded as a balance anchor on ${balanceAsOfDate}. Confirm this date against a lender statement.`,
  };
}
