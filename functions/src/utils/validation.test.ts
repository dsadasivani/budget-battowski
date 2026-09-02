import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateSmsPayload } from './validation.js';

const valid = {
  eventId: 'event-1',
  sender: 'HDFCBK',
  message: 'Rs.450 debited from A/C XX1234',
  receivedAt: '2026-09-01T07:42:00+05:30',
  connectorVersion: '1.0',
};

describe('SMS webhook validation', () => {
  it('normalizes a strict valid payload', () => {
    assert.deepEqual(validateSmsPayload(valid), {
      ...valid,
      receivedAt: '2026-09-01T02:12:00.000Z',
    });
  });

  it('rejects identity injection, unknown fields, invalid dates, and oversized messages', () => {
    assert.equal(validateSmsPayload({ ...valid, workspaceId: 'attacker' }), null);
    assert.equal(validateSmsPayload({ ...valid, extra: true }), null);
    assert.equal(validateSmsPayload({ ...valid, receivedAt: 'not-a-date' }), null);
    assert.equal(validateSmsPayload({ ...valid, message: 'x'.repeat(2_001) }), null);
  });
});
