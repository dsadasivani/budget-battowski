import type {
  ParsedSmsTransaction,
  RawSmsInput,
  SmsFinancialTransactionType,
} from '../domain/sms.types.js';

export function classifyTransaction(message: string): SmsFinancialTransactionType {
  if (/\b(refund(?:ed)?|revers(?:ed|al))\b/i.test(message)) return 'refund';
  if (/\b(withdrawn|cash withdrawal|atm)\b/i.test(message)) return 'withdrawal';
  if (/\b(transferred|transfer)\b/i.test(message)) return 'transfer';
  if (/\b(credited|credit)\b/i.test(message)) return 'credit';
  if (/\b(debited|spent|paid|purchase|purchased)\b/i.test(message)) return 'debit';
  return 'unknown';
}

export function amountFrom(message: string): number | undefined {
  const match = /(?:₹|\bINR\b|\bRs\.?)(?:\s*:?\s*)([\d,]+(?:\.\d{1,2})?)/i.exec(message);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function lastFourFrom(message: string): string | undefined {
  return /(?:a\/?c|acct|account|card)(?:\s*(?:no\.?|ending|xx|x)*)?[\s:*xX-]*(\d{4})\b/i.exec(
    message,
  )?.[1];
}

export function referenceFrom(message: string): string | undefined {
  return /(?:ref(?:erence)?(?:\s*(?:no|number|id))?|txn(?:\s*(?:no|id))?|utr)\s*[:#-]?\s*([A-Z0-9-]{6,30})/i.exec(
    message,
  )?.[1];
}

export function merchantFrom(message: string): string | undefined {
  const match =
    /(?:\bto\b|\bat\b|\bfor\b)\s+([A-Z0-9][A-Z0-9 .&@_-]{1,48}?)(?=\s+(?:on|using|via|ref|txn|avl|available|from)\b|[.;]|$)/i.exec(
      message,
    );
  const value = match?.[1].trim().replace(/\s+/g, ' ');
  return value && !/^(your|a\/?c|account|card)$/i.test(value) ? value : undefined;
}

export function paymentHintFrom(message: string): ParsedSmsTransaction['paymentHint'] | undefined {
  if (/\bUPI\b/i.test(message)) return 'upi';
  if (/\bATM\b/i.test(message)) return 'atm';
  if (/\bPOS\b|\bdebit card\b/i.test(message)) return 'debit-card';
  if (/\bcredit card\b/i.test(message)) return 'credit-card';
  if (/\b(?:IMPS|NEFT|RTGS|net ?banking)\b/i.test(message)) return 'internet-banking';
  return undefined;
}

export function parseCommon(
  input: RawSmsInput,
  parserId: string,
  bankName?: string,
): ParsedSmsTransaction | null {
  const transactionType = classifyTransaction(input.message);
  const amount = amountFrom(input.message);
  if (!amount || transactionType === 'unknown') return null;
  const accountLastFour = lastFourFrom(input.message);
  const merchant = merchantFrom(input.message);
  const referenceNumber = referenceFrom(input.message);
  const paymentHint = paymentHintFrom(input.message);
  const signals = [
    amount,
    accountLastFour,
    merchant,
    referenceNumber,
    paymentHint,
    bankName,
  ].filter(Boolean).length;
  return {
    transactionType,
    amount,
    currency: 'INR',
    transactionDate: input.receivedAt,
    merchant,
    bankName,
    accountLastFour,
    referenceNumber,
    paymentHint,
    description: merchant ?? `${bankName ?? 'Bank'} ${transactionType}`,
    parserId,
    parserVersion: '1.0.0',
    confidence: Math.min(0.98, 0.5 + signals * 0.08),
  };
}
