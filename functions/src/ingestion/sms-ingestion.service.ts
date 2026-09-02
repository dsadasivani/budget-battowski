import type { AuthenticatedDevice } from '../domain/sms.types.js';
import { parseSms } from '../parsers/parser-registry.js';
import {
  recordIgnoredSmsEvent,
  saveSmsTransaction,
} from '../repositories/sms-transaction.repository.js';
import type { SmsWebhookPayload } from '../utils/validation.js';
import { isLikelyFinancialSms } from '../utils/validation.js';

export interface IngestionResult {
  accepted: boolean;
  eventId: string;
  status: 'received' | 'duplicate' | 'ignored';
  parserId?: string;
}

export async function ingestSms(
  device: AuthenticatedDevice,
  payload: SmsWebhookPayload,
): Promise<IngestionResult> {
  if (!isLikelyFinancialSms(payload)) {
    await recordIgnoredSmsEvent(device, payload, 'not-financial');
    return { accepted: false, eventId: payload.eventId, status: 'ignored' };
  }
  const parsed = parseSms(payload);
  if (!parsed) {
    await recordIgnoredSmsEvent(device, payload, 'not-parsed');
    return { accepted: false, eventId: payload.eventId, status: 'ignored' };
  }
  const saved = await saveSmsTransaction(device, payload, parsed);
  return {
    accepted: true,
    eventId: payload.eventId,
    status: saved.duplicate ? 'duplicate' : 'received',
    parserId: parsed.parserId,
  };
}
