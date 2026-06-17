import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import {
  buildQaSeedData,
  QA_ACCOUNTS,
  QA_COLLECTIONS,
  QA_WORKSPACE_ID,
  readQaFirebaseConfig,
} from './qa-data.mjs';

const password = process.env.QA_FIREBASE_PASSWORD;

if (!password) {
  throw new Error('Set QA_FIREBASE_PASSWORD before running npm run qa:seed.');
}

const app = initializeApp(readQaFirebaseConfig());
const auth = getAuth(app);
const db = getFirestore(app);
const workspaceRef = doc(db, 'budgetWorkspaces', QA_WORKSPACE_ID);

function withTimeout(promise, label, timeoutMs = 30000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function deleteCollection(collectionName) {
  const snapshot = await getDocs(collection(db, 'budgetWorkspaces', QA_WORKSPACE_ID, collectionName));
  const docs = snapshot.docs;

  for (let index = 0; index < docs.length; index += 400) {
    const batch = writeBatch(db);
    for (const docSnapshot of docs.slice(index, index + 400)) {
      batch.delete(docSnapshot.ref);
    }
    await batch.commit();
  }

  return docs.length;
}

async function writeCollection(collectionName, records) {
  for (let index = 0; index < records.length; index += 400) {
    const batch = writeBatch(db);
    for (const record of records.slice(index, index + 400)) {
      const { id, ...data } = record;
      batch.set(doc(db, 'budgetWorkspaces', QA_WORKSPACE_ID, collectionName, id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

async function main() {
  console.log(`Signing in as ${QA_ACCOUNTS.owner}`);
  const credential = await withTimeout(
    signInWithEmailAndPassword(auth, QA_ACCOUNTS.owner, password),
    'Firebase email/password sign-in',
  );
  const seed = buildQaSeedData();
  const deletedCounts = {};
  const { id: _id, ...workspace } = seed.workspace;

  console.log('Ensuring workspace document exists for rule access');
  await withTimeout(
    setDoc(
      workspaceRef,
      {
        ...workspace,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    'Ensure workspace document',
  );

  for (const collectionName of QA_COLLECTIONS) {
    console.log(`Deleting ${collectionName}`);
    deletedCounts[collectionName] = await withTimeout(
      deleteCollection(collectionName),
      `Delete ${collectionName}`,
      45000,
    );
  }

  console.log('Recreating workspace document');
  await withTimeout(deleteDoc(workspaceRef).catch(() => undefined), 'Delete workspace document');
  await withTimeout(
    setDoc(workspaceRef, {
      ...workspace,
      updatedAt: serverTimestamp(),
    }),
    'Create workspace document',
  );

  for (const collectionName of QA_COLLECTIONS) {
    console.log(`Writing ${collectionName}`);
    await withTimeout(
      writeCollection(collectionName, seed.records[collectionName]),
      `Write ${collectionName}`,
      45000,
    );
  }

  const writtenCounts = Object.fromEntries(
    QA_COLLECTIONS.map((collectionName) => [
      collectionName,
      seed.records[collectionName].length,
    ]),
  );

  console.log(
    JSON.stringify(
      {
        signedInAs: credential.user.email,
        workspaceId: QA_WORKSPACE_ID,
        deletedCounts,
        writtenCounts,
      },
      null,
      2,
    ),
  );
  await deleteApp(app);
}

main().catch((error) => {
  console.error(error);
  void deleteApp(app).finally(() => process.exit(1));
});
