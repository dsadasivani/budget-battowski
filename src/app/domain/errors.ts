export class ConcurrentModificationError extends Error {
  readonly code = 'concurrent-modification';

  constructor(
    readonly collection: string,
    readonly recordId: string,
    message = 'This record was changed by another workspace member. Refresh and review the latest values before saving again.',
    options?: ErrorOptions,
    readonly context?: {
      workspaceId: string;
      operation: 'create' | 'update' | 'delete';
      chunk: number;
      group: string;
    },
  ) {
    super(message, options);
    this.name = 'ConcurrentModificationError';
  }
}

export class MonthlyReviewSourceConflictError extends Error {
  readonly code = 'monthly-review-source-conflict';

  constructor(
    readonly sourceType: 'expense' | 'investment',
    readonly sourceId: string,
    message = 'This recurring item changed while Monthly Review was open. Review the latest monthly items before approving it.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MonthlyReviewSourceConflictError';
  }
}

export class PersistenceError extends Error {
  readonly code = 'persistence-error';

  constructor(
    message: string,
    readonly context: {
      workspaceId: string;
      collection?: string;
      operation: 'create' | 'update' | 'delete' | 'mutation-set';
      chunk?: number;
      group?: string;
      recordId?: string;
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PersistenceError';
  }
}
