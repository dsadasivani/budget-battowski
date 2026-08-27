import { describe, expect, it } from 'vitest';

import { loanAccuracyStatus, reconcileLoanBalance } from './loan-reconciliation';

describe('loan reconciliation', () => {
  it('matches within tolerance and only verifies lender-backed checkpoints', () => {
    const manual = reconcileLoanBalance({
      id: 'r1',
      loanId: 'loan-1',
      asOfDate: '2026-07-31',
      lenderReportedOutstanding: 1_822_753,
      calculatedOutstanding: 1_822_754,
      tolerance: 1,
      sourceKind: 'manual',
      createdDate: '2026-08-17T00:00:00.000Z',
    });
    expect(manual.status).toBe('matched');
    expect(loanAccuracyStatus([manual]).label).toBe('Reconciled');
    expect(
      loanAccuracyStatus([
        { ...manual, sourceKind: 'bank-statement', sourceDocumentId: 'document-1' },
      ]).label,
    ).toBe('Verified');
  });
});
