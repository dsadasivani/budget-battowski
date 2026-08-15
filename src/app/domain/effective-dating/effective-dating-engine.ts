import type { EffectiveDatedVersion, EffectiveDatingResult } from './effective-dating.models';

export function isVersionEffectiveOnDate(version: EffectiveDatedVersion, date: string): boolean {
  return (
    version.operation !== 'deleted' &&
    (!version.effectiveStartDate || version.effectiveStartDate <= date) &&
    (!version.effectiveEndDate || version.effectiveEndDate >= date)
  );
}

export function effectiveValueForDate<T extends EffectiveDatedVersion>(
  current: T,
  history: readonly T[],
  date: string,
): EffectiveDatingResult<T> | null {
  const historical = [...history]
    .filter((version) => isVersionEffectiveOnDate(version, date))
    .sort((left, right) =>
      (right.effectiveStartDate ?? '').localeCompare(left.effectiveStartDate ?? ''),
    )[0];
  if (historical) {
    return { value: historical, source: 'historical' };
  }
  return isVersionEffectiveOnDate(current, date) ? { value: current, source: 'current' } : null;
}

export function effectiveValueForOccurrence<T>(
  current: T,
  history: readonly (T & EffectiveDatedVersion)[],
  occurrenceDate: (value: T) => string | null,
): EffectiveDatingResult<T> | null {
  const historical = [...history]
    .filter((version) => {
      const date = occurrenceDate(version);
      return !!date && isVersionEffectiveOnDate(version, date);
    })
    .sort((left, right) =>
      (right.effectiveStartDate ?? '').localeCompare(left.effectiveStartDate ?? ''),
    )[0];
  if (historical) {
    return { value: historical, source: 'historical' };
  }

  const currentOccurrenceDate = occurrenceDate(current);
  return currentOccurrenceDate &&
    isVersionEffectiveOnDate(current as T & EffectiveDatedVersion, currentOccurrenceDate)
    ? { value: current, source: 'current' }
    : null;
}

export function closeEffectiveVersion<T extends EffectiveDatedVersion>(
  value: T,
  effectiveEndDate: string,
): T {
  return { ...value, effectiveEndDate };
}
