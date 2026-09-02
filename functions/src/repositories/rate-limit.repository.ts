import { Timestamp, getFirestore } from 'firebase-admin/firestore';

import { ApiError } from '../utils/api-error.js';
import { sha256 } from '../utils/crypto.js';

export async function enforceRateLimit(
  key: string,
  maximum: number,
  windowMs: number,
): Promise<void> {
  const database = getFirestore();
  const ref = database.doc(`budgetApiRateLimits/${sha256(key)}`);
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Date.now();
    const data = snapshot.data();
    const windowStartedAt = data?.['windowStartedAt'];
    const isCurrent =
      windowStartedAt instanceof Timestamp && now - windowStartedAt.toMillis() < windowMs;
    const count = isCurrent && typeof data?.['count'] === 'number' ? data['count'] : 0;
    if (count >= maximum) throw new ApiError(429, 'RATE_LIMITED');
    transaction.set(ref, {
      count: count + 1,
      windowStartedAt: isCurrent ? windowStartedAt : Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + windowMs * 2),
    });
  });
}
