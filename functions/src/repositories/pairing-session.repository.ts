import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

import { ApiError } from '../utils/api-error.js';
import { createDeviceCredential, randomPairingCode, sha256 } from '../utils/crypto.js';

const PAIRING_TTL_MS = 10 * 60_000;

export interface PairingSessionResult {
  pairingCode: string;
  expiresAt: string;
}

export async function createPairingSession(
  ownerUid: string,
  workspaceId: string,
): Promise<PairingSessionResult> {
  const database = getFirestore();
  const sessionRef = database.collection('budgetPairingSessions').doc();
  let pairingCode = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomPairingCode();
    const collision = await database
      .collection('budgetPairingSessions')
      .where('codeHash', '==', sha256(candidate))
      .limit(1)
      .get();
    if (collision.empty) {
      pairingCode = candidate;
      break;
    }
  }
  if (!pairingCode) throw new ApiError(503, 'PAIRING_CODE_UNAVAILABLE');
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + PAIRING_TTL_MS);
  await sessionRef.set({
    ownerUid,
    workspaceId,
    codeHash: sha256(pairingCode),
    status: 'pending',
    attempts: 0,
    createdAt: now,
    expiresAt,
    updatedAt: now,
  });
  return { pairingCode, expiresAt: expiresAt.toDate().toISOString() };
}

export async function consumePairingSession(input: {
  pairingCode: string;
  deviceName: string;
  connectorVersion?: string;
}): Promise<{ deviceId: string; deviceToken: string }> {
  const database = getFirestore();
  const query = database
    .collection('budgetPairingSessions')
    .where('codeHash', '==', sha256(input.pairingCode))
    .limit(10);
  const credential = createDeviceCredential();

  const result = await database.runTransaction(async (transaction) => {
    const matches = await transaction.get(query);
    if (matches.empty) throw new ApiError(400, 'PAIRING_CODE_INVALID');
    const pending = matches.docs.filter((document) => document.data()['status'] === 'pending');
    if (!pending.length) {
      if (matches.docs.some((document) => document.data()['status'] === 'consumed')) {
        throw new ApiError(409, 'PAIRING_CODE_CONSUMED');
      }
      throw new ApiError(410, 'PAIRING_CODE_EXPIRED');
    }
    if (pending.length !== 1) throw new ApiError(400, 'PAIRING_CODE_AMBIGUOUS');
    const session = pending[0];
    const data = session.data();
    const expiresAt = data['expiresAt'];
    if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) {
      transaction.update(session.ref, {
        status: 'expired',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { expired: true as const };
    }
    const workspace = await transaction.get(
      database.doc(`budgetWorkspaces/${String(data['workspaceId'])}`),
    );
    const memberUids = workspace.data()?.['memberUids'];
    if (!workspace.exists || !Array.isArray(memberUids) || !memberUids.includes(data['ownerUid'])) {
      throw new ApiError(403, 'WORKSPACE_FORBIDDEN');
    }
    const deviceRef = database.doc(`budgetIngestionDevices/${credential.deviceId}`);
    transaction.create(deviceRef, {
      ownerUid: data['ownerUid'],
      workspaceId: data['workspaceId'],
      type: 'macrodroid-sms',
      deviceName: input.deviceName,
      tokenHash: credential.tokenHash,
      status: 'active',
      connectorVersion: input.connectorVersion,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
    transaction.update(session.ref, {
      status: 'consumed',
      consumedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      expired: false as const,
      deviceId: credential.deviceId,
      deviceToken: credential.deviceToken,
    };
  });
  if (result.expired) throw new ApiError(410, 'PAIRING_CODE_EXPIRED');
  return { deviceId: result.deviceId, deviceToken: result.deviceToken };
}
