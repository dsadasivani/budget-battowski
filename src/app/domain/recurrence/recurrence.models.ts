import type { InvestmentFrequency } from '../../budget.models';

export interface RecurrenceRule {
  frequency: InvestmentFrequency;
  startDate: string;
  endDate?: string;
  effectiveStartDate?: string;
  amount: number;
  skippedMonths?: readonly string[];
}

export interface Occurrence {
  date: string;
  amount: number;
}

export interface MonthlySchedule {
  amount: number;
  date: string;
  occurrences: number;
}
