import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'budget-battowski-concurrency';
const workspaceId = 'shared-workspace';
const owner = { uid: 'owner-uid', email: 'owner@example.com' };
const member = { uid: 'member-uid', email: 'member@example.com' };
let environment;

function database(identity) {
  return environment.authenticatedContext(identity.uid, { email: identity.email }).firestore();
}

function record(db, collection, id) {
  return doc(db, 'budgetWorkspaces', workspaceId, collection, id);
}

async function versionedUpdate(db, collection, id, expectedVersion, changes) {
  await runTransaction(db, async (transaction) => {
    const reference = record(db, collection, id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data().version ?? 0) !== expectedVersion) {
      const error = new Error('This record was changed by another workspace member.');
      error.name = 'ConcurrentModificationError';
      throw error;
    }
    transaction.update(reference, { ...changes, version: expectedVersion + 1 });
  });
}

async function materializeOnce(db, id, data) {
  await runTransaction(db, async (transaction) => {
    const reference = record(db, 'expenses', id);
    if ((await transaction.get(reference)).exists()) {
      const error = new Error('Occurrence was already reviewed.');
      error.name = 'ConcurrentModificationError';
      throw error;
    }
    transaction.set(reference, { ...data, version: 1 });
  });
}

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'budgetWorkspaces', workspaceId), {
      name: 'Shared', ownerUid: owner.uid,
      memberUids: [owner.uid, member.uid],
      members: [{ ...owner, role: 'owner' }, { ...member, role: 'editor' }],
    });
    await setDoc(record(db, 'expenses', 'unrelated'), {
      name: 'Unrelated', categoryId: 'food', amount: 100, month: '2026-08', type: 'one-time',
      note: '', ownerUid: member.uid, memberEmail: member.email, version: 1,
    });
    await setDoc(record(db, 'expenses', 'bulk-target'), {
      name: 'Bulk target', categoryId: 'food', amount: 200, month: '2026-08', type: 'one-time',
      note: '', ownerUid: owner.uid, memberEmail: owner.email, version: 1,
    });
    await setDoc(record(db, 'templates', 'rent'), {
      name: 'Rent', categoryId: 'housing', amount: 1000, type: 'recurring', frequency: 'monthly',
      startDate: '2026-01-01', ownerUid: owner.uid, memberEmail: owner.email, version: 1,
    });
  });
});

after(async () => environment.cleanup());

test('monthly review mutations preserve another client unrelated edit', async () => {
  const ownerDb = database(owner);
  const memberDb = database(member);
  await versionedUpdate(memberDb, 'expenses', 'unrelated', 1, { amount: 150 });
  await materializeOnce(ownerDb, 'review:expense:rent:2026-08', {
    name: 'Rent', categoryId: 'housing', amount: 1000, month: '2026-08', date: '2026-08-01',
    type: 'recurring', note: 'Approved', templateId: 'rent', ownerUid: owner.uid, memberEmail: owner.email,
  });
  assert.equal((await getDoc(record(ownerDb, 'expenses', 'unrelated'))).data().amount, 150);
});

test('bulk mutation preserves a record outside the user intent', async () => {
  const ownerDb = database(owner);
  const memberDb = database(member);
  await versionedUpdate(memberDb, 'expenses', 'unrelated', 1, { amount: 175 });
  await versionedUpdate(ownerDb, 'expenses', 'bulk-target', 1, { amount: 250 });
  assert.equal((await getDoc(record(ownerDb, 'expenses', 'unrelated'))).data().amount, 175);
});

test('same-record stale update returns a conflict instead of silently overwriting', async () => {
  const ownerDb = database(owner);
  const memberDb = database(member);
  await versionedUpdate(memberDb, 'expenses', 'bulk-target', 1, { amount: 300 });
  await assert.rejects(
    versionedUpdate(ownerDb, 'expenses', 'bulk-target', 1, { amount: 250 }),
    { name: 'ConcurrentModificationError' },
  );
  assert.equal((await getDoc(record(ownerDb, 'expenses', 'bulk-target'))).data().amount, 300);
});

test('member edits preserve the original UID and email ownership', async () => {
  const memberDb = database(member);
  await versionedUpdate(memberDb, 'expenses', 'bulk-target', 1, { amount: 325 });
  const value = (await getDoc(record(memberDb, 'expenses', 'bulk-target'))).data();
  assert.equal(value.ownerUid, owner.uid);
  assert.equal(value.memberEmail, owner.email);
});

test('overlapping monthly reviews create one deterministic occurrence', async () => {
  const data = {
    name: 'Rent', categoryId: 'housing', amount: 1000, month: '2026-08', date: '2026-08-01',
    type: 'recurring', note: 'Approved', templateId: 'rent', ownerUid: owner.uid, memberEmail: owner.email,
  };
  const outcomes = await Promise.allSettled([
    materializeOnce(database(owner), 'review:expense:rent:2026-08', data),
    materializeOnce(database(owner), 'review:expense:rent:2026-08', data),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
});

test('a recurring-source edit and review use the effective current source once', async () => {
  const ownerDb = database(owner);
  await versionedUpdate(ownerDb, 'templates', 'rent', 1, {
    amount: 1200,
    effectiveStartDate: '2026-08-01',
    auditTrail: [{ amount: 1000, effectiveStartDate: '2026-01-01', effectiveEndDate: '2026-07-31' }],
  });
  const source = (await getDoc(record(ownerDb, 'templates', 'rent'))).data();
  await materializeOnce(ownerDb, 'review:expense:rent:2026-08', {
    name: source.name, categoryId: source.categoryId, amount: source.amount,
    month: '2026-08', date: '2026-08-01', type: 'recurring', note: 'Approved', templateId: 'rent',
    ownerUid: source.ownerUid, memberEmail: source.memberEmail,
  });
  assert.equal((await getDoc(record(ownerDb, 'expenses', 'review:expense:rent:2026-08'))).data().amount, 1200);
});
