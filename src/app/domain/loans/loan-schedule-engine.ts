export function loanOccurrenceDate(month: string, startDate: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const nominalDay = Math.max(1, Math.min(31, Number(startDate.slice(-2)) || 1));
  return `${month}-${String(Math.min(nominalDay, lastDay)).padStart(2, '0')}`;
}

export function isLoanOccurrenceInRange(
  month: string,
  startDate: string,
  endDate?: string,
  effectiveStartDate?: string,
): boolean {
  const occurrenceDate = loanOccurrenceDate(month, startDate);
  return (
    occurrenceDate >= startDate &&
    (!effectiveStartDate || occurrenceDate >= effectiveStartDate) &&
    (!endDate || occurrenceDate <= endDate)
  );
}
