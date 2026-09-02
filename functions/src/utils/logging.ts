import { logger } from 'firebase-functions';

type SanitizedLog = {
  eventId?: string;
  deviceId?: string;
  workspaceId?: string;
  parserId?: string;
  outcome: string;
  durationMs?: number;
  status?: number;
};

export function logSmsEvent(event: SanitizedLog): void {
  logger.info('sms_automation', event);
}
