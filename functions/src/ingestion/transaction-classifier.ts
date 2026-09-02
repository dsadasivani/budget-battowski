import type { ParsedSmsTransaction } from '../domain/sms.types.js';

const CATEGORY_RULES: ReadonlyArray<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(zomato|swiggy|starbucks)\b/i, category: 'Food & Dining' },
  { pattern: /\b(uber|ola)\b/i, category: 'Transport' },
  { pattern: /\b(dmart|bigbasket|blinkit)\b/i, category: 'Groceries' },
];

export function suggestedCategoryName(parsed: ParsedSmsTransaction): string | undefined {
  const value = `${parsed.merchant ?? ''} ${parsed.description ?? ''}`;
  return CATEGORY_RULES.find((rule) => rule.pattern.test(value))?.category;
}

export function normalizedFingerprint(input: {
  ownerUid: string;
  workspaceId: string;
  parsed: ParsedSmsTransaction;
  receivedAt: string;
}): string {
  const parsed = input.parsed;
  const hourWindow = (parsed.transactionDate ?? input.receivedAt).slice(0, 13);
  return [
    input.ownerUid,
    input.workspaceId,
    parsed.accountLastFour ?? '',
    parsed.amount?.toFixed(2) ?? '',
    parsed.transactionType,
    parsed.referenceNumber?.toLowerCase() ?? '',
    hourWindow,
    parsed.merchant?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '',
  ].join('|');
}
