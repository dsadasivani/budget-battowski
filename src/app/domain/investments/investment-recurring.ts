import { decimalString, investmentDecimal } from './investment-decimal';
import type { RecurringInvestmentPlan } from './investment.models';

function anniversaryCount(effectiveFrom: string, asOfDate: string): number {
  if (asOfDate < effectiveFrom) return 0;
  const startYear = Number(effectiveFrom.slice(0, 4));
  const asOfYear = Number(asOfDate.slice(0, 4));
  const anniversary = `${asOfYear}${effectiveFrom.slice(4)}`;
  return Math.max(0, asOfYear - startYear - (asOfDate < anniversary ? 1 : 0));
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
  const increments = anniversaryCount(stepUp.effectiveFrom, asOfDate) + 1;
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
  if (plan.frequency === 'QUARTERLY') return decimalString(effective.div(3), 2);
  if (plan.frequency === 'YEARLY') return decimalString(effective.div(12), 2);
  return decimalString(effective, 2);
}
