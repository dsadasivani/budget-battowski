export interface VersionedRecord {
  id: string;
  version?: number;
}

export interface EntityUpdate<T extends VersionedRecord> {
  record: T;
  expectedVersion: number;
}

export interface EntityDelete {
  id: string;
  expectedVersion?: number;
}

export interface EntityMutations<T extends VersionedRecord> {
  creates: T[];
  updates: EntityUpdate<T>[];
  deletes: EntityDelete[];
}

export function emptyEntityMutations<T extends VersionedRecord>(): EntityMutations<T> {
  return { creates: [], updates: [], deletes: [] };
}

export function hasEntityMutations<T extends VersionedRecord>(
  mutations: EntityMutations<T>,
): boolean {
  return !!(mutations.creates.length || mutations.updates.length || mutations.deletes.length);
}
