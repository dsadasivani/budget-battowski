import { Injectable, inject } from '@angular/core';

import type { OnboardingProgress } from '../budget.models';
import { BudgetStore } from '../budget.store';

/**
 * Explicit application-shell facade. Feature pages can continue to inject BudgetStore during the
 * incremental store decomposition, while the root shell depends only on this composed API.
 */
@Injectable({ providedIn: 'root' })
export class BudgetFacade {
  private readonly store = inject(BudgetStore);

  readonly firebase = this.store.firebase;
  readonly userName = this.store.userName;
  readonly userUid = this.store.userUid;
  readonly userEmail = this.store.userEmail;
  readonly userPhoto = this.store.userPhoto;
  readonly workspaceId = this.store.workspaceId;
  readonly activeWorkspace = this.store.activeWorkspace;
  readonly activeWorkspaces = this.store.activeWorkspaces;
  readonly canManageWorkspace = this.store.canManageWorkspace;
  readonly onboardingProgress = this.store.onboardingProgress;
  readonly isSessionChecking = this.store.isSessionChecking;
  readonly isWorkspaceDataLoading = this.store.isWorkspaceDataLoading;
  readonly isSyncing = this.store.isSyncing;
  readonly syncError = this.store.syncError;
  readonly showGlobalLoader = this.store.showGlobalLoader;

  loginWithGoogle(): Promise<void> {
    return this.store.loginWithGoogle();
  }

  loginWithEmailPassword(email: string, password: string): Promise<void> {
    return this.store.loginWithEmailPassword(email, password);
  }

  logout(): Promise<void> {
    return this.store.logout();
  }

  selectWorkspace(workspaceId: string): Promise<void> {
    return this.store.selectWorkspace(workspaceId);
  }

  createWorkspace(): Promise<void> {
    return this.store.createWorkspace();
  }

  memberInitial(memberEmail: string | undefined): string {
    return this.store.memberInitial(memberEmail);
  }

  saveOnboardingProgress(progress: OnboardingProgress): Promise<void> {
    return this.store.saveOnboardingProgress(progress);
  }
}
