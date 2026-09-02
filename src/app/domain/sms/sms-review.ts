import type { ExpenseEntry, SmsTransaction } from '../../budget.models';

export interface SmsSubmissionIssue {
  transactionId: string;
  merchant: string;
  messages: string[];
}

export function transactionDate(transaction: SmsTransaction): string | undefined {
  const value = transaction.transactionDate ?? transaction.receivedAt;
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString().slice(0, 10);
}

export function submissionIssue(transaction: SmsTransaction): SmsSubmissionIssue | null {
  if (transaction.decision !== 'accept') return null;
  const messages: string[] = [];
  if (transaction.transactionType !== 'debit' && transaction.transactionType !== 'withdrawal') {
    messages.push('Only debit or withdrawal transactions can become expenses');
  }
  if (!transactionDate(transaction)) messages.push('Transaction date required');
  if (!transaction.amount || transaction.amount <= 0) messages.push('Valid amount required');
  if (!transaction.merchant?.trim()) messages.push('Merchant required');
  if (!transaction.categoryId) messages.push('Category required');
  if (!transaction.paymentModeId) messages.push('Paid via required');
  if (!transaction.ownerUid) messages.push('Owner required');
  return messages.length
    ? {
        transactionId: transaction.id,
        merchant: transaction.merchant?.trim() || transaction.description || 'Transaction',
        messages,
      }
    : null;
}

export function isReady(transaction: SmsTransaction): boolean {
  return (
    transaction.decision === 'pending' && !submissionIssue({ ...transaction, decision: 'accept' })
  );
}

export function expenseFromSms(transaction: SmsTransaction, memberEmail?: string): ExpenseEntry {
  const date = transactionDate(transaction);
  const issue = submissionIssue(transaction);
  if (!date || issue) throw new Error(issue?.messages.join(', ') || 'Transaction date required');
  return {
    id: `sms_${transaction.id}`,
    month: date.slice(0, 7),
    date,
    name: transaction.merchant!.trim(),
    categoryId: transaction.categoryId!,
    amount: transaction.amount!,
    type: 'one-time',
    note: transaction.notes?.trim() ?? '',
    paymentModeId: transaction.paymentModeId,
    ownerUid: transaction.ownerUid,
    memberEmail,
    source: 'sms',
    sourceSmsTransactionId: transaction.id,
  };
}

export function searchableSmsText(transaction: SmsTransaction): string {
  return [
    transaction.merchant,
    transaction.description,
    transaction.notes,
    transaction.accountLastFour,
    transaction.referenceNumber,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
