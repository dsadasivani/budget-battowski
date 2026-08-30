import type { GovernmentInterestRate } from './investment.models';

const PPF_RULES_URL =
  'https://www.nsiindia.gov.in/writereaddata/SchemeRules/PublicProvidentFundSchemeRule.pdf';
const SSY_RULES_URL =
  'https://www.nsiindia.gov.in/writereaddata/SchemeRules/SukanyaSamriddhiAccountSchemeRule.pdf';
const Q1_2023_RATES_URL =
  'https://dea.gov.in/budget-division/revision-interest-rates-small-savings-schemes-q1-fy-2023-24';
const Q4_2023_RATES_URL =
  'https://dea.gov.in/budget-division/revision-interest-rates-small-saving-schemes-q4-2023-24';
const Q2_2026_RATES_URL =
  'https://dea.gov.in/budget-division/revision-interest-rates-small-savings-schemes-reg';

const VERIFIED_AT = '2026-08-30T00:00:00.000Z';

// Explicit end dates prevent the latest known rate from silently continuing into an unverified quarter.
export const GOVERNMENT_INTEREST_RATES: readonly GovernmentInterestRate[] = [
  {
    scheme: 'PPF',
    annualRate: '7.1',
    effectiveFrom: '2020-04-01',
    effectiveTo: '2026-06-30',
    sourceUrl: PPF_RULES_URL,
    publishedDate: '2020-05-05',
    verifiedAt: VERIFIED_AT,
  },
  {
    scheme: 'PPF',
    annualRate: '7.1',
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-09-30',
    sourceUrl: Q2_2026_RATES_URL,
    publishedDate: '2026-06-30',
    verifiedAt: VERIFIED_AT,
  },
  {
    scheme: 'SSY',
    annualRate: '7.6',
    effectiveFrom: '2020-04-01',
    effectiveTo: '2023-03-31',
    sourceUrl: SSY_RULES_URL,
    publishedDate: '2020-05-05',
    verifiedAt: VERIFIED_AT,
  },
  {
    scheme: 'SSY',
    annualRate: '8.0',
    effectiveFrom: '2023-04-01',
    effectiveTo: '2023-12-31',
    sourceUrl: Q1_2023_RATES_URL,
    publishedDate: '2023-03-31',
    verifiedAt: VERIFIED_AT,
  },
  {
    scheme: 'SSY',
    annualRate: '8.2',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2026-06-30',
    sourceUrl: Q4_2023_RATES_URL,
    publishedDate: '2023-12-29',
    verifiedAt: VERIFIED_AT,
  },
  {
    scheme: 'SSY',
    annualRate: '8.2',
    effectiveFrom: '2026-07-01',
    effectiveTo: '2026-09-30',
    sourceUrl: Q2_2026_RATES_URL,
    publishedDate: '2026-06-30',
    verifiedAt: VERIFIED_AT,
  },
] as const;

export class GovernmentInterestRateCoverageError extends Error {
  constructor(
    readonly scheme: 'PPF' | 'SSY',
    readonly date: string,
  ) {
    super(`No explicitly verified ${scheme} interest rate covers ${date}.`);
    this.name = 'GovernmentInterestRateCoverageError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isVerifiedAt(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isOfficialUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['dea.gov.in', 'www.dea.gov.in', 'nsiindia.gov.in', 'www.nsiindia.gov.in'].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

function parseRate(value: unknown): GovernmentInterestRate | undefined {
  if (!isRecord(value)) return undefined;
  const { scheme, annualRate, effectiveFrom, effectiveTo, sourceUrl, publishedDate, verifiedAt } =
    value;
  if (
    (scheme !== 'PPF' && scheme !== 'SSY') ||
    typeof annualRate !== 'string' ||
    !Number.isFinite(Number(annualRate)) ||
    Number(annualRate) <= 0 ||
    !isDate(effectiveFrom) ||
    !isDate(effectiveTo) ||
    effectiveTo < effectiveFrom ||
    !isOfficialUrl(sourceUrl) ||
    !isDate(publishedDate) ||
    !isVerifiedAt(verifiedAt)
  ) {
    return undefined;
  }
  return { scheme, annualRate, effectiveFrom, effectiveTo, sourceUrl, publishedDate, verifiedAt };
}

export function parseGovernmentInterestRates(value: unknown): GovernmentInterestRate[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rates: GovernmentInterestRate[] = [];
  for (const item of value) {
    const rate = parseRate(item);
    if (!rate) return undefined;
    rates.push(rate);
  }
  rates.sort(
    (left, right) =>
      left.scheme.localeCompare(right.scheme) ||
      left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  for (let index = 1; index < rates.length; index++) {
    const previous = rates[index - 1];
    const current = rates[index];
    if (previous.scheme === current.scheme && previous.effectiveTo >= current.effectiveFrom) {
      return undefined;
    }
  }
  return rates;
}

export function governmentInterestRateFor(
  scheme: 'PPF' | 'SSY',
  date: string,
  rates: readonly GovernmentInterestRate[],
): GovernmentInterestRate | undefined {
  return rates.find(
    (rate) => rate.scheme === scheme && rate.effectiveFrom <= date && rate.effectiveTo >= date,
  );
}
