export class ConcurrentModificationError extends Error {
  readonly code = 'concurrent-modification';

  constructor(
    readonly collection: string,
    readonly recordId: string,
    message = 'This record was changed by another workspace member. Refresh and review the latest values before saving again.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ConcurrentModificationError';
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
      recordId?: string;
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PersistenceError';
  }
}
