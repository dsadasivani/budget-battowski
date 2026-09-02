import { describe, expect, it } from 'vitest';

import type { SmsTransaction } from '../../budget.models';
import { expenseFromSms, isReady, submissionIssue } from './sms-review';

function transaction(update: Partial<SmsTransaction> = {}): SmsTransaction {
  return {
    id: 'sms-1',
    ownerUid: 'uid-owner',
    source: 'sms',
    deviceId: 'dev-1',
    sourceEventId: 'event-1',
    sender: 'HDFCBK',
    receivedAt: '2026-09-01T02:12:00.000Z',
    transactionDate: '2026-09-01T02:12:00.000Z',
    amount: 450,
    transactionType: 'debit',
    merchant: 'Zomato',
    categoryId: 'food',
    paymentModeId: 'upi-hdfc',
    decision: 'pending',
    status: 'pending',
    createdDate: '2026-09-01T02:12:01.000Z',
    updatedDate: '2026-09-01T02:12:01.000Z',
    ...update,
  };
}

describe('SMS transaction review', () => {
  it('defines ready as an untouched debit with all required expense fields', () => {
    expect(isReady(transaction())).toBe(true);
    expect(isReady(transaction({ categoryId: undefined }))).toBe(false);
    expect(isReady(transaction({ transactionType: 'credit' }))).toBe(false);
  });

  it('reports all validation issues without blocking discarded rows', () => {
    expect(
      submissionIssue(
        transaction({
          decision: 'accept',
          merchant: '',
          amount: undefined,
          categoryId: undefined,
          paymentModeId: undefined,
        }),
      )?.messages,
    ).toEqual([
      'Valid amount required',
      'Merchant required',
      'Category required',
      'Paid via required',
    ]);
    expect(submissionIssue(transaction({ decision: 'discard', categoryId: undefined }))).toBeNull();
  });

  it('creates an existing-format one-time expense with bidirectional provenance', () => {
    const expense = expenseFromSms(
      transaction({ decision: 'accept', notes: 'Dinner' }),
      'owner@example.com',
    );
    expect(expense).toMatchObject({
      id: 'sms_sms-1',
      month: '2026-09',
      date: '2026-09-01',
      name: 'Zomato',
      amount: 450,
      type: 'one-time',
      note: 'Dinner',
      source: 'sms',
      sourceSmsTransactionId: 'sms-1',
      ownerUid: 'uid-owner',
    });
  });
});
