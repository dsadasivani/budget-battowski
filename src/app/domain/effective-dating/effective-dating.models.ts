export interface EffectiveDatedVersion {
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  operation?: 'created' | 'updated' | 'deleted';
}

export interface EffectiveDatingResult<T> {
  value: T;
  source: 'current' | 'historical';
}
