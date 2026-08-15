import { Injectable, signal } from '@angular/core';
import { initializeBudgetFirebase } from '../firebase.client';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly firebase = initializeBudgetFirebase();
  readonly isSessionChecking = signal(this.firebase.mode === 'firebase');
  readonly isSyncing = signal(false);
  readonly loginLoaderActive = signal(false);
  readonly syncStatus = signal(
    this.firebase.mode === 'firebase' ? 'Sign in with Google' : 'Firebase config needed',
  );
  readonly syncError = signal<string | null>(null);
  readonly userName = signal<string | null>(null);
  readonly userUid = signal<string | null>(null);
  readonly userEmail = signal<string | null>(null);
  readonly userPhoto = signal<string | null>(null);
}
