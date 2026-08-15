import type { EntityDelete, EntityMutations, VersionedRecord } from './entity-mutations';

function comparableRecord<T extends VersionedRecord>(record: T): unknown {
  const { version: _version, ...value } = record;
  return normalize(value);
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]),
  );
}

export function recordsEqual<T extends VersionedRecord>(left: T, right: T): boolean {
  return JSON.stringify(comparableRecord(left)) === JSON.stringify(comparableRecord(right));
}

export function planEntityMutations<T extends VersionedRecord>(
  original: readonly T[],
  next: readonly T[],
  explicitlyDeletedIds: readonly string[] = [],
): EntityMutations<T> {
  const originalById = new Map(original.map((record) => [record.id, record]));
  const nextById = new Map(next.map((record) => [record.id, record]));
  const deletedIds = new Set(explicitlyDeletedIds);
  const creates: T[] = [];
  const updates: EntityMutations<T>['updates'] = [];

  for (const record of next) {
    if (deletedIds.has(record.id)) {
      continue;
    }

    const previous = originalById.get(record.id);
    if (!previous) {
      creates.push(record);
      continue;
    }

    if (!recordsEqual(previous, record)) {
      updates.push({
        record,
        expectedVersion: record.version ?? previous.version ?? 0,
      });
    }
  }

  const deletes: EntityDelete[] = [...deletedIds]
    .map((recordId) => {
      const previous = originalById.get(recordId);
      return previous ? { id: recordId, expectedVersion: previous.version ?? 0 } : { id: recordId };
    })
    .filter(({ id }) => originalById.has(id) || nextById.has(id));

  return { creates, updates, deletes };
}

export function applyEntityMutations<T extends VersionedRecord>(
  current: readonly T[],
  mutations: EntityMutations<T>,
): T[] {
  const nextById = new Map(current.map((record) => [record.id, record]));
  for (const mutation of mutations.deletes) {
    nextById.delete(mutation.id);
  }
  for (const record of mutations.creates) {
    nextById.set(record.id, { ...record, version: record.version ?? 1 });
  }
  for (const { record, expectedVersion } of mutations.updates) {
    nextById.set(record.id, { ...record, version: expectedVersion + 1 });
  }
  return [...nextById.values()];
}
