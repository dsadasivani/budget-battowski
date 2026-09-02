import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { ApiError } from '../utils/api-error.js';

export async function authenticatedUser(authorization: string | undefined): Promise<string> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'AUTH_REQUIRED');
  try {
    return (await getAuth().verifyIdToken(token)).uid;
  } catch {
    throw new ApiError(401, 'AUTH_INVALID');
  }
}

export async function authorizedWorkspace(uid: string, value: unknown): Promise<string> {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new ApiError(400, 'WORKSPACE_REQUIRED');
  }
  const workspaceId = value.trim();
  const snapshot = await getFirestore().doc(`budgetWorkspaces/${workspaceId}`).get();
  const memberUids = snapshot.data()?.['memberUids'];
  if (!snapshot.exists || !Array.isArray(memberUids) || !memberUids.includes(uid)) {
    throw new ApiError(403, 'WORKSPACE_FORBIDDEN');
  }
  return workspaceId;
}
