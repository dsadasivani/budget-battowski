import { calculateLoan } from './loan-engine';
import type { LoanAccount, LoanEvent } from './loan.models';

export interface LoanPrepaymentScenarioInput {
  account: LoanAccount;
  events: readonly LoanEvent[];
  asOfDate: string;
  prepaymentDate: string;
  amount: number;
  strategy: 'keep-emi-reduce-tenure' | 'keep-tenure-reduce-emi';
  newEmi?: number;
}

export interface LoanPrepaymentScenarioResult {
  baselinePayoffDate?: string;
  projectedPayoffDate?: string;
  monthsSaved: number;
  futureInterestBefore: number;
  futureInterestAfter: number;
  interestSaved: number;
  outstandingAfterPrepayment: number;
  projectedEmi: number;
}

function monthDifference(left?: string, right?: string): number {
  if (!left || !right) {
    return 0;
  }
  const [leftYear, leftMonth] = left.split('-').map(Number);
  const [rightYear, rightMonth] = right.split('-').map(Number);
  return (leftYear - rightYear) * 12 + leftMonth - rightMonth;
}

export function simulatePrepayment(
  input: LoanPrepaymentScenarioInput,
): LoanPrepaymentScenarioResult {
  if (input.amount <= 0) {
    throw new Error('Prepayment amount must be greater than zero.');
  }
  const baseline = calculateLoan(input);
  const account: LoanAccount = {
    ...input.account,
    contract: {
      ...input.account.contract,
      postPrepaymentStrategy: input.strategy,
    },
  };
  const scenarioEvents: LoanEvent[] = [
    ...input.events,
    {
      id: 'scenario-prepayment',
      loanId: account.id,
      type: 'part-prepayment',
      effectiveDate: input.prepaymentDate,
      amount: input.amount,
      source: 'system',
      createdDate: input.asOfDate,
    },
    ...(input.newEmi
      ? ([
          {
            id: 'scenario-emi',
            loanId: account.id,
            type: 'emi-change',
            effectiveDate: input.prepaymentDate,
            newEmi: input.newEmi,
            source: 'system',
            createdDate: input.asOfDate,
          },
        ] satisfies LoanEvent[])
      : []),
  ];
  const scenario = calculateLoan({ account, events: scenarioEvents, asOfDate: input.asOfDate });
  const atPrepayment = calculateLoan({
    account,
    events: scenarioEvents,
    asOfDate: input.prepaymentDate,
  });
  return {
    baselinePayoffDate: baseline.position.projectedPayoffDate,
    projectedPayoffDate: scenario.position.projectedPayoffDate,
    monthsSaved: Math.max(
      0,
      monthDifference(baseline.position.projectedPayoffDate, scenario.position.projectedPayoffDate),
    ),
    futureInterestBefore: baseline.position.futureInterest,
    futureInterestAfter: scenario.position.futureInterest,
    interestSaved: Math.max(0, baseline.position.futureInterest - scenario.position.futureInterest),
    outstandingAfterPrepayment: atPrepayment.position.outstandingPrincipal,
    projectedEmi: scenario.position.currentEmi,
  };
}
