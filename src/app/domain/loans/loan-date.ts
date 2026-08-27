import Decimal from 'decimal.js';

import type { LoanDayCountConvention } from './loan.models';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLoanDate(value: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Invalid loan date: ${value}`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid loan date: ${value}`);
  }
  return date;
}

export function formatLoanDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysBetween(start: string, end: string): number {
  return Math.max(0, (parseLoanDate(end).getTime() - parseLoanDate(start).getTime()) / 86_400_000);
}

export function addLoanMonths(dateValue: string, offset: number, nominalDay?: number): string {
  const date = parseLoanDate(dateValue);
  const day = nominalDay ?? date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatLoanDate(target);
}

export function loanYearFraction(
  start: string,
  end: string,
  convention: LoanDayCountConvention,
): Decimal {
  if (end <= start) {
    return new Decimal(0);
  }
  if (convention === '30-360') {
    const startDate = parseLoanDate(start);
    const endDate = parseLoanDate(end);
    const d1 = Math.min(30, startDate.getUTCDate());
    const d2 = d1 === 30 ? Math.min(30, endDate.getUTCDate()) : endDate.getUTCDate();
    const numerator =
      (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 360 +
      (endDate.getUTCMonth() - startDate.getUTCMonth()) * 30 +
      d2 -
      d1;
    return new Decimal(Math.max(0, numerator)).div(360);
  }
  if (convention === 'actual-360' || convention === 'actual-365' || convention === 'actual-366') {
    const basis = convention === 'actual-360' ? 360 : convention === 'actual-365' ? 365 : 366;
    return new Decimal(daysBetween(start, end)).div(basis);
  }

  let cursor = start;
  let fraction = new Decimal(0);
  while (cursor < end) {
    const cursorDate = parseLoanDate(cursor);
    const nextYear = `${cursorDate.getUTCFullYear() + 1}-01-01`;
    const segmentEnd = nextYear < end ? nextYear : end;
    fraction = fraction.plus(
      new Decimal(daysBetween(cursor, segmentEnd)).div(
        isLeapYear(cursorDate.getUTCFullYear()) ? 366 : 365,
      ),
    );
    cursor = segmentEnd;
  }
  return fraction;
}
