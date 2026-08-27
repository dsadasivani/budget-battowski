import type { LoanReconciliation } from './loan.models';
import { moneyNumber } from './loan-money';

export function reconcileLoanBalance(input: {
  id: string;
  loanId: string;
  asOfDate: string;
  lenderReportedOutstanding: number;
  calculatedOutstanding: number;
  tolerance?: number;
  sourceKind: LoanReconciliation['sourceKind'];
  sourceDocumentId?: string;
  notes?: string;
  ownerUid?: string;
  memberEmail?: string;
  createdDate: string;
}): LoanReconciliation {
  const tolerance = Math.max(0, moneyNumber(input.tolerance ?? 1));
  const difference = moneyNumber(input.calculatedOutstanding - input.lenderReportedOutstanding);
  return {
    ...input,
    lenderReportedOutstanding: moneyNumber(input.lenderReportedOutstanding),
    calculatedOutstanding: moneyNumber(input.calculatedOutstanding),
    difference,
    tolerance,
    status: Math.abs(difference) <= tolerance ? 'matched' : 'mismatch',
  };
}

export function loanAccuracyStatus(reconciliations: readonly LoanReconciliation[]): {
  label: 'Estimated' | 'Reconciled' | 'Verified';
  throughDate?: string;
} {
  const latestMatched = [...reconciliations]
    .filter((item) => item.status === 'matched' || item.status === 'accepted-adjustment')
    .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate))[0];
  if (!latestMatched) {
    return { label: 'Estimated' };
  }
  const lenderBacked =
    latestMatched.status === 'matched' &&
    latestMatched.sourceKind !== 'manual' &&
    !!latestMatched.sourceDocumentId;
  return {
    label: lenderBacked ? 'Verified' : 'Reconciled',
    throughDate: latestMatched.asOfDate,
  };
}
