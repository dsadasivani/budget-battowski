import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import type { AuthenticatedDevice, ParsedSmsTransaction } from '../domain/sms.types.js';
import type { SmsWebhookPayload } from '../utils/validation.js';
import { sha256 } from '../utils/crypto.js';
import {
  normalizedFingerprint,
  suggestedCategoryName,
} from '../ingestion/transaction-classifier.js';

interface WorkspaceMatches {
  paymentAccountId?: string;
  paymentModeId?: string;
  suggestedCategoryId?: string;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

async function workspaceMatches(
  device: AuthenticatedDevice,
  parsed: ParsedSmsTransaction,
): Promise<WorkspaceMatches> {
  const database = getFirestore();
  const root = database.doc(`budgetWorkspaces/${device.workspaceId}`);
  const [accounts, modes, categories] = await Promise.all([
    root.collection('paymentAccounts').get(),
    root.collection('paymentModes').get(),
    root.collection('categories').get(),
  ]);
  const matchingAccounts = accounts.docs.filter((document) => {
    const value = document.data();
    return (
      value['ownerUid'] === device.ownerUid &&
      !value['archivedDate'] &&
      normalize(value['bankName']) === normalize(parsed.bankName) &&
      String(value['lastFour'] ?? '') === parsed.accountLastFour
    );
  });
  const paymentAccountId = matchingAccounts.length === 1 ? matchingAccounts[0].id : undefined;
  const wantedModeType = parsed.paymentHint === 'atm' ? 'debit-card' : parsed.paymentHint;
  const matchingModes = paymentAccountId
    ? modes.docs.filter((document) => {
        const value = document.data();
        return (
          value['ownerUid'] === device.ownerUid &&
          !value['archivedDate'] &&
          value['paymentAccountId'] === paymentAccountId &&
          (!wantedModeType || value['type'] === wantedModeType)
        );
      })
    : [];
  const categoryName = suggestedCategoryName(parsed);
  const matchingCategories = categoryName
    ? categories.docs.filter(
        (document) =>
          normalize(document.data()['name']) === normalize(categoryName) &&
          document.data()['type'] === 'Expenses' &&
          !document.data()['archivedDate'],
      )
    : [];
  return {
    paymentAccountId,
    paymentModeId: matchingModes.length === 1 ? matchingModes[0].id : undefined,
    suggestedCategoryId: matchingCategories.length === 1 ? matchingCategories[0].id : undefined,
  };
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export async function saveSmsTransaction(
  device: AuthenticatedDevice,
  payload: SmsWebhookPayload,
  parsed: ParsedSmsTransaction,
): Promise<{ duplicate: boolean; transactionId?: string }> {
  const database = getFirestore();
  const eventKey = sha256(`${device.id}|${payload.eventId}`);
  const eventRef = database.doc(`budgetSmsEventReceipts/${eventKey}`);
  if ((await eventRef.get()).exists) return { duplicate: true };

  const matches = await workspaceMatches(device, parsed);
  const fingerprint = sha256(
    normalizedFingerprint({
      ownerUid: device.ownerUid,
      workspaceId: device.workspaceId,
      parsed,
      receivedAt: payload.receivedAt,
    }),
  );
  const fingerprintRef = database.doc(
    `budgetWorkspaces/${device.workspaceId}/smsTransactionFingerprints/${fingerprint}`,
  );
  const transactionRef = database
    .collection(`budgetWorkspaces/${device.workspaceId}/smsTransactions`)
    .doc();
  const now = new Date().toISOString();

  return database.runTransaction(async (transaction) => {
    const [eventSnapshot, fingerprintSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(fingerprintRef),
    ]);
    if (eventSnapshot.exists || fingerprintSnapshot.exists) return { duplicate: true };
    transaction.create(
      transactionRef,
      withoutUndefined({
        ownerUid: device.ownerUid,
        source: 'sms',
        deviceId: device.id,
        sourceEventId: payload.eventId,
        sender: payload.sender,
        rawMessage: payload.message,
        receivedAt: payload.receivedAt,
        transactionDate: parsed.transactionDate,
        amount: parsed.amount,
        currency: parsed.currency,
        transactionType: parsed.transactionType,
        merchant: parsed.merchant,
        description: parsed.description,
        bankName: parsed.bankName,
        accountLastFour: parsed.accountLastFour,
        referenceNumber: parsed.referenceNumber,
        paymentAccountId: matches.paymentAccountId,
        paymentModeId: matches.paymentModeId,
        suggestedCategoryId: matches.suggestedCategoryId,
        decision: 'pending',
        status: 'pending',
        parserId: parsed.parserId,
        parserVersion: parsed.parserVersion,
        confidence: parsed.confidence,
        duplicateFingerprint: fingerprint,
        createdDate: now,
        updatedDate: now,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    transaction.create(eventRef, {
      deviceId: device.id,
      eventId: payload.eventId,
      workspaceId: device.workspaceId,
      smsTransactionId: transactionRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(fingerprintRef, {
      ownerUid: device.ownerUid,
      smsTransactionId: transactionRef.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(database.doc(`budgetIngestionDevices/${device.id}`), {
      connectorVersion: payload.connectorVersion ?? device.connectorVersion,
      lastSeenAt: FieldValue.serverTimestamp(),
      lastSmsReceivedAt: FieldValue.serverTimestamp(),
      lastSuccessfulWebhookAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { duplicate: false, transactionId: transactionRef.id };
  });
}

export async function recordIgnoredSmsEvent(
  device: AuthenticatedDevice,
  payload: SmsWebhookPayload,
  reason: 'not-financial' | 'not-parsed',
): Promise<void> {
  const database = getFirestore();
  const eventKey = sha256(`${device.id}|${payload.eventId}`);
  await database.doc(`budgetSmsEventReceipts/${eventKey}`).set(
    {
      deviceId: device.id,
      eventId: payload.eventId,
      workspaceId: device.workspaceId,
      outcome: reason,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: false },
  );
  await database.doc(`budgetIngestionDevices/${device.id}`).update({
    connectorVersion: payload.connectorVersion ?? device.connectorVersion,
    lastSeenAt: FieldValue.serverTimestamp(),
    lastSmsReceivedAt: FieldValue.serverTimestamp(),
    lastSuccessfulWebhookAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
