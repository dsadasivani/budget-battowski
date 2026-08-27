import Decimal from 'decimal.js';

import { addLoanMonths, daysBetween, loanYearFraction } from './loan-date';
import { eventAmount, sortLoanEvents } from './loan-events';
import { calculateEmi, decimal, moneyNumber, roundInstallment, roundMoney } from './loan-money';
import type {
  LoanAccount,
  LoanCalculationDiagnostic,
  LoanCalculationResult,
  LoanEvent,
  LoanScheduleEntry,
  LoanScheduleInterimEvent,
  LoanTransactionView,
} from './loan.models';

const MAX_INSTALLMENTS = 1_200;

interface EngineState {
  principal: Decimal;
  accruedInterest: Decimal;
  annualRate: number;
  emi: Decimal;
  maturityDate?: string;
  moratorium: boolean;
  foreclosed: boolean;
  principalRepaid: Decimal;
  interestPaid: Decimal;
  chargesPaid: Decimal;
  prepaymentsMade: Decimal;
  totalPaid: Decimal;
  historyPartial: boolean;
  historyCoverageStartDate?: string;
}

interface PeriodAmounts {
  interestAccrued: Decimal;
  interestPaid: Decimal;
  principalPaid: Decimal;
  prepayment: Decimal;
  charges: Decimal;
  actualPayment: Decimal;
  actualPaymentDate?: string;
  adjusted: boolean;
  interimEvents: LoanScheduleInterimEvent[];
  eventProvenance: LoanScheduleInterimEvent['provenance'];
}

function emptyPeriod(projected = false): PeriodAmounts {
  return {
    interestAccrued: decimal(0),
    interestPaid: decimal(0),
    principalPaid: decimal(0),
    prepayment: decimal(0),
    charges: decimal(0),
    actualPayment: decimal(0),
    adjusted: false,
    interimEvents: [],
    eventProvenance: projected ? 'projected' : 'recorded',
  };
}

function cloneState(state: EngineState): EngineState {
  return {
    ...state,
    principal: decimal(state.principal),
    accruedInterest: decimal(state.accruedInterest),
    emi: decimal(state.emi),
    principalRepaid: decimal(state.principalRepaid),
    interestPaid: decimal(state.interestPaid),
    chargesPaid: decimal(state.chargesPaid),
    prepaymentsMade: decimal(state.prepaymentsMade),
    totalPaid: decimal(state.totalPaid),
  };
}

function allocatePayment(
  state: EngineState,
  amountValue: number | Decimal,
): {
  interest: Decimal;
  principal: Decimal;
} {
  const amount = Decimal.max(0, decimal(amountValue));
  const interest = Decimal.min(amount, state.accruedInterest);
  state.accruedInterest = state.accruedInterest.minus(interest);
  const principal = Decimal.min(state.principal, amount.minus(interest));
  state.principal = state.principal.minus(principal);
  state.interestPaid = state.interestPaid.plus(interest);
  state.principalRepaid = state.principalRepaid.plus(principal);
  state.totalPaid = state.totalPaid.plus(amount);
  return { interest, principal };
}

function remainingMonths(nextDue: string, maturityDate: string): number {
  const [nextYear, nextMonth] = nextDue.split('-').map(Number);
  const [endYear, endMonth] = maturityDate.split('-').map(Number);
  return Math.max(1, (endYear - nextYear) * 12 + endMonth - nextMonth + 1);
}

function applyEvent(
  account: LoanAccount,
  state: EngineState,
  event: LoanEvent,
  period: PeriodAmounts,
  nextDue: string,
  diagnostics: LoanCalculationDiagnostic[],
): void {
  if (event.type === 'rate-change') {
    if (event.newAnnualRate < 0) {
      diagnostics.push({
        code: 'invalid-event',
        severity: 'error',
        message: 'A rate change cannot set a negative annual rate.',
        eventId: event.id,
      });
      return;
    }
    state.annualRate = event.newAnnualRate;
    return;
  }
  if (event.type === 'emi-change') {
    if (event.newEmi <= 0) {
      diagnostics.push({
        code: 'invalid-event',
        severity: 'error',
        message: 'An EMI change must be greater than zero.',
        eventId: event.id,
      });
      return;
    }
    state.emi = roundInstallment(event.newEmi, account.contract.roundingPolicy);
    return;
  }
  if (event.type === 'tenure-change') {
    if (event.newMaturityDate) {
      state.maturityDate = event.newMaturityDate;
    } else if (event.newRemainingInstallments && event.newRemainingInstallments > 0) {
      state.maturityDate = addLoanMonths(nextDue, event.newRemainingInstallments - 1);
    } else {
      diagnostics.push({
        code: 'invalid-event',
        severity: 'error',
        message: 'A tenure change needs a maturity date or remaining-installment count.',
        eventId: event.id,
      });
    }
    return;
  }
  if (event.type === 'moratorium-start' || event.type === 'moratorium-end') {
    state.moratorium = event.type === 'moratorium-start';
    return;
  }
  if (event.type === 'balance-anchor') {
    state.principal = Decimal.max(0, roundMoney(event.amount, account.contract.roundingPolicy));
    state.accruedInterest = decimal(0);
    state.historyPartial = true;
    state.historyCoverageStartDate = event.effectiveDate;
    period.adjusted = true;
    return;
  }
  if (event.type === 'disbursement') {
    state.principal = state.principal.plus(
      Decimal.max(0, roundMoney(event.amount, account.contract.roundingPolicy)),
    );
    period.adjusted = true;
    return;
  }
  if (event.type === 'emi-payment') {
    const allocation = allocatePayment(state, event.amount);
    period.interestPaid = period.interestPaid.plus(allocation.interest);
    period.principalPaid = period.principalPaid.plus(allocation.principal);
    period.actualPayment = period.actualPayment.plus(event.amount);
    period.actualPaymentDate = event.effectiveDate;
    return;
  }
  if (event.type === 'part-prepayment') {
    const openingPrincipal = state.principal;
    const amount = Decimal.min(
      state.principal,
      Decimal.max(0, roundMoney(event.amount, account.contract.roundingPolicy)),
    );
    state.principal = state.principal.minus(amount);
    state.principalRepaid = state.principalRepaid.plus(amount);
    state.prepaymentsMade = state.prepaymentsMade.plus(amount);
    state.totalPaid = state.totalPaid.plus(amount);
    period.prepayment = period.prepayment.plus(amount);
    period.interimEvents.push({
      id: event.id,
      type: event.type,
      effectiveDate: event.effectiveDate,
      amount: moneyNumber(amount),
      openingPrincipal: moneyNumber(openingPrincipal),
      closingPrincipal: moneyNumber(state.principal),
      provenance: period.eventProvenance,
    });
    if (
      account.contract.postPrepaymentStrategy === 'keep-tenure-reduce-emi' &&
      state.maturityDate &&
      state.principal.gt(0)
    ) {
      state.emi = decimal(
        calculateEmi(
          state.principal,
          state.annualRate,
          remainingMonths(nextDue, state.maturityDate),
          account.contract.roundingPolicy,
        ),
      );
    }
    return;
  }
  if (event.type === 'charge' || event.type === 'penal-charge') {
    const amount = Decimal.max(0, roundMoney(event.amount, account.contract.roundingPolicy));
    state.chargesPaid = state.chargesPaid.plus(amount);
    period.charges = period.charges.plus(amount);
    return;
  }
  if (event.type === 'charge-reversal' || event.type === 'waiver' || event.type === 'refund') {
    const amount = Decimal.max(0, roundMoney(event.amount, account.contract.roundingPolicy));
    state.chargesPaid = Decimal.max(0, state.chargesPaid.minus(amount));
    period.charges = period.charges.minus(amount);
    return;
  }
  if (event.type === 'adjustment') {
    state.principal = Decimal.max(
      0,
      roundMoney(state.principal.plus(event.amount), account.contract.roundingPolicy),
    );
    period.adjusted = true;
    return;
  }
  if (event.type === 'foreclosure') {
    const amount = event.amount ?? state.principal.plus(state.accruedInterest).toNumber();
    const allocation = allocatePayment(state, amount);
    period.interestPaid = period.interestPaid.plus(allocation.interest);
    period.principalPaid = period.principalPaid.plus(allocation.principal);
    period.actualPayment = period.actualPayment.plus(amount);
    period.actualPaymentDate = event.effectiveDate;
    state.foreclosed = true;
  }
}

function accrueDaily(
  account: LoanAccount,
  state: EngineState,
  startDate: string,
  endDate: string,
): Decimal {
  if (endDate <= startDate || state.principal.lte(0)) {
    return decimal(0);
  }
  return roundMoney(
    state.principal
      .mul(state.annualRate)
      .div(100)
      .mul(loanYearFraction(startDate, endDate, account.contract.dayCountConvention)),
    account.contract.roundingPolicy,
  );
}

function applyEventsForPeriod(
  account: LoanAccount,
  state: EngineState,
  events: readonly LoanEvent[],
  startDate: string,
  endDate: string,
  nextDue: string,
  period: PeriodAmounts,
  diagnostics: LoanCalculationDiagnostic[],
  accrueThroughEnd = true,
): void {
  let cursor = startDate;
  for (const event of events) {
    if (account.contract.interestCalculationMethod === 'daily-reducing') {
      const interest = accrueDaily(account, state, cursor, event.effectiveDate);
      state.accruedInterest = state.accruedInterest.plus(interest);
      period.interestAccrued = period.interestAccrued.plus(interest);
      cursor = event.effectiveDate;
    }
    applyEvent(account, state, event, period, nextDue, diagnostics);
  }
  if (account.contract.interestCalculationMethod === 'daily-reducing' && accrueThroughEnd) {
    const interest = accrueDaily(account, state, cursor, endDate);
    state.accruedInterest = state.accruedInterest.plus(interest);
    period.interestAccrued = period.interestAccrued.plus(interest);
  }
}

function processDueDate(
  account: LoanAccount,
  state: EngineState,
  dueDate: string,
  previousBoundary: string,
  events: readonly LoanEvent[],
  projected: boolean,
  installmentNumber: number,
  diagnostics: LoanCalculationDiagnostic[],
): LoanScheduleEntry {
  const opening = state.principal;
  const period = emptyPeriod(projected);
  const sameDayChanges = events.filter((event) =>
    ['rate-change', 'emi-change', 'tenure-change', 'moratorium-start', 'moratorium-end'].includes(
      event.type,
    ),
  );
  const otherEvents = events.filter((event) => !sameDayChanges.includes(event));
  const changesBeforeInterest = sameDayChanges.filter((event) => event.effectiveDate === dueDate);
  const remainingEvents = otherEvents.concat(
    sameDayChanges.filter((event) => event.effectiveDate !== dueDate),
  );
  const useFirstPeriodInterestOverride =
    installmentNumber === 1 && account.contract.firstPeriodInterestAmount !== undefined;

  if (
    account.contract.interestCalculationMethod === 'monthly-reducing' ||
    useFirstPeriodInterestOverride
  ) {
    const beforeDue = sortLoanEvents(
      remainingEvents.filter((item) => item.effectiveDate < dueDate),
    );
    const deferredPayments = beforeDue.filter(
      (event) => event.type === 'emi-payment' || event.type === 'foreclosure',
    );
    const deferredPaymentIds = new Set(deferredPayments.map((event) => event.id));
    for (const event of beforeDue.filter((item) => !deferredPaymentIds.has(item.id))) {
      applyEvent(account, state, event, period, dueDate, diagnostics);
    }
    for (const event of changesBeforeInterest) {
      applyEvent(account, state, event, period, dueDate, diagnostics);
    }
    const interest = useFirstPeriodInterestOverride
      ? roundMoney(account.contract.firstPeriodInterestAmount ?? 0, account.contract.roundingPolicy)
      : roundMoney(
          state.principal.mul(state.annualRate).div(1200),
          account.contract.roundingPolicy,
        );
    state.accruedInterest = state.accruedInterest.plus(interest);
    period.interestAccrued = period.interestAccrued.plus(interest);
    for (const event of [
      ...deferredPayments,
      ...sortLoanEvents(remainingEvents.filter((item) => item.effectiveDate === dueDate)),
    ]) {
      applyEvent(account, state, event, period, dueDate, diagnostics);
    }
  } else {
    applyEventsForPeriod(
      account,
      state,
      sortLoanEvents(events),
      previousBoundary,
      dueDate,
      dueDate,
      period,
      diagnostics,
    );
  }

  const scheduledPayment = state.moratorium
    ? decimal(0)
    : state.maturityDate && dueDate >= state.maturityDate
      ? roundInstallment(
          period.actualPayment.plus(state.principal).plus(state.accruedInterest),
          account.contract.roundingPolicy,
        )
      : state.emi;
  if (projected && !state.moratorium && !state.foreclosed && state.principal.gt(0)) {
    const amount = Decimal.min(scheduledPayment, state.principal.plus(state.accruedInterest));
    const allocation = allocatePayment(state, amount);
    period.interestPaid = period.interestPaid.plus(allocation.interest);
    period.principalPaid = period.principalPaid.plus(allocation.principal);
  }

  const paidRatio = scheduledPayment.gt(0)
    ? period.actualPayment.div(scheduledPayment)
    : decimal(0);
  const status: LoanScheduleEntry['status'] = projected
    ? 'future'
    : period.adjusted
      ? 'adjusted'
      : paidRatio.gte(1)
        ? 'paid'
        : paidRatio.gt(0)
          ? 'partial'
          : dueDate === previousBoundary
            ? 'due'
            : 'overdue';

  return {
    installmentNumber,
    dueDate,
    openingPrincipal: moneyNumber(opening),
    annualRate: state.annualRate,
    interestDays:
      account.contract.interestCalculationMethod === 'daily-reducing'
        ? daysBetween(previousBoundary, dueDate)
        : undefined,
    interestAccrued: moneyNumber(period.interestAccrued),
    scheduledPayment: moneyNumber(
      projected
        ? Decimal.min(scheduledPayment, opening.plus(period.interestAccrued))
        : scheduledPayment,
    ),
    interestComponent: moneyNumber(period.interestPaid),
    principalComponent: moneyNumber(period.principalPaid),
    prepaymentAmount: moneyNumber(period.prepayment),
    charges: moneyNumber(period.charges),
    actualPaymentAmount: period.actualPayment.gt(0) ? moneyNumber(period.actualPayment) : undefined,
    actualPaymentDate: period.actualPaymentDate,
    closingPrincipal: moneyNumber(state.principal),
    status,
    provenance: projected ? 'projected' : period.actualPayment.gt(0) ? 'recorded' : 'calculated',
    interimEvents: period.interimEvents.length ? period.interimEvents : undefined,
  };
}

function eventsInRange(
  events: readonly LoanEvent[],
  afterDate: string,
  throughDate: string,
): LoanEvent[] {
  return events.filter(
    (event) => event.effectiveDate > afterDate && event.effectiveDate <= throughDate,
  );
}

function validateAccount(account: LoanAccount): void {
  const contract = account.contract;
  if (
    contract.disbursedAmount < 0 ||
    contract.initialAnnualRate < 0 ||
    (contract.firstPeriodInterestAmount !== undefined && contract.firstPeriodInterestAmount < 0) ||
    contract.initialEmi <= 0 ||
    contract.firstEmiDate < contract.disbursementDate
  ) {
    throw new Error('Loan contract contains invalid financial terms or dates.');
  }
}

export function calculateLoan(input: {
  account: LoanAccount;
  events: readonly LoanEvent[];
  asOfDate: string;
}): LoanCalculationResult {
  validateAccount(input.account);
  const { account, asOfDate } = input;
  const events = sortLoanEvents(input.events.filter((event) => event.loanId === account.id));
  const diagnostics: LoanCalculationDiagnostic[] = [];
  const nominalDay = Number(account.contract.firstEmiDate.slice(-2));
  const state: EngineState = {
    principal: roundMoney(account.contract.disbursedAmount, account.contract.roundingPolicy),
    accruedInterest: decimal(0),
    annualRate: account.contract.initialAnnualRate,
    emi: roundInstallment(account.contract.initialEmi, account.contract.roundingPolicy),
    maturityDate:
      account.contract.contractualMaturityDate ??
      (account.contract.originalTenureMonths
        ? addLoanMonths(
            account.contract.firstEmiDate,
            account.contract.originalTenureMonths - 1,
            nominalDay,
          )
        : undefined),
    moratorium: false,
    foreclosed: false,
    principalRepaid: decimal(0),
    interestPaid: decimal(0),
    chargesPaid: decimal(0),
    prepaymentsMade: decimal(0),
    totalPaid: decimal(0),
    historyPartial: !!account.historyCoverageStartDate,
    historyCoverageStartDate: account.historyCoverageStartDate,
  };
  const schedule: LoanScheduleEntry[] = [];
  let dueDate = account.contract.firstEmiDate;
  let previousBoundary = account.contract.disbursementDate;
  let installment = 1;

  while (dueDate <= asOfDate && !state.foreclosed && installment <= MAX_INSTALLMENTS) {
    schedule.push(
      processDueDate(
        account,
        state,
        dueDate,
        previousBoundary,
        eventsInRange(events, previousBoundary, dueDate),
        false,
        installment,
        diagnostics,
      ),
    );
    previousBoundary = dueDate;
    dueDate = addLoanMonths(account.contract.firstEmiDate, installment, nominalDay);
    installment += 1;
  }

  const trailingEvents = eventsInRange(events, previousBoundary, asOfDate);
  const stateAtLastDue = cloneState(state);
  const lastDueBoundary = previousBoundary;
  if (trailingEvents.length || account.contract.interestCalculationMethod === 'daily-reducing') {
    const trailingPeriod = emptyPeriod();
    applyEventsForPeriod(
      account,
      state,
      trailingEvents,
      previousBoundary,
      asOfDate,
      dueDate,
      trailingPeriod,
      diagnostics,
    );
    previousBoundary = asOfDate;
  }

  const positionState = cloneState(state);
  let projectionState = state;
  let projectionBoundary = previousBoundary;
  if (account.contract.interestCalculationMethod === 'daily-reducing') {
    projectionState = stateAtLastDue;
    const projectionTrailingPeriod = emptyPeriod();
    applyEventsForPeriod(
      account,
      projectionState,
      trailingEvents,
      lastDueBoundary,
      asOfDate,
      dueDate,
      projectionTrailingPeriod,
      diagnostics,
      false,
    );
    projectionBoundary = trailingEvents.at(-1)?.effectiveDate ?? lastDueBoundary;
  }
  const projectionStartIndex = schedule.length;
  let futureInterest = decimal(projectionState.accruedInterest);
  let futurePayments = decimal(0);
  while (
    projectionState.principal.gt(0) &&
    !projectionState.foreclosed &&
    installment <= MAX_INSTALLMENTS
  ) {
    const openingPrincipal = projectionState.principal;
    const row = processDueDate(
      account,
      projectionState,
      dueDate,
      projectionBoundary,
      eventsInRange(events, projectionBoundary, dueDate).filter(
        (event) => event.effectiveDate > asOfDate,
      ),
      true,
      installment,
      diagnostics,
    );
    schedule.push(row);
    futureInterest = futureInterest.plus(row.interestAccrued);
    futurePayments = futurePayments.plus(row.interestComponent + row.principalComponent);

    if (
      projectionState.principal.gte(openingPrincipal) &&
      row.scheduledPayment <= row.interestAccrued
    ) {
      diagnostics.push({
        code: 'non-amortizing',
        severity: 'error',
        message: 'The current EMI does not cover projected interest; the loan cannot amortize.',
      });
      break;
    }
    if (
      state.maturityDate &&
      dueDate > state.maturityDate &&
      !diagnostics.some((diagnostic) => diagnostic.code === 'maturity-exceeded')
    ) {
      diagnostics.push({
        code: 'maturity-exceeded',
        severity: 'warning',
        message: 'The calculated schedule extends beyond the recorded contractual maturity.',
      });
    }
    projectionBoundary = dueDate;
    dueDate = addLoanMonths(account.contract.firstEmiDate, installment, nominalDay);
    installment += 1;
  }

  if (installment > MAX_INSTALLMENTS && projectionState.principal.gt(0)) {
    diagnostics.push({
      code: 'non-amortizing',
      severity: 'error',
      message: `Projection stopped after ${MAX_INSTALLMENTS} installments.`,
    });
  }
  if (positionState.historyPartial) {
    diagnostics.push({
      code: 'history-partial',
      severity: 'info',
      message: `Historical principal and interest breakup is available from ${
        positionState.historyCoverageStartDate ?? 'the latest balance anchor'
      }.`,
    });
  }

  const futureRows = schedule.slice(projectionStartIndex);
  const payoffRow = [...futureRows].reverse().find((row) => row.closingPrincipal === 0);
  const transactions: LoanTransactionView[] = events
    .filter((event) => event.effectiveDate <= asOfDate)
    .map((event) => ({
      id: event.id,
      date: event.effectiveDate,
      type: event.type,
      label: event.type.replaceAll('-', ' '),
      amount: eventAmount(event),
      source: event.source,
      provenance: 'recorded',
    }));
  const needsAttention = diagnostics.some((diagnostic) => diagnostic.severity === 'error');

  return {
    position: {
      asOfDate,
      outstandingPrincipal: moneyNumber(positionState.principal),
      currentAnnualRate: positionState.annualRate,
      currentEmi: moneyNumber(positionState.emi),
      principalRepaid: positionState.historyPartial
        ? undefined
        : moneyNumber(positionState.principalRepaid),
      interestPaid: positionState.historyPartial
        ? undefined
        : moneyNumber(positionState.interestPaid),
      chargesPaid: moneyNumber(positionState.chargesPaid),
      prepaymentsMade: moneyNumber(positionState.prepaymentsMade),
      accruedInterest: moneyNumber(positionState.accruedInterest),
      remainingInstallments: futureRows.length,
      nextPaymentDate: futureRows[0]?.dueDate,
      nextPaymentAmount: futureRows[0]?.scheduledPayment,
      projectedPayoffDate: payoffRow?.dueDate,
      futureInterest: moneyNumber(futureInterest),
      projectedRemainingPayments: moneyNumber(futurePayments),
      totalPaidToDate: moneyNumber(positionState.totalPaid),
      status: needsAttention
        ? 'needs-attention'
        : positionState.foreclosed
          ? 'foreclosed'
          : positionState.principal.lte(0)
            ? 'paid-off'
            : asOfDate < account.contract.disbursementDate
              ? 'future'
              : 'active',
      historyCoverage: positionState.historyPartial ? 'partial' : 'complete',
      historyCoverageStartDate: positionState.historyCoverageStartDate,
    },
    schedule,
    transactions,
    diagnostics,
  };
}
