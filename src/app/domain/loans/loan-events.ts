import type { LoanEvent, LoanEventType } from './loan.models';

// Contract changes are effective before cash movements. A payment is then allocated before an
// optional same-day prepayment, charges, and finally a lender balance checkpoint.
const EVENT_PRIORITY: Record<LoanEventType, number> = {
  'rate-change': 10,
  'emi-change': 11,
  'tenure-change': 12,
  'moratorium-start': 13,
  'moratorium-end': 14,
  disbursement: 20,
  'emi-payment': 30,
  'part-prepayment': 40,
  foreclosure: 41,
  charge: 50,
  'penal-charge': 51,
  'charge-reversal': 52,
  waiver: 53,
  refund: 54,
  adjustment: 60,
  'balance-anchor': 70,
};

export function loanEventPriority(type: LoanEventType): number {
  return EVENT_PRIORITY[type];
}

export function sortLoanEvents(events: readonly LoanEvent[]): LoanEvent[] {
  return [...events].sort(
    (left, right) =>
      left.effectiveDate.localeCompare(right.effectiveDate) ||
      loanEventPriority(left.type) - loanEventPriority(right.type) ||
      left.id.localeCompare(right.id),
  );
}

export function eventAmount(event: LoanEvent): number | undefined {
  return 'amount' in event ? event.amount : undefined;
}
