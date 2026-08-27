import { calculateLoan } from './loan-engine';
import type {
  LoanAccount,
  LoanDayCountConvention,
  LoanEvent,
  LoanInterestCalculationMethod,
  LoanRoundingPolicy,
} from './loan.models';

export interface LoanPolicyCheckpoint {
  dueDate: string;
  interestAmount: number;
  closingPrincipal: number;
}

export interface LoanPolicyCheckpointResult extends LoanPolicyCheckpoint {
  calculatedInterest: number;
  calculatedClosingPrincipal: number;
  interestDifference: number;
  closingDifference: number;
  exact: boolean;
}

export interface LoanPolicyCandidate {
  interestCalculationMethod: LoanInterestCalculationMethod;
  dayCountConvention: LoanDayCountConvention;
  roundingPolicy: LoanRoundingPolicy;
  calculatedInterest: number;
  calculatedClosingPrincipal: number;
  interestDifference: number;
  closingDifference: number;
  totalDifference: number;
  exact: boolean;
  checkpointResults: LoanPolicyCheckpointResult[];
}

export interface LoanPolicyMatchResult {
  status: 'exact' | 'ambiguous' | 'close' | 'none';
  best?: LoanPolicyCandidate;
  exactMatchCount: number;
  candidates: LoanPolicyCandidate[];
  message: string;
}

const DAY_COUNTS: LoanDayCountConvention[] = [
  '30-360',
  'actual-365',
  'actual-360',
  'actual-actual',
  'actual-366',
];
const SCALES = [0, 2] as const;
const ROUNDING_MODES = ['half-up', 'half-even'] as const;

function candidatePolicies(): Array<{
  method: LoanInterestCalculationMethod;
  dayCount: LoanDayCountConvention;
  rounding: LoanRoundingPolicy;
}> {
  const policies: Array<{
    method: LoanInterestCalculationMethod;
    dayCount: LoanDayCountConvention;
    rounding: LoanRoundingPolicy;
  }> = [];
  for (const scale of SCALES) {
    for (const roundingMode of ROUNDING_MODES) {
      const rounding: LoanRoundingPolicy = {
        monetaryScale: scale,
        interestRounding: roundingMode,
        installmentRounding: roundingMode,
        finalInstallmentAdjustment: true,
      };
      policies.push({ method: 'monthly-reducing', dayCount: 'actual-365', rounding });
      for (const dayCount of DAY_COUNTS) {
        policies.push({ method: 'daily-reducing', dayCount, rounding });
      }
    }
  }
  return policies;
}

function matcherEvents(events: readonly LoanEvent[]): LoanEvent[] {
  return events.filter(
    (event) =>
      event.type !== 'emi-payment' &&
      event.type !== 'charge' &&
      event.type !== 'penal-charge' &&
      event.type !== 'charge-reversal' &&
      event.type !== 'waiver' &&
      event.type !== 'refund' &&
      event.type !== 'balance-anchor' &&
      event.type !== 'foreclosure',
  );
}

export function matchLoanCalculationPolicy(input: {
  account: LoanAccount;
  events: readonly LoanEvent[];
  checkpoints: readonly LoanPolicyCheckpoint[];
  tolerance?: number;
}): LoanPolicyMatchResult {
  const tolerance = Math.max(0, input.tolerance ?? 0);
  const candidates: LoanPolicyCandidate[] = [];
  const checkpoints = [...input.checkpoints].sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate),
  );
  const latestCheckpointDate = checkpoints.at(-1)?.dueDate;

  if (!latestCheckpointDate) {
    return {
      status: 'none',
      exactMatchCount: 0,
      candidates,
      message: 'Add at least one lender schedule row to find a calculation match.',
    };
  }

  for (const policy of candidatePolicies()) {
    const account: LoanAccount = {
      ...input.account,
      contract: {
        ...input.account.contract,
        interestCalculationMethod: policy.method,
        dayCountConvention: policy.dayCount,
        roundingPolicy: policy.rounding,
      },
    };
    try {
      const calculation = calculateLoan({
        account,
        events: matcherEvents(input.events),
        asOfDate: account.contract.disbursementDate,
      });
      const checkpointResults = checkpoints.map((checkpoint) => {
        const row = calculation.schedule.find(
          (scheduleEntry) => scheduleEntry.dueDate === checkpoint.dueDate,
        );
        if (!row) return undefined;
        const interestDifference = row.interestComponent - checkpoint.interestAmount;
        const closingDifference = row.closingPrincipal - checkpoint.closingPrincipal;
        return {
          ...checkpoint,
          calculatedInterest: row.interestComponent,
          calculatedClosingPrincipal: row.closingPrincipal,
          interestDifference,
          closingDifference,
          exact:
            Math.abs(interestDifference) <= tolerance && Math.abs(closingDifference) <= tolerance,
        } satisfies LoanPolicyCheckpointResult;
      });
      if (
        checkpointResults.length === 0 ||
        checkpointResults.some((checkpoint) => checkpoint === undefined)
      ) {
        continue;
      }
      const completeResults = checkpointResults as LoanPolicyCheckpointResult[];
      const latestCheckpoint = completeResults.at(-1)!;
      const totalDifference = completeResults.reduce(
        (total, checkpoint) =>
          total + Math.abs(checkpoint.interestDifference) + Math.abs(checkpoint.closingDifference),
        0,
      );
      candidates.push({
        interestCalculationMethod: policy.method,
        dayCountConvention: policy.dayCount,
        roundingPolicy: policy.rounding,
        calculatedInterest: latestCheckpoint.calculatedInterest,
        calculatedClosingPrincipal: latestCheckpoint.calculatedClosingPrincipal,
        interestDifference: latestCheckpoint.interestDifference,
        closingDifference: latestCheckpoint.closingDifference,
        totalDifference,
        exact: completeResults.every((checkpoint) => checkpoint.exact),
        checkpointResults: completeResults,
      });
    } catch {
      // Invalid candidates are intentionally excluded from the ranked result.
    }
  }

  candidates.sort(
    (left, right) =>
      left.totalDifference - right.totalDifference ||
      Number(right.roundingPolicy.interestRounding === 'half-up') -
        Number(left.roundingPolicy.interestRounding === 'half-up'),
  );
  const exactMatchCount = candidates.filter((candidate) => candidate.exact).length;
  const best = candidates[0];
  if (!best) {
    return {
      status: 'none',
      exactMatchCount: 0,
      candidates,
      message: 'No supported calculation could produce rows for the supplied EMI dates.',
    };
  }
  if (exactMatchCount === 1) {
    return {
      status: 'exact',
      best,
      exactMatchCount,
      candidates,
      message: 'Exact lender match found.',
    };
  }
  if (exactMatchCount > 1) {
    const exactCandidates = candidates.filter((candidate) => candidate.exact);
    const differsOnlyByHalfRule = exactCandidates.every(
      (candidate) =>
        candidate.interestCalculationMethod === exactCandidates[0].interestCalculationMethod &&
        candidate.dayCountConvention === exactCandidates[0].dayCountConvention &&
        candidate.roundingPolicy.monetaryScale === exactCandidates[0].roundingPolicy.monetaryScale,
    );
    return {
      status: 'ambiguous',
      best,
      exactMatchCount,
      candidates,
      message: differsOnlyByHalfRule
        ? 'The calculation rule is identified. This row cannot reveal the rare exact-half rounding rule, so round 0.5 up is recommended.'
        : `${exactMatchCount} rules match the supplied row${input.checkpoints.length === 1 ? '' : 's'}. Add a row after a mid-cycle change to identify the rule more precisely.`,
    };
  }
  return {
    status: best.totalDifference <= Math.max(10, tolerance * 2) ? 'close' : 'none',
    best,
    exactMatchCount,
    candidates,
    message:
      best.totalDifference <= Math.max(10, tolerance * 2)
        ? 'A close match was found. Review the differences before applying it.'
        : 'No close match was found. Check the EMI date and lender values.',
  };
}

export function loanPolicyDescription(candidate: LoanPolicyCandidate): string {
  const method =
    candidate.interestCalculationMethod === 'monthly-reducing'
      ? 'Once per EMI cycle'
      : 'Daily balance';
  const dayBasis =
    candidate.interestCalculationMethod === 'monthly-reducing'
      ? 'monthly rate'
      : candidate.dayCountConvention === '30-360'
        ? '30-day months'
        : candidate.dayCountConvention.replace('actual-', 'actual days / ');
  const precision =
    candidate.roundingPolicy.monetaryScale === 0 ? 'nearest rupee' : 'nearest paise';
  const rounding =
    candidate.roundingPolicy.interestRounding === 'half-up' ? 'round 0.5 up' : 'round 0.5 to even';
  return `${method} · ${dayBasis} · ${precision} · ${rounding}`;
}
