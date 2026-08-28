import { moneyString, investmentDecimal } from './investment-decimal';
import {
  isContributionType,
  isWithdrawalType,
  type InvestmentAccount,
  type InvestmentTransaction,
} from './investment.models';

export interface MonthlyInvestmentBreakdown {
  recurring: Array<{ investmentId: string; name: string; amount: string }>;
  adhoc: Array<{ investmentId: string; name: string; amount: string }>;
  withdrawals: Array<{ investmentId: string; name: string; amount: string }>;
  totalContributions: string;
  totalWithdrawals: string;
}

export function investmentMonthlyBreakdown(
  accounts: readonly InvestmentAccount[],
  transactions: readonly InvestmentTransaction[],
  month: string,
): MonthlyInvestmentBreakdown {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const selected = transactions.filter((item) => item.date.startsWith(`${month}-`));
  const rows = (items: InvestmentTransaction[]) =>
    items.map((item) => ({
      investmentId: item.investmentId,
      name: names.get(item.investmentId) ?? 'Investment',
      amount: item.amount,
    }));
  const contributions = selected.filter((item) => isContributionType(item.type));
  const withdrawals = selected.filter((item) => isWithdrawalType(item.type));
  return {
    recurring: rows(contributions.filter((item) => item.source === 'RECURRING')),
    adhoc: rows(contributions.filter((item) => item.source !== 'RECURRING')),
    withdrawals: rows(withdrawals),
    totalContributions: moneyString(
      contributions.reduce((sum, item) => sum.plus(item.amount), investmentDecimal(0)),
    ),
    totalWithdrawals: moneyString(
      withdrawals.reduce((sum, item) => sum.plus(item.amount), investmentDecimal(0)),
    ),
  };
}
