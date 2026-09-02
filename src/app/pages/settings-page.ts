import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { BudgetStore } from '../budget.store';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';
import { OnboardingStore } from '../stores/onboarding.store';
import { SmsAutomationSettings } from '../sms-automation-settings';

@Component({
  selector: 'app-settings-page',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    AppPageSkeletonComponent,
    SmsAutomationSettings,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="utility" />
    } @else {
      <section class="page narrow mobile-settings-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Settings</h1>
            <p>Account, sync, and app configuration.</p>
          </div>
        </header>

        <section class="utility-grid">
          <app-sms-automation-settings />
          <article class="panel-card action-card">
            <span class="icon-chip blue"
              ><mat-icon aria-hidden="true">{{ store.statusIcon() }}</mat-icon></span
            >
            <h2>Sync Status</h2>
            <p>{{ store.syncError() || store.syncStatus() }}</p>
            @if (store.isSyncing()) {
              <span class="badge neutral">Syncing</span>
            } @else if (store.workspaceId()) {
              <span class="badge success">Connected</span>
            } @else {
              <span class="badge warning">Needs setup</span>
            }
          </article>

          <article class="panel-card action-card">
            <span class="icon-chip green"
              ><mat-icon aria-hidden="true">account_circle</mat-icon></span
            >
            <h2>Account</h2>
            <p>{{ store.userName() || store.userEmail() || 'Local workspace mode' }}</p>
            <button
              mat-stroked-button
              type="button"
              (click)="store.logout()"
              [disabled]="store.firebase.mode !== 'firebase' || store.isSyncing()"
            >
              <mat-icon aria-hidden="true">logout</mat-icon>
              Sign out
            </button>
          </article>

          <article class="panel-card action-card">
            <span class="icon-chip orange"><mat-icon aria-hidden="true">settings</mat-icon></span>
            <h2>Persistence Mode</h2>
            @if (store.firebase.mode === 'firebase') {
              <p>Firebase is configured. Your workspace data syncs when signed in.</p>
            } @else {
              <p>Add Firebase config in the environment file to enable cloud persistence.</p>
            }
          </article>

          <article class="panel-card action-card">
            <span class="icon-chip purple"
              ><mat-icon aria-hidden="true">tips_and_updates</mat-icon></span
            >
            <h2>Guided tour</h2>
            <p>Review the key steps for setting up and using your budget workspace.</p>
            <button
              class="guided-tour-button"
              mat-stroked-button
              type="button"
              (click)="onboarding.requestTourLaunch()"
            >
              <mat-icon aria-hidden="true">play_circle</mat-icon>
              Start guided tour
            </button>
          </article>
        </section>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  readonly store = inject(BudgetStore);
  readonly onboarding = inject(OnboardingStore);
}
