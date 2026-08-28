import { decimalString, investmentDecimal, moneyString } from './investment-decimal';
import { effectiveRecurringAmount, monthlyRecurringCommitment } from './investment-recurring';
import {
  isContributionType,
  isWithdrawalType,
  type InvestmentAccount,
  type InvestmentTransaction,
  type PortfolioSummary,
} from './investment.models';

export function calculatePortfolioSummary(
  accounts: readonly InvestmentAccount[],
  transactions: readonly InvestmentTransaction[],
  month: string,
  asOfDate: string,
): PortfolioSummary {
  const active = accounts.filter((account) => account.status === 'ACTIVE');
  const currentValue = active.reduce(
    (sum, account) => sum.plus(account.summary.currentValue),
    investmentDecimal(0),
  );
  const investedAmount = active.reduce(
    (sum, account) => sum.plus(account.summary.remainingCostBasis),
    investmentDecimal(0),
  );
  const overallReturnAmount = active.reduce(
    (sum, account) => sum.plus(account.summary.overallReturnAmount),
    investmentDecimal(0),
  );
  const monthTransactions = transactions.filter((transaction) =>
    transaction.date.startsWith(`${month}-`),
  );
  const investedThisMonth = monthTransactions
    .filter((transaction) => isContributionType(transaction.type))
    .reduce((sum, transaction) => sum.plus(transaction.amount), investmentDecimal(0));
  const withdrawnThisMonth = monthTransactions
    .filter((transaction) => isWithdrawalType(transaction.type))
    .reduce((sum, transaction) => sum.plus(transaction.amount), investmentDecimal(0));
  const recurringCommitment = active.reduce(
    (sum, account) => sum.plus(monthlyRecurringCommitment(account.recurringPlan, asOfDate)),
    investmentDecimal(0),
  );
  const percentage = investedAmount.isZero()
    ? investmentDecimal(0)
    : overallReturnAmount.div(investedAmount).mul(100);

  return {
    currentValue: moneyString(currentValue),
    investedAmount: moneyString(investedAmount),
    overallReturnAmount: moneyString(overallReturnAmount),
    overallReturnPercentage: decimalString(percentage, 4),
    investedThisMonth: moneyString(investedThisMonth),
    withdrawnThisMonth: moneyString(withdrawnThisMonth),
    recurringCommitmentMonthly: moneyString(recurringCommitment),
  };
}

export function recurringAmountForAccount(account: InvestmentAccount, asOfDate: string): string {
  return effectiveRecurringAmount(account.recurringPlan, asOfDate);
}
