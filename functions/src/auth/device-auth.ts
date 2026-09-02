import { getFirestore } from 'firebase-admin/firestore';

import type { AuthenticatedDevice, IngestionDevice } from '../domain/sms.types.js';
import { ApiError } from '../utils/api-error.js';
import { constantTimeHexEqual, parseDeviceCredential, sha256 } from '../utils/crypto.js';

export async function authenticateDevice(
  authorization: string | undefined,
  allowedStatuses: readonly AuthenticatedDevice['status'][] = ['active'],
): Promise<AuthenticatedDevice> {
  const credential = parseDeviceCredential(authorization);
  if (!credential) throw new ApiError(401, 'DEVICE_TOKEN_INVALID');
  const database = getFirestore();
  const snapshot = await database.doc(`budgetIngestionDevices/${credential.deviceId}`).get();
  if (!snapshot.exists) throw new ApiError(401, 'DEVICE_TOKEN_INVALID');
  const device = snapshot.data() as Omit<IngestionDevice, 'id'>;
  if (!constantTimeHexEqual(device.tokenHash, sha256(credential.secret))) {
    throw new ApiError(401, 'DEVICE_TOKEN_INVALID');
  }
  if (!allowedStatuses.includes(device.status)) {
    throw new ApiError(403, `DEVICE_${device.status.toUpperCase()}`);
  }
  const workspace = await database.doc(`budgetWorkspaces/${device.workspaceId}`).get();
  const memberUids = workspace.data()?.['memberUids'];
  if (!workspace.exists || !Array.isArray(memberUids) || !memberUids.includes(device.ownerUid)) {
    throw new ApiError(403, 'DEVICE_WORKSPACE_FORBIDDEN');
  }
  return {
    id: snapshot.id,
    ownerUid: device.ownerUid,
    workspaceId: device.workspaceId,
    status: device.status,
    connectorVersion: device.connectorVersion,
  };
}
