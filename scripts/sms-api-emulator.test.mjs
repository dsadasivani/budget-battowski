import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, test } from 'node:test';

import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = 'budget-battowski';
const apiBase = `http://127.0.0.1:5001/${projectId}/asia-south1/api`;
const authBase = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const workspaceId = 'workspace-sms-api-test';
const ownerEmail = 'sms-owner@example.com';
const password = 'SmsApiTest!123';
const secret = 'active-secret-abcdefghijklmnopqrstuvwxyz-1234567890';
const pausedSecret = 'paused-secret-abcdefghijklmnopqrstuvwxyz-1234567890';
const revokedSecret = 'revoked-secret-abcdefghijklmnopqrstuvwxyz-12345678';
const activeDeviceId = 'dev_ACT1VE88';
const activeToken = `bb_dev_ACT1VE88.${secret}`;

let database;
let ownerUid;
let ownerToken;
let outsiderToken;

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function createAuthUser(email) {
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function api(path, { method = 'POST', token, body } = {}) {
  return fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function deviceRecord(tokenSecret, status) {
  return {
    ownerUid,
    workspaceId,
    type: 'macrodroid-sms',
    deviceName: `${status} test phone`,
    tokenHash: hash(tokenSecret),
    status,
    connectorVersion: '1.0',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}

before(async () => {
  if (!getApps().length) initializeApp({ projectId });
  database = getFirestore();
  const owner = await createAuthUser(ownerEmail);
  const outsider = await createAuthUser('sms-outsider@example.com');
  ownerUid = owner.localId;
  ownerToken = owner.idToken;
  outsiderToken = outsider.idToken;
  await database.doc(`budgetWorkspaces/${workspaceId}`).set({
    name: 'SMS API workspace',
    ownerUid,
    memberUids: [ownerUid],
    members: [{ uid: ownerUid, email: ownerEmail, role: 'owner' }],
  });
  await Promise.all([
    database.doc(`budgetIngestionDevices/${activeDeviceId}`).set(deviceRecord(secret, 'active')),
    database.doc('budgetIngestionDevices/dev_PAUSED88').set(deviceRecord(pausedSecret, 'paused')),
    database.doc('budgetIngestionDevices/dev_REVOKED8').set(deviceRecord(revokedSecret, 'revoked')),
    database
      .doc(`budgetWorkspaces/${workspaceId}/paymentAccounts/account-hdfc`)
      .set({ ownerUid, name: 'HDFC Savings', bankName: 'HDFC', lastFour: '1234' }),
    database.doc(`budgetWorkspaces/${workspaceId}/paymentModes/mode-hdfc-upi`).set({
      ownerUid,
      name: 'HDFC UPI',
      type: 'upi',
      paymentAccountId: 'account-hdfc',
    }),
    database.doc(`budgetWorkspaces/${workspaceId}/categories/category-food`).set({
      name: 'Food & Dining',
      type: 'Expenses',
      monthlyBudget: 0,
      color: '#f97316',
    }),
  ]);
});

test('authenticated users can create pairing sessions only for their workspace', async () => {
  const allowed = await api('/v1/integrations/sms/pairing-sessions', {
    token: ownerToken,
    body: { workspaceId },
  });
  const allowedBody = await allowed.json();
  assert.equal(allowed.status, 201, JSON.stringify(allowedBody));
  assert.match(allowedBody.pairingCode, /^\d{6}$/);
  assert.ok(Date.parse(allowedBody.expiresAt) > Date.now());

  const forbidden = await api('/v1/integrations/sms/pairing-sessions', {
    token: outsiderToken,
    body: { workspaceId },
  });
  assert.equal(forbidden.status, 403);
});

test('pairing is valid once and rejects consumed, expired, and incorrect codes', async () => {
  const validCode = '481729';
  const validSession = database.collection('budgetPairingSessions').doc();
  await validSession.set({
    codeHash: hash(validCode),
    ownerUid,
    workspaceId,
    status: 'pending',
    attempts: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
  });
  const paired = await api('/v1/integrations/sms/pair', {
    body: { pairingCode: validCode, deviceName: 'Galaxy Test', connectorVersion: '1.0' },
  });
  const pairedBody = await paired.json();
  assert.equal(paired.status, 200, JSON.stringify(pairedBody));
  assert.match(pairedBody.deviceId, /^dev_[A-Za-z0-9_-]{8}$/);
  assert.match(pairedBody.deviceToken, /^bb_dev_/);
  assert.equal((await validSession.get()).data().status, 'consumed');
  assert.equal(
    (await database.doc(`budgetIngestionDevices/${pairedBody.deviceId}`).get()).exists,
    true,
  );

  const consumed = await api('/v1/integrations/sms/pair', {
    body: { pairingCode: validCode, deviceName: 'Replay', connectorVersion: '1.0' },
  });
  assert.equal(consumed.status, 409);

  const expiredCode = '731905';
  const expiredSession = database.collection('budgetPairingSessions').doc();
  await expiredSession.set({
    codeHash: hash(expiredCode),
    ownerUid,
    workspaceId,
    status: 'pending',
    createdAt: Timestamp.fromMillis(Date.now() - 120_000),
    updatedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() - 60_000),
  });
  const expired = await api('/v1/integrations/sms/pair', {
    body: { pairingCode: expiredCode, deviceName: 'Expired', connectorVersion: '1.0' },
  });
  assert.equal(expired.status, 410);
  assert.equal((await expiredSession.get()).data().status, 'expired');

  const incorrect = await api('/v1/integrations/sms/pair', {
    body: { pairingCode: '000001', deviceName: 'Incorrect', connectorVersion: '1.0' },
  });
  assert.equal(incorrect.status, 400);
});

test('device authentication rejects malformed, unknown, wrong, paused, and revoked tokens', async () => {
  const payload = {
    eventId: 'auth-event',
    sender: 'HDFCBK',
    message: 'Rs.450 debited from HDFC A/C XX1234 via UPI to ZOMATO.',
    receivedAt: '2026-09-01T07:42:00+05:30',
    connectorVersion: '1.0',
  };
  for (const token of [
    'not-a-device-token',
    'bb_dev_UNKNOWN8.unknown-secret-abcdefghijklmnopqrstuvwxyz-1234567890',
    'bb_dev_ACT1VE88.wrong-secret-abcdefghijklmnopqrstuvwxyz-1234567890',
  ]) {
    assert.equal((await api('/v1/ingestion/sms', { token, body: payload })).status, 401);
  }
  assert.equal(
    (
      await api('/v1/ingestion/sms', {
        token: `bb_dev_PAUSED88.${pausedSecret}`,
        body: payload,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api('/v1/ingestion/sms', {
        token: `bb_dev_REVOKED8.${revokedSecret}`,
        body: payload,
      })
    ).status,
    403,
  );
});

test('ingestion is idempotent and performs owner-scoped account, payment, and category matching', async () => {
  const payload = {
    eventId: 'stable-event-1',
    sender: 'VM-HDFCBK',
    message: 'Rs.450 debited from HDFC A/C XX1234 via UPI to ZOMATO. Ref ABC123456.',
    receivedAt: '2026-09-01T07:42:00+05:30',
    connectorVersion: '1.0',
  };
  const first = await api('/v1/ingestion/sms', { token: activeToken, body: payload });
  const firstBody = await first.json();
  assert.equal(first.status, 202, JSON.stringify(firstBody));
  assert.equal(firstBody.status, 'received');
  const replay = await api('/v1/ingestion/sms', { token: activeToken, body: payload });
  const replayBody = await replay.json();
  assert.equal(replay.status, 202, JSON.stringify(replayBody));
  assert.equal(replayBody.status, 'duplicate');

  const snapshot = await database
    .collection(`budgetWorkspaces/${workspaceId}/smsTransactions`)
    .get();
  assert.equal(snapshot.size, 1);
  assert.deepEqual(
    (({
      amount,
      accountLastFour,
      paymentAccountId,
      paymentModeId,
      suggestedCategoryId,
      ownerUid: uid,
    }) => ({
      amount,
      accountLastFour,
      paymentAccountId,
      paymentModeId,
      suggestedCategoryId,
      ownerUid: uid,
    }))(snapshot.docs[0].data()),
    {
      amount: 450,
      accountLastFour: '1234',
      paymentAccountId: 'account-hdfc',
      paymentModeId: 'mode-hdfc-upi',
      suggestedCategoryId: 'category-food',
      ownerUid,
    },
  );

  const rejectedIdentity = await api('/v1/ingestion/sms', {
    token: activeToken,
    body: { ...payload, eventId: 'identity-event', workspaceId: 'attacker-workspace' },
  });
  assert.equal(rejectedIdentity.status, 400);
});

test('heartbeat accepts the permanent token without exposing it and updates device health', async () => {
  const heartbeat = await api('/v1/integrations/sms/heartbeat', { token: activeToken, body: {} });
  const heartbeatBody = await heartbeat.json();
  assert.equal(heartbeat.status, 200, JSON.stringify(heartbeatBody));
  assert.deepEqual(heartbeatBody, { connected: true, deviceId: activeDeviceId });
  const device = (await database.doc(`budgetIngestionDevices/${activeDeviceId}`).get()).data();
  assert.ok(device.lastSeenAt instanceof Timestamp);
  assert.equal('deviceToken' in device, false);
});

test('pairing attempts are rate limited', async () => {
  const statuses = [];
  for (let index = 0; index < 12; index += 1) {
    const response = await api('/v1/integrations/sms/pair', {
      body: {
        pairingCode: String(900000 + index),
        deviceName: 'Rate limit test',
        connectorVersion: '1.0',
      },
    });
    statuses.push(response.status);
  }
  assert.ok(statuses.includes(429));
});
