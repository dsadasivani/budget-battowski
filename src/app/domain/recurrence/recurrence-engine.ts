import type { MonthlySchedule, Occurrence, RecurrenceRule } from './recurrence.models';

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return formatDate(new Date(Date.UTC(year, monthNumber, 0)));
}

function clampedDate(month: string, nominalDay: number): string {
  const lastDay = Number(monthEnd(month).slice(-2));
  return `${month}-${String(Math.min(Math.max(nominalDay, 1), lastDay)).padStart(2, '0')}`;
}

function monthDistance(start: string, end: string): number {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth;
}

function intervalMonths(frequency: RecurrenceRule['frequency']): number {
  return frequency === 'quarterly'
    ? 3
    : frequency === 'half-yearly'
      ? 6
      : frequency === 'annual'
        ? 12
        : 1;
}

export function occurrencesForMonth(rule: RecurrenceRule, month: string): Occurrence[] {
  if (rule.skippedMonths?.includes(month)) {
    return [];
  }

  const monthStart = `${month}-01`;
  const effectiveStart = [rule.startDate, rule.effectiveStartDate, monthStart]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1)!;
  const effectiveEnd =
    rule.endDate && rule.endDate < monthEnd(month) ? rule.endDate : monthEnd(month);
  if (effectiveStart > effectiveEnd) {
    return [];
  }

  if (rule.frequency === 'one-time') {
    return rule.startDate.startsWith(`${month}-`) &&
      rule.startDate >= effectiveStart &&
      rule.startDate <= effectiveEnd
      ? [{ date: rule.startDate, amount: rule.amount }]
      : [];
  }

  if (rule.frequency === 'weekly') {
    const anchor = parseDate(rule.startDate);
    const start = parseDate(effectiveStart);
    const elapsedDays = Math.floor((start.getTime() - anchor.getTime()) / 86_400_000);
    const offset = (7 - (elapsedDays % 7)) % 7;
    const first = new Date(start);
    first.setUTCDate(first.getUTCDate() + offset);
    const occurrences: Occurrence[] = [];
    for (let cursor = first; formatDate(cursor) <= effectiveEnd;) {
      occurrences.push({ date: formatDate(cursor), amount: rule.amount });
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return occurrences;
  }

  const startMonth = rule.startDate.slice(0, 7);
  const elapsedMonths = monthDistance(startMonth, month);
  if (elapsedMonths < 0 || elapsedMonths % intervalMonths(rule.frequency) !== 0) {
    return [];
  }
  const nominalDay = Number(rule.startDate.slice(-2)) || 1;
  const date = clampedDate(month, nominalDay);
  return date >= effectiveStart && date <= effectiveEnd ? [{ date, amount: rule.amount }] : [];
}

export function scheduleForMonth(rule: RecurrenceRule, month: string): MonthlySchedule | null {
  const occurrences = occurrencesForMonth(rule, month);
  if (!occurrences.length) {
    return null;
  }
  return {
    amount: occurrences.reduce((total, occurrence) => total + occurrence.amount, 0),
    date: occurrences[0].date,
    occurrences: occurrences.length,
  };
}
