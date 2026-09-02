import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizedFingerprint, suggestedCategoryName } from './transaction-classifier.js';

const parsed = {
  transactionType: 'debit' as const,
  amount: 450,
  currency: 'INR',
  transactionDate: '2026-09-01T02:12:00.000Z',
  merchant: 'Zomato',
  accountLastFour: '1234',
  parserId: 'hdfc',
  parserVersion: '1.0.0',
  confidence: 0.9,
};

describe('financial transaction classification', () => {
  it('suggests existing category names through reusable merchant rules', () => {
    assert.equal(suggestedCategoryName(parsed), 'Food & Dining');
    assert.equal(suggestedCategoryName({ ...parsed, merchant: 'Uber' }), 'Transport');
    assert.equal(suggestedCategoryName({ ...parsed, merchant: 'Unknown Shop' }), undefined);
  });

  it('provides a stable normalized deduplication boundary', () => {
    const input = {
      ownerUid: 'uid-1',
      workspaceId: 'workspace-1',
      parsed,
      receivedAt: parsed.transactionDate,
    };
    assert.equal(normalizedFingerprint(input), normalizedFingerprint(input));
    assert.notEqual(
      normalizedFingerprint(input),
      normalizedFingerprint({ ...input, ownerUid: 'uid-2' }),
    );
    assert.notEqual(
      normalizedFingerprint(input),
      normalizedFingerprint({ ...input, parsed: { ...parsed, amount: 451 } }),
    );
  });
});
