import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { buildQaSeedData, QA_ACCOUNTS, QA_COLLECTIONS } from '../scripts/qa-data.mjs';

const projectId = 'budget-battowski';
const workspaceId = 'workspace-rules-test';
const ownerEmail = 'owner@example.com';
const memberEmail = 'member@example.com';
const otherEmail = 'other@example.com';
const ownerUid = `uid-${ownerEmail}`;
const memberUid = `uid-${memberEmail}`;
const otherUid = `uid-${otherEmail}`;

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
      ownerUid,
      memberUids: [ownerUid, memberUid],
      members: [
        { uid: ownerUid, email: ownerEmail, role: 'owner' },
        { uid: memberUid, email: memberEmail, role: 'editor' },
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
      ownerUid,
      memberEmail: ownerEmail,
    }),
  );
  await assertSucceeds(
    updateDoc(workspaceRecord(memberDb, 'expenses', 'expense-owner'), { amount: 1500 }),
  );
  await assertSucceeds(
    updateDoc(workspaceRecord(memberDb, 'expenses', 'expense-owner'), { memberEmail }),
  );
  await assertFails(
    updateDoc(workspaceRecord(memberDb, 'expenses', 'expense-owner'), { ownerUid: memberUid }),
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
      ownerUid: memberUid,
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
      ownerUid,
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
      ownerUid: memberUid,
      memberEmail,
    }),
  );
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'paymentAccounts', 'account-owner'), {
      name: 'Owner account',
      bankName: 'HDFC',
      lastFour: '5678',
      ownerUid,
      memberEmail: ownerEmail,
    });
  });

  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-member'), {
      type: 'upi',
      name: 'Member UPI',
      provider: 'Google Pay',
      paymentAccountId: 'account-member',
      ownerUid: memberUid,
      memberEmail,
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-cross-owner'), {
      type: 'upi',
      name: 'Invalid UPI',
      provider: 'Google Pay',
      paymentAccountId: 'account-owner',
      ownerUid: memberUid,
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

test('UID-less Cash cannot be normalized into the clean schema', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  const cashRef = workspaceRecord(memberDb, 'paymentModes', 'payment-mode-cash');
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'paymentModes', 'payment-mode-cash'), {
      type: 'cash',
      name: 'Cash',
    });
  });

  await assertFails(updateDoc(cashRef, { workspaceGlobal: true }));
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
      ownerUid: memberUid,
      memberEmail,
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'crypto-mode'), {
      type: 'crypto',
      name: 'Crypto',
      ownerUid: memberUid,
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
      ownerUid: memberUid,
      memberEmail,
    }),
  );
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-backed'), {
      type: 'upi',
      name: 'Backed UPI',
      provider: 'Google Pay',
      paymentAccountId: 'account-member',
      ownerUid: memberUid,
      memberEmail,
    }),
  );
  await assertSucceeds(
    setDoc(workspaceRecord(memberDb, 'paymentModes', 'mode-unbacked'), {
      type: 'upi',
      name: 'Unbacked UPI',
      provider: 'Google Pay',
      ownerUid: memberUid,
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
    ownerUid: memberUid,
    memberEmail,
  };
  const investment = {
    name: 'Index SIP',
    amount: 5000,
    frequency: 'monthly',
    startDate: '2026-01-01',
    notes: '',
    ownerUid: memberUid,
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
      ownerUid: otherUid,
      memberEmail: otherEmail,
    }),
  );
});

test('unauthenticated workspace access is denied', async () => {
  await assertFails(getDoc(workspaceDoc(testEnvironment.unauthenticatedContext().firestore())));
});

test('users can inspect only their own UID workspace path before bootstrap', async () => {
  const personalWorkspace = doc(authenticatedDatabase(otherEmail), 'budgetWorkspaces', otherUid);

  await assertSucceeds(getDoc(personalWorkspace));
  await assertFails(getDoc(doc(authenticatedDatabase(memberEmail), 'budgetWorkspaces', otherUid)));
});

test('only the workspace owner can administer a workspace', async () => {
  await assertFails(
    updateDoc(workspaceDoc(authenticatedDatabase(memberEmail)), { name: 'Blocked' }),
  );
  await assertSucceeds(
    updateDoc(workspaceDoc(authenticatedDatabase(ownerEmail)), { name: 'Allowed' }),
  );
});

test('UID workspaces authorize members', async () => {
  const uidWorkspace = 'uid-workspace';
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'budgetWorkspaces', uidWorkspace), {
      name: 'UID workspace',
      ownerUid,
      memberUids: [ownerUid, memberUid],
      members: [
        { uid: ownerUid, email: ownerEmail, role: 'owner' },
        { uid: memberUid, email: memberEmail, role: 'editor' },
      ],
    });
  });
  await assertSucceeds(
    getDoc(doc(authenticatedDatabase(memberEmail), 'budgetWorkspaces', uidWorkspace)),
  );
});

test('workspace membership denies a matching email with the wrong UID', async () => {
  const uidWorkspace = 'uid-authoritative-members';
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'budgetWorkspaces', uidWorkspace), {
      name: 'UID workspace',
      ownerUid,
      memberUids: [ownerUid, memberUid],
      members: [
        { uid: ownerUid, email: ownerEmail, role: 'owner' },
        { uid: memberUid, email: memberEmail, role: 'editor' },
      ],
    });
  });
  const wrongUidDb = testEnvironment
    .authenticatedContext('wrong-member-uid', { email: memberEmail })
    .firestore();
  await assertFails(getDoc(doc(wrongUidDb, 'budgetWorkspaces', uidWorkspace)));
});

test('workspace discovery must query authoritative UID membership instead of email', async () => {
  const uidWorkspace = 'uid-workspace-discovery';
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'budgetWorkspaces', uidWorkspace), {
      name: 'UID workspace',
      ownerUid,
      memberUids: [ownerUid, memberUid],
      members: [
        { uid: ownerUid, email: ownerEmail, role: 'owner' },
        { uid: memberUid, email: memberEmail, role: 'editor' },
      ],
    });
  });

  const memberDb = authenticatedDatabase(memberEmail);
  const workspaces = collection(memberDb, 'budgetWorkspaces');
  const uidQuery = query(workspaces, where('memberUids', 'array-contains', memberUid));

  await assertSucceeds(getDocs(uidQuery));
});

test('workspace ownership denies owner privileges to a matching email with the wrong UID', async () => {
  const wrongUidDb = testEnvironment
    .authenticatedContext('wrong-owner-uid', { email: ownerEmail })
    .firestore();
  await assertFails(updateDoc(workspaceDoc(wrongUidDb), { name: 'Email bypass denied' }));
});

test('matching email metadata cannot override mismatching owner UIDs in linked records', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'templates', 'uid-a-template'), {
      name: 'Rent',
      categoryId: 'housing',
      amount: 1000,
      type: 'recurring',
      frequency: 'monthly',
      startDate: '2026-01-01',
      ownerUid: 'uid-a',
      memberEmail: ownerEmail,
    });
  });
  await assertFails(
    setDoc(workspaceRecord(authenticatedDatabase(memberEmail), 'expenses', 'uid-b-expense'), {
      name: 'Rent',
      categoryId: 'housing',
      amount: 1000,
      month: '2026-08',
      date: '2026-08-01',
      type: 'recurring',
      note: 'Approved',
      templateId: 'uid-a-template',
      ownerUid: 'uid-b',
      memberEmail: ownerEmail,
    }),
  );
});

test('UID ownership is accepted and remains immutable', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  const reference = workspaceRecord(memberDb, 'expenses', 'uid-owned');
  await assertSucceeds(
    setDoc(reference, {
      name: 'UID expense',
      categoryId: 'food',
      amount: 10,
      month: '2026-08',
      type: 'one-time',
      note: '',
      ownerUid: `uid-${memberEmail}`,
      memberEmail,
    }),
  );
  await assertFails(updateDoc(reference, { ownerUid: `uid-${ownerEmail}` }));
});

test('malformed ownership and negative financial values are denied', async () => {
  const memberDb = authenticatedDatabase(memberEmail);
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'expenses', 'owner-missing'), {
      name: 'Missing owner',
      categoryId: 'food',
      amount: 10,
      month: '2026-08',
      type: 'one-time',
      note: '',
    }),
  );
  await assertFails(
    setDoc(workspaceRecord(memberDb, 'expenses', 'negative'), {
      name: 'Negative',
      categoryId: 'food',
      amount: -1,
      month: '2026-08',
      type: 'one-time',
      note: '',
      ownerUid: memberUid,
      memberEmail,
    }),
  );
});

test('directory is authenticated-readable while private profile is owner-only', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  const memberDb = authenticatedDatabase(memberEmail);
  const uid = `uid-${ownerEmail}`;
  await assertSucceeds(
    setDoc(doc(ownerDb, 'budgetUserDirectory', uid), {
      uid,
      email: ownerEmail,
      displayName: 'Owner',
    }),
  );
  await assertSucceeds(
    setDoc(doc(ownerDb, 'budgetUserDirectoryByEmail', ownerEmail), {
      uid,
      email: ownerEmail,
      displayName: 'Owner',
    }),
  );
  await assertSucceeds(
    setDoc(doc(ownerDb, 'budgetUserPrivate', uid), {
      uid,
      onboarding: { activeStepId: 'income' },
      updatedDate: '2026-08-15',
    }),
  );
  await assertSucceeds(getDoc(doc(memberDb, 'budgetUserDirectory', uid)));
  await assertSucceeds(getDoc(doc(memberDb, 'budgetUserDirectoryByEmail', ownerEmail)));
  await assertFails(getDoc(doc(memberDb, 'budgetUserPrivate', uid)));
  await assertFails(
    setDoc(doc(memberDb, 'budgetUserDirectoryByEmail', ownerEmail), {
      uid,
      email: ownerEmail,
      displayName: 'Owner',
      onboarding: { activeStepId: 'income' },
    }),
  );
});

test('unknown workspace subcollections are denied', async () => {
  await assertFails(
    setDoc(workspaceRecord(authenticatedDatabase(ownerEmail), 'unknownData', 'record'), {
      value: true,
    }),
  );
});

test('Loan EMI system category cannot be renamed or deleted', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  const reference = workspaceRecord(ownerDb, 'categories', 'category-loan-emi');
  await assertSucceeds(
    setDoc(reference, {
      name: 'Loan EMI',
      monthlyBudget: 0,
      color: '#444444',
      type: 'Expenses',
    }),
  );
  await assertFails(updateDoc(reference, { name: 'Other' }));
  await assertFails(deleteDoc(reference));
});

test('workspace owner UID cannot be replaced during administration', async () => {
  const ownerDb = authenticatedDatabase(ownerEmail);
  await assertFails(updateDoc(workspaceDoc(ownerDb), { ownerUid: memberUid }));
});

test('email-only workspace metadata cannot be used for authorization', async () => {
  const emailOnlyWorkspaceId = 'email-only-workspace';
  const ownerDb = authenticatedDatabase(ownerEmail);
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'budgetWorkspaces', emailOnlyWorkspaceId), {
      name: 'Email-only workspace',
      members: [{ email: ownerEmail, role: 'owner' }],
    });
  });

  const reference = doc(ownerDb, 'budgetWorkspaces', emailOnlyWorkspaceId);
  await assertFails(getDoc(reference));
  await assertFails(updateDoc(reference, { ownerUid, memberUids: [ownerUid] }));
});

test('UID-less owned records remain readable to members but cannot be adopted', async () => {
  const recordId = 'uid-less-expense';
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'expenses', recordId), {
      name: 'UID-less expense',
      categoryId: 'housing',
      amount: 1000,
      month: '2026-08',
      type: 'one-time',
      note: '',
      memberEmail: ownerEmail,
      version: 1,
    });
  });

  const reference = workspaceRecord(authenticatedDatabase(ownerEmail), 'expenses', recordId);
  await assertSucceeds(getDoc(reference));
  await assertFails(updateDoc(reference, { ownerUid }));
});

test('a member can materialize another member owned recurring source without changing ownership', async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(workspaceRecord(context.firestore(), 'templates', 'owner-rent'), {
      name: 'Rent',
      categoryId: 'housing',
      amount: 1000,
      type: 'recurring',
      frequency: 'monthly',
      startDate: '2026-01-01',
      ownerUid: `uid-${ownerEmail}`,
      memberEmail: ownerEmail,
    });
  });
  await assertSucceeds(
    setDoc(workspaceRecord(authenticatedDatabase(memberEmail), 'expenses', 'review-owner-rent'), {
      name: 'Rent',
      categoryId: 'housing',
      amount: 1000,
      month: '2026-08',
      date: '2026-08-01',
      type: 'recurring',
      note: 'Approved',
      templateId: 'owner-rent',
      ownerUid: `uid-${ownerEmail}`,
      memberEmail: ownerEmail,
    }),
  );
});

test('the complete QA seed fixture satisfies hardened ownership rules', async () => {
  const seed = buildQaSeedData();
  const accountUids = new Map(Object.values(QA_ACCOUNTS).map((email) => [email, `uid-${email}`]));
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
