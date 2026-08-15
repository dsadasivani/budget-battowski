import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'budget-battowski';
const workspaceId = 'workspace-rules-test';
const ownerEmail = 'owner@example.com';
const memberEmail = 'member@example.com';
const otherEmail = 'other@example.com';

let testEnvironment;

function firestoreHost() {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');
  return { host, port: Number(port) };
}

function workspaceDoc(database) {
  return doc(database, 'budgetWorkspaces', workspaceId);
}

function workspaceRecord(database, collectionName, recordId) {
  return doc(database, 'budgetWorkspaces', workspaceId, collectionName, recordId);
}

function authenticatedDatabase(email) {
  return testEnvironment.authenticatedContext(`uid-${email}`, { email }).firestore();
}

async function seedWorkspace() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceDoc(context.firestore()), {
      name: 'Rules workspace',
      ownerEmail,
      memberEmails: [ownerEmail, memberEmail],
      members: [
        { email: ownerEmail, role: 'owner' },
        { email: memberEmail, role: 'editor' },
      ],
    });
  });
}

before(async () => {
  const { host, port } = firestoreHost();
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port,
      rules: await readFile('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await seedWorkspace();
});

after(async () => {
  await testEnvironment.cleanup();
});

test('members can collaborate without changing permanent record ownership', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  const memberDb = authenticatedDatabase(memberEmail);
  const expenseRef = workspaceRecord(ownerDb, 'expenses', 'expense-owner');

  await assertSucceeds(
    setDoc(expenseRef, {
      name: 'Groceries',
      categoryId: 'category-food',
      amount: 1200,
      month: '2026-08',
      type: 'one-time',
      note: '',
      memberEmail: ownerEmail,
    }),
  );
  await assertSucceeds(
    updateDoc(workspaceRecord(memberDb, 'expenses', 'expense-owner'), { amount: 1500 }),
  );
  await assertFails(
    updateDoc(workspaceRecord(memberDb, 'expenses', 'expense-owner'), { memberEmail }),
  );
  await assertSucceeds(deleteDoc(workspaceRecord(memberDb, 'expenses', 'expense-owner')));
});

test('create ownership must match the authenticated member', async () => {
  const memberDb = authenticatedDatabase(memberEmail);

  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'expenses', 'expense-member'), {
      name: 'Fuel',
      categoryId: 'category-travel',
      amount: 900,
      month: '2026-08',
      type: 'one-time',
      note: '',
      memberEmail,
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'expenses', 'expense-spoofed'), {
      name: 'Fuel',
      categoryId: 'category-travel',
      amount: 900,
      month: '2026-08',
      type: 'one-time',
      note: '',
      memberEmail: ownerEmail,
    }),
  );
});

test('payment modes can link only to an account with the same owner', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentAccounts', 'account-member'), {
      name: 'Member account',
      bankName: 'HDFC',
      lastFour: '1234',
      memberEmail,
    }),
  );
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'paymentAccounts', 'account-owner'), {
      name: 'Owner account',
      bankName: 'HDFC',
      lastFour: '5678',
      memberEmail: ownerEmail,
    });
  });

  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-member'), {
      type: 'upi',
      name: 'Member UPI',
      provider: 'Google Pay',
      paymentAccountId: 'account-member',
      memberEmail,
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-cross-owner'), {
      type: 'upi',
      name: 'Invalid UPI',
      provider: 'Google Pay',
      paymentAccountId: 'account-owner',
      memberEmail,
    }),
  );
});

test('Cash is the only workspace-global mode and cannot be archived or deleted', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  const cashRef = workspaceRecord(memberDb, 'paymentModes', 'payment-mode-cash');

  await assertSucceeds(setDoc(cashRef, { type: 'cash', name: 'Cash', workspaceGlobal: true }));
  await assertFails(updateDoc(cashRef, { archivedDate: '2026-08-15T00:00:00.000Z' }));
  await assertFails(deleteDoc(cashRef));
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'member-cash'), {
      type: 'cash',
      name: 'Member cash',
      memberEmail,
    }),
  );
});

test('Wallet and unsupported payment-mode types are rejected', async () => {
  const memberDb = authenticatedDatabase(memberEmail);

  await assertFails(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'wallet-mode'), {
      type: 'wallet',
      name: 'Wallet',
      memberEmail,
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'crypto-mode'), {
      type: 'crypto',
      name: 'Crypto',
      memberEmail,
    }),
  );
});

test('loan and investment payments require a same-owner account-backed mode', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentAccounts', 'account-member'), {
      name: 'Member account',
      bankName: 'HDFC',
      lastFour: '1234',
      memberEmail,
    }),
  );
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-backed'), {
      type: 'upi',
      name: 'Backed UPI',
      provider: 'Google Pay',
      paymentAccountId: 'account-member',
      memberEmail,
    }),
  );
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-unbacked'), {
      type: 'upi',
      name: 'Unbacked UPI',
      provider: 'Google Pay',
      memberEmail,
    }),
  );

  const loan = {
    lender: 'Bank',
    loanType: 'Home loan',
    principal: 1000000,
    outstanding: 800000,
    annualRate: 8,
    emi: 10000,
    startDate: '2026-01-01',
    notes: '',
    memberEmail,
  };
  const investment = {
    name: 'Index SIP',
    amount: 5000,
    frequency: 'monthly',
    startDate: '2026-01-01',
    notes: '',
    memberEmail,
  };

  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'loans', 'loan-valid'), {
      ...loan,
      paymentModeId: 'mode-backed',
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'loans', 'loan-unbacked'), {
      ...loan,
      paymentModeId: 'mode-unbacked',
    }),
  );
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'investments', 'investment-valid'), {
      ...investment,
      paymentModeId: 'mode-backed',
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'investments', 'investment-missing-mode'), investment),
  );
});

test('non-members cannot write workspace records', async () => {
  const otherDb = authenticatedDatabase(otherEmail);
  await assertFails(
    setDoc(workspaceRecord(otherDb, 'expenses', 'expense-other'), {
      name: 'Blocked',
      categoryId: 'category-other',
      amount: 1,
      month: '2026-08',
      type: 'one-time',
      note: '',
      memberEmail: otherEmail,
    }),
  );
});
