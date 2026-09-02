import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function randomPairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function createDeviceCredential(): {
  deviceId: string;
  deviceToken: string;
  tokenHash: string;
} {
  const publicId = randomBytes(6).toString('base64url');
  const deviceId = `dev_${publicId}`;
  const secret = randomBytes(32).toString('base64url');
  return {
    deviceId,
    deviceToken: `bb_dev_${publicId}.${secret}`,
    tokenHash: sha256(secret),
  };
}

export function parseDeviceCredential(value: string | undefined): {
  deviceId: string;
  secret: string;
} | null {
  const token = value?.startsWith('Bearer ') ? value.slice(7).trim() : '';
  const match = /^bb_dev_([A-Za-z0-9_-]{8})\.([A-Za-z0-9_-]{40,})$/.exec(token);
  return match ? { deviceId: `dev_${match[1]}`, secret: match[2] } : null;
}
