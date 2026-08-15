import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

import {
  buildQaSeedData,
  QA_ACCOUNTS,
  QA_COLLECTIONS,
} from '../scripts/qa-data.mjs';

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

test('legacy Cash can be normalized but remains protected', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  const cashRef = workspaceRecord(memberDb, 'paymentModes', 'payment-mode-cash');
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'paymentModes', 'payment-mode-cash'), {
      type: 'cash',
      name: 'Cash',
    });
  });

  await assertSucceeds(updateDoc(cashRef, { workspaceGlobal: true }));
  await assertFails(updateDoc(cashRef, { name: 'Petty cash' }));
  await assertFails(updateDoc(cashRef, { archivedDate: '2026-08-15T00:00:00.000Z' }));
  await assertFails(deleteDoc(cashRef));
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
    endDate: '2036-01-01',
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

test('unauthenticated workspace access is denied', async () => {
  await assertFails(getDoc(workspaceDoc(testEnvironment.unauthenticatedContext().firestore())));
});

test('only the workspace owner can administer a workspace', async () => {
  await assertFails(updateDoc(workspaceDoc(authenticatedDatabase(memberEmail)), { name: 'Blocked' }));
  await assertSucceeds(updateDoc(workspaceDoc(authenticatedDatabase(ownerEmail)), { name: 'Allowed' }));
});

test('UID and mixed identity workspaces authorize members', async () => {
  const uidWorkspace = 'uid-workspace';
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'budgetWorkspaces', uidWorkspace), {
      name: 'UID workspace', ownerUid: `uid-${ownerEmail}`, ownerEmail,
      memberUids: [`uid-${ownerEmail}`, `uid-${memberEmail}`], memberEmails: [ownerEmail],
      members: [{ uid: `uid-${ownerEmail}`, email: ownerEmail, role: 'owner' }, { uid: `uid-${memberEmail}`, email: memberEmail, role: 'editor' }],
    });
  });
  await assertSucceeds(getDoc(doc(authenticatedDatabase(memberEmail), 'budgetWorkspaces', uidWorkspace)));
});

test('UID ownership is accepted and remains immutable', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  const reference = workspaceRecord(memberDb, 'expenses', 'uid-owned');
  await assertSucceeds(setDoc(reference, {
    name: 'UID expense', categoryId: 'food', amount: 10, month: '2026-08', type: 'one-time',
    note: '', ownerUid: `uid-${memberEmail}`, memberEmail,
  }));
  await assertFails(updateDoc(reference, { ownerUid: `uid-${ownerEmail}` }));
});

test('malformed ownership and negative financial values are denied', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  await assertFails(setDoc(workspaceRecord(memberDb, 'expenses', 'owner-missing'), {
    name: 'Missing owner', categoryId: 'food', amount: 10, month: '2026-08', type: 'one-time', note: '',
  }));
  await assertFails(setDoc(workspaceRecord(memberDb, 'expenses', 'negative'), {
    name: 'Negative', categoryId: 'food', amount: -1, month: '2026-08', type: 'one-time', note: '', memberEmail,
  }));
});

test('directory is authenticated-readable while private profile is owner-only', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  const memberDb = authenticatedDatabase(memberEmail);
  const uid = `uid-${ownerEmail}`;
  await assertSucceeds(setDoc(doc(ownerDb, 'budgetUserDirectory', uid), {
    uid, email: ownerEmail, displayName: 'Owner',
  }));
  await assertSucceeds(setDoc(doc(ownerDb, 'budgetUserPrivate', uid), {
    uid, onboarding: { activeStepId: 'income' }, updatedDate: '2026-08-15',
  }));
  await assertSucceeds(getDoc(doc(memberDb, 'budgetUserDirectory', uid)));
  await assertFails(getDoc(doc(memberDb, 'budgetUserPrivate', uid)));
});

test('unknown workspace subcollections are denied', async () => {
  await assertFails(setDoc(workspaceRecord(authenticatedDatabase(ownerEmail), 'unknownData', 'record'), { value: true }));
});

test('Loan EMI system category cannot be renamed or deleted', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  const reference = workspaceRecord(ownerDb, 'categories', 'category-loan-emi');
  await assertSucceeds(setDoc(reference, {
    name: 'Loan EMI', monthlyBudget: 0, color: '#444444', type: 'Expenses',
  }));
  await assertFails(updateDoc(reference, { name: 'Other' }));
  await assertFails(deleteDoc(reference));
});

test('workspace owner UID cannot be replaced during administration', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(workspaceDoc(context.firestore()), {
      ownerUid: `uid-${ownerEmail}`, memberUids: [`uid-${ownerEmail}`, `uid-${memberEmail}`],
    });
  });
  await assertFails(updateDoc(workspaceDoc(ownerDb), { ownerUid: `uid-${memberEmail}` }));
});

test('legacy workspace owner can add their UID exactly once', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);

  await assertSucceeds(
    updateDoc(workspaceDoc(ownerDb), {
      ownerUid: `uid-${ownerEmail}`,
      memberUids: [`uid-${ownerEmail}`, `uid-${memberEmail}`],
    }),
  );
  await assertFails(updateDoc(workspaceDoc(ownerDb), { ownerUid: `uid-${memberEmail}` }));
});

test('a member can materialize another member owned recurring source without changing ownership', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'templates', 'owner-rent'), {
      name: 'Rent', categoryId: 'housing', amount: 1000, type: 'recurring', frequency: 'monthly',
      startDate: '2026-01-01', ownerUid: `uid-${ownerEmail}`, memberEmail: ownerEmail,
    });
  });
  await assertSucceeds(setDoc(workspaceRecord(authenticatedDatabase(memberEmail), 'expenses', 'review-owner-rent'), {
    name: 'Rent', categoryId: 'housing', amount: 1000, month: '2026-08', date: '2026-08-01',
    type: 'recurring', note: 'Approved', templateId: 'owner-rent',
    ownerUid: `uid-${ownerEmail}`, memberEmail: ownerEmail,
  }));
});

test('the complete QA seed fixture satisfies hardened ownership rules', async () => {
  const seed = buildQaSeedData();
  const accountUids = new Map(
    Object.values(QA_ACCOUNTS).map((email) => [email, `uid-${email}`]),
  );
  const { id: qaWorkspaceId, ...workspaceData } = seed.workspace;
  const ownerDb = authenticatedDatabase(QA_ACCOUNTS.owner);

  await assertSucceeds(
    setDoc(doc(ownerDb, 'budgetWorkspaces', qaWorkspaceId), {
      ...workspaceData,
      ownerUid: accountUids.get(QA_ACCOUNTS.owner),
      memberUids: [...accountUids.values()],
      members: workspaceData.members.map((member) => ({
        ...member,
        uid: accountUids.get(member.email),
      })),
    }),
  );

  for (const collectionName of QA_COLLECTIONS) {
    for (const record of seed.records[collectionName]) {
      const email = record.memberEmail ?? QA_ACCOUNTS.owner;
      const database = authenticatedDatabase(email);
      const { id: recordId, ...recordData } = record;
      const ownedRecord = record.memberEmail
        ? { ...recordData, ownerUid: accountUids.get(email) }
        : recordData;
      await assertSucceeds(
        setDoc(
          doc(database, 'budgetWorkspaces', qaWorkspaceId, collectionName, recordId),
          ownedRecord,
        ),
      );
    }
  }
});
