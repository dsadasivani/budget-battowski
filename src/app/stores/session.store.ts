import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';

import {
  initializeBudgetFirebase,
  observeBudgetAuth,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutBudgetUser,
} from '../firebase.client';
import { OperationalTelemetryService } from '../core/operational-telemetry';

@Injectable({ providedIn: 'root' })
export class SessionStore implements OnDestroy {
  private readonly telemetry = inject(OperationalTelemetryService);
  private authUnsubscribe: (() => void) | null = null;
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

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
  }

  async observeAuth(onUser: (user: User | null) => Promise<void>): Promise<void> {
    if (!this.firebase.app) {
      this.isSessionChecking.set(false);
      return;
    }
    this.isSessionChecking.set(true);
    this.isSyncing.set(true);
    this.syncError.set(null);
    try {
      this.authUnsubscribe?.();
      this.authUnsubscribe = await observeBudgetAuth(this.firebase.app, (user) => {
        void onUser(user);
      });
      this.syncStatus.set('Sign in with Google');
    } catch (error) {
      this.fail(error, 'Unable to initialize Firebase login.', 'auth-observe');
      this.isSessionChecking.set(false);
      this.loginLoaderActive.set(false);
    } finally {
      this.isSyncing.set(false);
    }
  }

  async loginWithGoogle(onUser: (user: User) => Promise<void>): Promise<void> {
    if (!this.firebase.app) {
      this.syncStatus.set('Firebase config needed');
      return;
    }
    await this.runLogin(
      async () => onUser(await signInWithGoogle(this.firebase.app!)),
      'Google sign-in failed.',
      'auth-google-login',
    );
  }

  async loginWithEmailPassword(
    email: string,
    password: string,
    onUser: (user: User) => Promise<void>,
  ): Promise<void> {
    if (!this.firebase.app) {
      this.syncStatus.set('Firebase config needed');
      return;
    }
    await this.runLogin(
      async () => onUser(await signInWithEmailPassword(this.firebase.app!, email, password)),
      'Email and password sign-in failed.',
      'auth-password-login',
    );
  }

  async logout(): Promise<void> {
    if (!this.firebase.app) {
      return;
    }
    this.loginLoaderActive.set(false);
    this.isSyncing.set(true);
    this.syncError.set(null);
    try {
      await signOutBudgetUser(this.firebase.app);
      this.syncStatus.set('Signed out');
    } catch (error) {
      this.fail(error, 'Logout failed.', 'auth-logout');
    } finally {
      this.isSyncing.set(false);
    }
  }

  private async runLogin(
    action: () => Promise<void>,
    fallback: string,
    operation: string,
  ): Promise<void> {
    this.loginLoaderActive.set(true);
    this.isSyncing.set(true);
    this.syncError.set(null);
    this.syncStatus.set('Signing in');
    try {
      await action();
    } catch (error) {
      this.fail(error, fallback, operation);
      this.loginLoaderActive.set(false);
    } finally {
      this.isSyncing.set(false);
    }
  }

  private fail(error: unknown, fallback: string, operation: string): void {
    this.telemetry.capture(error, {
      category: 'authentication',
      context: { operation },
    });
    this.syncError.set(error instanceof Error ? error.message : fallback);
    this.syncStatus.set('Firebase sync failed');
  }
}
