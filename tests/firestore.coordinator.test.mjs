import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { build } from 'esbuild';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'budget-battowski-coordinator';
const workspaceId = 'coordinator-workspace';
const owner = { uid: 'coordinator-owner', email: 'coordinator@example.com' };
let environment;
let coordinatorModule;
let bundleDirectory;

function database() {
  return environment.authenticatedContext(owner.uid, { email: owner.email }).firestore();
}

function record(db, collection, id) {
  return doc(db, 'budgetWorkspaces', workspaceId, collection, id);
}

function category(id, name = id) {
  return { id, name, monthlyBudget: 0, color: '#123456', type: 'Expenses' };
}

function expense(id, amount, version = undefined) {
  return {
    id,
    name: id,
    categoryId: 'category-food',
    amount,
    month: '2026-08',
    type: 'one-time',
    note: '',
    ownerUid: owner.uid,
    memberEmail: owner.email,
    ...(version === undefined ? {} : { version }),
  };
}

function mutations(collection, { creates = [], updates = [], deletes = [] }) {
  return { [collection]: { creates, updates, deletes } };
}

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });

  bundleDirectory = await mkdtemp(join(resolve('.firebase'), 'coordinator-test-'));
  const bundlePath = join(bundleDirectory, 'firestore-write-coordinator.mjs');
  await build({
    entryPoints: [resolve('src/app/data/firestore-write-coordinator.ts')],
    outfile: bundlePath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    sourcemap: false,
  });
  coordinatorModule = await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'budgetWorkspaces', workspaceId), {
      name: 'Coordinator',
      ownerUid: owner.uid,
      ownerEmail: owner.email,
      memberUids: [owner.uid],
      memberEmails: [owner.email],
      members: [{ ...owner, role: 'owner' }],
    });
  });
});

after(async () => {
  await environment.cleanup();
  if (bundleDirectory) {
    await rm(bundleDirectory, { recursive: true, force: true });
  }
});

test('actual coordinator creates records and rejects a deterministic create conflict', async () => {
  const db = database();
  const coordinator = new coordinatorModule.FirestoreWriteCoordinator(db, workspaceId);
  await coordinator.execute(mutations('expenses', { creates: [expense('created', 100)] }));
  assert.equal((await getDoc(record(db, 'expenses', 'created'))).data().version, 1);

  await assert.rejects(
    coordinator.execute(mutations('expenses', { creates: [expense('created', 100)] })),
    {
      name: 'ConcurrentModificationError',
      collection: 'expenses',
      recordId: 'created',
      context: {
        workspaceId,
        operation: 'create',
        group: 'mutation-set:1',
        chunk: 1,
      },
    },
  );
});

test('actual coordinator increments versions, rejects stale writes, and accepts an update retry', async () => {
  const db = database();
  await environment.withSecurityRulesDisabled(async (context) => {
    const { id: _id, ...data } = expense('versioned', 100, 1);
    await setDoc(record(context.firestore(), 'expenses', 'versioned'), data);
  });
  const coordinator = new coordinatorModule.FirestoreWriteCoordinator(db, workspaceId);
  const update = { record: expense('versioned', 200, 1), expectedVersion: 1 };
  await coordinator.execute(mutations('expenses', { updates: [update] }));
  assert.deepEqual((await getDoc(record(db, 'expenses', 'versioned'))).data().version, 2);

  await coordinator.execute(mutations('expenses', { updates: [update] }));
  assert.equal((await getDoc(record(db, 'expenses', 'versioned'))).data().version, 2);
  await assert.rejects(
    coordinator.execute(
      mutations('expenses', {
        updates: [{ record: expense('versioned', 300, 1), expectedVersion: 1 }],
      }),
    ),
    { name: 'ConcurrentModificationError', recordId: 'versioned' },
  );
});

test('actual coordinator handles stale and already-applied deletes safely', async () => {
  const db = database();
  await environment.withSecurityRulesDisabled(async (context) => {
    const { id: _id, ...data } = expense('delete-me', 100, 2);
    await setDoc(record(context.firestore(), 'expenses', 'delete-me'), data);
  });
  const coordinator = new coordinatorModule.FirestoreWriteCoordinator(db, workspaceId);
  await assert.rejects(
    coordinator.execute(
      mutations('expenses', { deletes: [{ id: 'delete-me', expectedVersion: 1 }] }),
    ),
    { name: 'ConcurrentModificationError', recordId: 'delete-me' },
  );
  await coordinator.execute(
    mutations('expenses', { deletes: [{ id: 'delete-me', expectedVersion: 2 }] }),
  );
  await coordinator.execute(
    mutations('expenses', { deletes: [{ id: 'delete-me', expectedVersion: 2 }] }),
  );
  assert.equal((await getDoc(record(db, 'expenses', 'delete-me'))).exists(), false);
});

test('independent writes split after five operations and report a second-group conflict', async () => {
  const db = database();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      record(context.firestore(), 'categories', 'category-5'),
      category('category-5', 'Existing'),
    );
  });
  const coordinator = new coordinatorModule.FirestoreWriteCoordinator(db, workspaceId);
  const creates = Array.from({ length: 6 }, (_, index) => category(`category-${index}`));

  await assert.rejects(coordinator.execute(mutations('categories', { creates })), {
    name: 'ConcurrentModificationError',
    recordId: 'category-5',
    context: {
      workspaceId,
      operation: 'create',
      group: 'mutation-set:2',
      chunk: 2,
    },
  });
  assert.equal((await getDoc(record(db, 'categories', 'category-0'))).exists(), true);
});

test('a maximum-size rule-heavy linked group stays within security-rule access limits', async () => {
  const db = database();
  await environment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(record(adminDb, 'paymentAccounts', 'account'), {
      name: 'Bank 1234',
      bankName: 'Bank',
      lastFour: '1234',
      ownerUid: owner.uid,
      memberEmail: owner.email,
      version: 1,
    });
    await setDoc(record(adminDb, 'paymentModes', 'mode'), {
      type: 'upi',
      name: 'UPI',
      paymentAccountId: 'account',
      ownerUid: owner.uid,
      memberEmail: owner.email,
      version: 1,
    });
  });
  const coordinator = new coordinatorModule.FirestoreWriteCoordinator(db, workspaceId);
  const creates = Array.from({ length: 5 }, (_, index) => ({
    ...expense(`linked-${index}`, 100 + index),
    paymentModeId: 'mode',
  }));
  await coordinator.execute(mutations('expenses', { creates }));
  assert.equal((await getDoc(record(db, 'expenses', 'linked-4'))).data().version, 1);
});
