import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

import type { DeviceStatus, IngestionDevice } from '../domain/sms.types.js';
import { ApiError } from '../utils/api-error.js';

export interface SanitizedDevice {
  id: string;
  workspaceId: string;
  type: 'macrodroid-sms';
  deviceName: string;
  status: DeviceStatus;
  createdAt?: string;
  updatedAt?: string;
  lastSeenAt?: string;
  lastSmsReceivedAt?: string;
  lastSuccessfulWebhookAt?: string;
  connectorVersion?: string;
}

function iso(value: unknown): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

export async function listDevices(
  ownerUid: string,
  workspaceId: string,
): Promise<SanitizedDevice[]> {
  const snapshot = await getFirestore()
    .collection('budgetIngestionDevices')
    .where('ownerUid', '==', ownerUid)
    .where('workspaceId', '==', workspaceId)
    .get();
  return snapshot.docs
    .map((document) => {
      const value = document.data() as Omit<IngestionDevice, 'id'>;
      return {
        id: document.id,
        workspaceId: value.workspaceId,
        type: value.type,
        deviceName: value.deviceName,
        status: value.status,
        createdAt: iso(value.createdAt),
        updatedAt: iso(value.updatedAt),
        lastSeenAt: iso(value.lastSeenAt),
        lastSmsReceivedAt: iso(value.lastSmsReceivedAt),
        lastSuccessfulWebhookAt: iso(value.lastSuccessfulWebhookAt),
        connectorVersion: value.connectorVersion,
      };
    })
    .sort((left, right) => left.deviceName.localeCompare(right.deviceName));
}

export async function updateDevice(
  ownerUid: string,
  workspaceId: string,
  deviceId: string,
  update: { deviceName?: string; status?: Exclude<DeviceStatus, 'revoked'> | 'revoked' },
): Promise<void> {
  const ref = getFirestore().doc(`budgetIngestionDevices/${deviceId}`);
  const snapshot = await ref.get();
  const value = snapshot.data();
  if (
    !snapshot.exists ||
    value?.['ownerUid'] !== ownerUid ||
    value?.['workspaceId'] !== workspaceId
  ) {
    throw new ApiError(404, 'DEVICE_NOT_FOUND');
  }
  if (value?.['status'] === 'revoked') throw new ApiError(409, 'DEVICE_REVOKED');
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (update.deviceName) patch['deviceName'] = update.deviceName;
  if (update.status) {
    patch['status'] = update.status;
    if (update.status === 'revoked') patch['revokedAt'] = FieldValue.serverTimestamp();
  }
  await ref.update(patch);
}

export async function touchDevice(
  deviceId: string,
  fields: { sms?: boolean; successfulWebhook?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {
    lastSeenAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (fields.sms) patch['lastSmsReceivedAt'] = FieldValue.serverTimestamp();
  if (fields.successfulWebhook) patch['lastSuccessfulWebhookAt'] = FieldValue.serverTimestamp();
  await getFirestore().doc(`budgetIngestionDevices/${deviceId}`).update(patch);
}
