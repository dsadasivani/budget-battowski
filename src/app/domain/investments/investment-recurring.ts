import { decimalString, investmentDecimal } from './investment-decimal';
import type { InvestmentFrequencyV2, RecurringInvestmentPlan } from './investment.models';

const FREQUENCY_MONTHS: Record<InvestmentFrequencyV2, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function stepUpCount(
  effectiveFrom: string,
  asOfDate: string,
  frequency: InvestmentFrequencyV2,
): number {
  if (asOfDate < effectiveFrom) return 0;
  const elapsedMonths = monthIndex(asOfDate) - monthIndex(effectiveFrom);
  const beforeScheduledDay = asOfDate.slice(8, 10) < effectiveFrom.slice(8, 10);
  const adjustedMonths = beforeScheduledDay ? elapsedMonths - 1 : elapsedMonths;
  return Math.floor(adjustedMonths / FREQUENCY_MONTHS[frequency]) + 1;
}

export function effectiveRecurringAmount(
  plan: RecurringInvestmentPlan | undefined,
  asOfDate: string,
): string {
  if (!plan?.enabled || asOfDate < plan.startDate || (plan.endDate && asOfDate > plan.endDate))
    return '0';
  const base = investmentDecimal(plan.amount);
  const stepUp = plan.stepUp;
  if (!stepUp?.enabled || asOfDate < stepUp.effectiveFrom) return decimalString(base, 2);
  const increments = stepUpCount(stepUp.effectiveFrom, asOfDate, stepUp.frequency);
  if (stepUp.type === 'PERCENTAGE') {
    return decimalString(
      base.mul(investmentDecimal(1).plus(investmentDecimal(stepUp.value).div(100)).pow(increments)),
      2,
    );
  }
  return decimalString(base.plus(investmentDecimal(stepUp.value).mul(increments)), 2);
}

export function monthlyRecurringCommitment(
  plan: RecurringInvestmentPlan | undefined,
  asOfDate: string,
): string {
  const effective = investmentDecimal(effectiveRecurringAmount(plan, asOfDate));
  if (!plan) return '0';
  return decimalString(effective.div(FREQUENCY_MONTHS[plan.frequency]), 2);
}
