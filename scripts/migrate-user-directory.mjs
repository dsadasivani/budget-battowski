import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const applyChanges = process.argv.includes('--apply');
const projectArgumentIndex = process.argv.indexOf('--project');
const projectId =
  projectArgumentIndex >= 0 ? process.argv[projectArgumentIndex + 1] : process.env.GCLOUD_PROJECT;

if (!projectId) {
  throw new Error('Set GCLOUD_PROJECT or pass --project <firebase-project-id>.');
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);
const legacyProfiles = await firestore.collection('budgetUserProfiles').get();
const publicProfiles = [];
const unresolvedEmails = [];

for (const snapshot of legacyProfiles.docs) {
  const value = snapshot.data();
  const email = String(value.email ?? snapshot.id)
    .trim()
    .toLowerCase();
  try {
    const user = await auth.getUserByEmail(email);
    publicProfiles.push({
      uid: user.uid,
      email,
      displayName: String(value.displayName ?? user.displayName ?? email),
      ...((value.photoUrl ?? user.photoURL) ? { photoUrl: value.photoUrl ?? user.photoURL } : {}),
    });
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      unresolvedEmails.push(email);
      continue;
    }
    throw error;
  }
}

if (applyChanges) {
  for (let offset = 0; offset < publicProfiles.length; offset += 100) {
    const batch = firestore.batch();
    for (const profile of publicProfiles.slice(offset, offset + 100)) {
      const publicData = { ...profile, updatedAt: FieldValue.serverTimestamp() };
      batch.set(firestore.collection('budgetUserDirectory').doc(profile.uid), publicData, {
        merge: true,
      });
      batch.set(firestore.collection('budgetUserDirectoryByEmail').doc(profile.email), publicData, {
        merge: true,
      });
    }
    await batch.commit();
  }
}

console.log(
  JSON.stringify(
    {
      mode: applyChanges ? 'applied' : 'dry-run',
      legacyProfiles: legacyProfiles.size,
      migratableProfiles: publicProfiles.length,
      unresolvedEmails,
    },
    null,
    2,
  ),
);

if (!applyChanges) {
  console.log('Re-run with --apply after reviewing this dry-run report.');
}
