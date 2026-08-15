import { describe, expect, it } from 'vitest';

import { SAFE_BATCH_SIZE } from './firestore-write-coordinator';

describe('Firestore write coordinator', () => {
  it('uses a conservative transaction chunk below the Firestore document limit', () => {
    expect(SAFE_BATCH_SIZE).toBe(200);
    expect(SAFE_BATCH_SIZE).toBeLessThan(500);
  });
});
