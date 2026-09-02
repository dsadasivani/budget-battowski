import type { Timestamp } from 'firebase-admin/firestore';

export type DeviceStatus = 'active' | 'paused' | 'revoked';
export type SmsFinancialTransactionType =
  'debit' | 'credit' | 'refund' | 'transfer' | 'withdrawal' | 'unknown';

export interface IngestionDevice {
  id: string;
  ownerUid: string;
  workspaceId: string;
  type: 'macrodroid-sms';
  deviceName: string;
  tokenHash: string;
  status: DeviceStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSeenAt?: Timestamp;
  lastSmsReceivedAt?: Timestamp;
  lastSuccessfulWebhookAt?: Timestamp;
  revokedAt?: Timestamp;
  connectorVersion?: string;
}

export interface RawSmsInput {
  sender: string;
  message: string;
  receivedAt: string;
}

export interface ParsedSmsTransaction {
  transactionType: SmsFinancialTransactionType;
  amount?: number;
  currency?: string;
  transactionDate?: string;
  merchant?: string;
  description?: string;
  bankName?: string;
  accountLastFour?: string;
  referenceNumber?: string;
  paymentHint?: 'upi' | 'credit-card' | 'debit-card' | 'internet-banking' | 'atm';
  availableBalance?: number;
  parserId: string;
  parserVersion: string;
  confidence: number;
}

export interface SmsTransactionParser {
  readonly id: string;
  readonly version: string;
  supports(input: RawSmsInput): boolean;
  parse(input: RawSmsInput): ParsedSmsTransaction | null;
}

export interface AuthenticatedDevice {
  id: string;
  ownerUid: string;
  workspaceId: string;
  status: DeviceStatus;
  connectorVersion?: string;
}
