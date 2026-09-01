import { investmentDecimal } from './investment-decimal';
import {
  isContributionType,
  type InvestmentTransaction,
  type NpsSchemeHolding,
} from './investment.models';

function sortTransactions(transactions: readonly InvestmentTransaction[]): InvestmentTransaction[] {
  return [...transactions].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.createdDate.localeCompare(right.createdDate),
  );
}

/**
 * Derives current NPS units from the immutable opening snapshot and transaction deltas.
 * Latest catalog metadata and NAVs may be supplied separately without becoming a new baseline.
 */
export function calculateNpsSchemeHoldings(
  openingHoldings: readonly NpsSchemeHolding[],
  transactions: readonly InvestmentTransaction[],
  latestHoldings: readonly NpsSchemeHolding[] = [],
): NpsSchemeHolding[] {
  const latestByCode = new Map(latestHoldings.map((holding) => [holding.schemeCode, holding]));
  const holdings = new Map(
    openingHoldings.map((holding) => [
      holding.schemeCode,
      { ...holding, ...latestByCode.get(holding.schemeCode), units: holding.units },
    ]),
  );

  for (const transaction of sortTransactions(transactions)) {
    for (const allocation of transaction.schemeAllocations ?? []) {
      const latest = latestByCode.get(allocation.schemeCode);
      const current = holdings.get(allocation.schemeCode) ?? {
        schemeCode: allocation.schemeCode,
        schemeName: allocation.schemeName ?? latest?.schemeName,
        units: '0',
        ...latest,
      };
      const units = isContributionType(transaction.type)
        ? investmentDecimal(current.units).plus(allocation.units)
        : investmentDecimal(current.units).minus(allocation.units);
      if (units.lt(0)) throw new Error('NPS_ALLOCATION_EXCEEDS_HOLDING');
      holdings.set(allocation.schemeCode, { ...current, units: units.toString() });
    }
  }

  return [...holdings.values()];
}
