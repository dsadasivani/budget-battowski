import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import type { User } from 'firebase/auth';

import { firebaseConfig } from '../environments/environment';

type FirebaseMode = 'firebase' | 'local';

interface BudgetFirebaseClient {
  mode: FirebaseMode;
  app?: FirebaseApp;
  reason?: string;
}

export function initializeBudgetFirebase(): BudgetFirebaseClient {
  const hasProjectConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

  if (!hasProjectConfig) {
    return {
      mode: 'local',
      reason: 'Add your Firebase web config in src/environments/environment.ts to enable Firestore.',
    };
  }

  const app = getApps()[0] ?? initializeApp(firebaseConfig);

  return {
    mode: 'firebase',
    app,
  };
}

export async function getBudgetFirestore(app: FirebaseApp) {
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(app);
}

export async function observeBudgetAuth(app: FirebaseApp, next: (user: User | null) => void): Promise<() => void> {
  const { getAuth, onAuthStateChanged } = await import('firebase/auth');
  const auth = getAuth(app);

  return onAuthStateChanged(auth, next);
}

export async function signInWithGoogle(app: FirebaseApp): Promise<User> {
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function signOutBudgetUser(app: FirebaseApp): Promise<void> {
  const { getAuth, signOut } = await import('firebase/auth');

  await signOut(getAuth(app));
}
