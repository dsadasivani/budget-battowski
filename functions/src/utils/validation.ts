import type { RawSmsInput } from '../domain/sms.types.js';

export interface SmsWebhookPayload extends RawSmsInput {
  eventId: string;
  connectorVersion?: string;
}

const FORBIDDEN_IDENTITY_FIELDS = ['userId', 'uid', 'ownerUid', 'workspaceId'] as const;
const SMS_PAYLOAD_FIELDS = new Set([
  'eventId',
  'sender',
  'message',
  'receivedAt',
  'connectorVersion',
]);

export function jsonObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function requiredTrimmedString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

export function validateSmsPayload(value: unknown): SmsWebhookPayload | null {
  const body = jsonObject(value);
  if (
    !body ||
    JSON.stringify(body).length > 4_096 ||
    Object.keys(body).some((field) => !SMS_PAYLOAD_FIELDS.has(field)) ||
    FORBIDDEN_IDENTITY_FIELDS.some((field) => field in body)
  )
    return null;
  const eventId = requiredTrimmedString(body['eventId'], 128);
  const sender = requiredTrimmedString(body['sender'], 80);
  const message = requiredTrimmedString(body['message'], 2_000);
  const receivedAt = requiredTrimmedString(body['receivedAt'], 64);
  if (!eventId || !sender || !message || !receivedAt) return null;
  const timestamp = Date.parse(receivedAt);
  if (!Number.isFinite(timestamp)) return null;
  const connectorVersion =
    body['connectorVersion'] === undefined
      ? undefined
      : (requiredTrimmedString(body['connectorVersion'], 32) ?? undefined);
  if (body['connectorVersion'] !== undefined && !connectorVersion) return null;
  return {
    eventId,
    sender,
    message,
    receivedAt: new Date(timestamp).toISOString(),
    connectorVersion,
  };
}

export function isLikelyFinancialSms(input: RawSmsInput): boolean {
  const text = `${input.sender} ${input.message}`.toLowerCase();
  if (/\b(otp|one[ -]?time password|verification code)\b/.test(text)) return false;
  if (/\b(sale|offer|discount|cashback offer|shop now|unsubscribe)\b/.test(text)) return false;
  return /(?:₹|\binr\b|\brs\.?\s*\d)|\b(debited|credited|spent|paid|purchase|withdrawn|transferred|refund(?:ed)?|revers(?:ed|al)|upi|pos|atm)\b/i.test(
    input.message,
  );
}
