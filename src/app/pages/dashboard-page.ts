import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../budget.store';
import { MonthMemberControls } from '../shared/month-member-controls';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="dashboard" />
    } @else {
      <section class="page mobile-dashboard-page">
        <button
          class="mobile-workspace-card"
          type="button"
          aria-label="Change workspace"
          [matMenuTriggerFor]="mobileWorkspaceMenu"
        >
          <span class="sync-dot" aria-hidden="true"></span>
          <strong>{{ store.activeWorkspace()?.name || 'Battowski Home' }}</strong>
          <mat-icon aria-hidden="true">expand_more</mat-icon>
        </button>

        <mat-menu #mobileWorkspaceMenu="matMenu" class="workspace-menu">
          @for (workspace of store.activeWorkspaces(); track workspace.id) {
            <button mat-menu-item type="button" (click)="store.selectWorkspace(workspace.id)">
              <mat-icon aria-hidden="true">home_work</mat-icon>
              <span>{{ workspace.name }}</span>
            </button>
          }
          @if (store.canManageWorkspace()) {
            <button mat-menu-item type="button" (click)="store.createWorkspace()">
              <mat-icon aria-hidden="true">add_business</mat-icon>
              <span>Create workspace</span>
            </button>
          }
        </mat-menu>

        <header class="page-header desktop-page-header">
          <div>
            <h1>Dashboard</h1>
            <p>Month-first overview of spending, savings, and runway.</p>
          </div>
          <div class="header-actions">
            <app-month-member-controls />
            <span class="runway-badge" [class.warning]="store.remainingFunds() < 0">
              <mat-icon aria-hidden="true">shield</mat-icon>
              {{ store.runwayLabel() }}
            </span>
          </div>
        </header>

        <div class="mobile-page-controls mobile-filter-strip mobile-dashboard-filters">
          <app-month-member-controls />
        </div>

        <section class="stat-grid five" tabindex="0" aria-label="Monthly financial summary">
          <article class="stat-card">
            <span class="icon-chip blue"><mat-icon aria-hidden="true">download</mat-icon></span>
            <p>Total Income</p>
            <strong>{{
              store.monthlyIncome() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip red"><mat-icon aria-hidden="true">upload</mat-icon></span>
            <p>Total Expenses</p>
            <strong>{{
              store.outflowTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip teal"><mat-icon aria-hidden="true">trending_up</mat-icon></span>
            <p>Investments</p>
            <strong>{{
              store.investmentTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip orange"
              ><mat-icon aria-hidden="true">account_balance</mat-icon></span
            >
            <p>Loan EMI</p>
            <strong>{{
              store.debtEmiTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card success">
            <span class="icon-chip green"><mat-icon aria-hidden="true">savings</mat-icon></span>
            <p>Remaining</p>
            <strong>{{
              store.remainingFunds() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
        </section>

        <section class="dashboard-layout">
          <div class="panel-stack">
            <article class="panel-card mobile-recurring-panel">
              <header class="panel-heading">
                <div>
                  <h2><mat-icon aria-hidden="true">sync_alt</mat-icon> Recurring Expenses</h2>
                </div>
                <a routerLink="/expenses">View all</a>
              </header>
              <div class="soft-list">
                @for (expense of store.recurringEntries().slice(0, 4); track expense.id) {
                  <article class="list-row no-leading-icon">
                    <div>
                      <strong>{{ expense.name }}</strong>
                      <small>{{ store.categoryName(expense.categoryId) }}</small>
                    </div>
                    <b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                  </article>
                } @empty {
                  <div class="empty-state">No recurring expenses for this month</div>
                }
              </div>
            </article>

            <article class="panel-card mobile-hidden">
              <header class="panel-heading">
                <div>
                  <h2><mat-icon aria-hidden="true">receipt_long</mat-icon> One-time Expenses</h2>
                </div>
                <a routerLink="/expenses">View all</a>
              </header>
              <div class="soft-list">
                @for (expense of store.oneTimeEntries().slice(0, 4); track expense.id) {
                  <article class="list-row no-leading-icon">
                    <div>
                      <strong>{{ expense.name }}</strong>
                      <small
                        >{{ store.shortDateLabel(store.recordDate(expense)) }} &middot;
                        {{ store.categoryName(expense.categoryId) }}</small
                      >
                    </div>
                    <b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                  </article>
                } @empty {
                  <div class="empty-state">No one-time expenses for this month</div>
                }
              </div>
            </article>
          </div>

          <div class="panel-stack">
            <article class="panel-card mobile-investments-panel">
              <header class="panel-heading">
                <div>
                  <h2><mat-icon aria-hidden="true">trending_up</mat-icon> Investments</h2>
                </div>
                <a routerLink="/investments">View all</a>
              </header>
              <div class="soft-list compact">
                @for (investment of store.portfolioRows().slice(0, 4); track investment.id) {
                  <article class="list-row">
                    <span class="icon-chip teal"
                      ><mat-icon aria-hidden="true">show_chart</mat-icon></span
                    >
                    <div>
                      <strong>{{ investment.name }}</strong>
                      <small>{{ store.investmentFrequencyLabel(investment) }}</small>
                    </div>
                    <b class="teal-text">{{
                      investment.monthlyAmount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                    }}</b>
                  </article>
                } @empty {
                  <div class="empty-state">No investments saved</div>
                }
              </div>
            </article>

            <article class="panel-card tall mobile-hidden">
              <header class="panel-heading">
                <div>
                  <h2>
                    <mat-icon aria-hidden="true">bar_chart</mat-icon> Category Budget Progress
                  </h2>
                  <p>% used</p>
                </div>
              </header>
              <div class="progress-list">
                @for (category of store.categoryCards(); track category.id) {
                  <article class="progress-row">
                    <div>
                      <span
                        class="dot"
                        [style.background]="category.color"
                        aria-hidden="true"
                      ></span>
                      <strong>{{ category.name }}</strong>
                      <b>{{ category.used | percent: '1.0-0' }}</b>
                    </div>
                    <mat-progress-bar
                      mode="determinate"
                      [value]="category.percent"
                      [attr.aria-label]="category.name + ' budget used'"
                    ></mat-progress-bar>
                  </article>
                } @empty {
                  <div class="empty-state">No categories yet</div>
                }
              </div>
            </article>
          </div>
        </section>
      </section>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  readonly store = inject(BudgetStore);
}
