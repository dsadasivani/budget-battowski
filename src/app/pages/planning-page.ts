import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { MonthMemberControls } from '../shared/month-member-controls';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-planning-page',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="planning" />
    } @else {
    <section class="page mobile-planning-page">
      <header class="mobile-page-hero compact-hero">
        <div class="mobile-title-row">
          <h1>Planning</h1>
          <button
            mat-flat-button
            type="button"
            (click)="store.openBulkEditor('monthly', 1)"
            [disabled]="!store.canWrite()"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
            Add Plan
          </button>
        </div>
      </header>

      <div class="mobile-centered-controls">
        <app-month-member-controls />
      </div>

      <header class="page-header desktop-page-header">
        <div>
          <h1>Planning</h1>
          <p>Monthly plan overview and recurring commitments.</p>
        </div>
        <div class="header-actions">
          <app-month-member-controls />
          <button
            mat-flat-button
            type="button"
            (click)="store.openBulkEditor('monthly', 1)"
            [disabled]="!store.canWrite()"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
            Add Plan
          </button>
        </div>
      </header>

      <section class="stat-grid" [class.three]="!store.hasMonthlyReviewRows()">
        @if (store.hasMonthlyReviewRows()) {
          <article class="stat-card">
            <span class="icon-chip purple"><mat-icon aria-hidden="true">fact_check</mat-icon></span>
            <p>Pending Review</p>
            <strong>{{ store.monthlyReviewRows().length }}</strong>
            <small>{{ store.monthlyReviewStatusLabel() }}</small>
            <button
              mat-stroked-button
              type="button"
              (click)="store.openMonthlyReview()"
              [disabled]="!store.canWrite()"
              aria-label="Review expected expenses and investments"
            >
              Review
            </button>
          </article>
        }
        <article class="stat-card">
          <span class="icon-chip blue"><mat-icon aria-hidden="true">target</mat-icon></span>
          <p>Monthly Budget</p>
          <strong>{{ store.monthlyIncome() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip orange"><mat-icon aria-hidden="true">assignment</mat-icon></span>
          <p>Planned Spend</p>
          <strong>{{ store.outflowTotal() + store.investmentTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip green"><mat-icon aria-hidden="true">verified_user</mat-icon></span>
          <p>Unplanned Buffer</p>
          <strong>{{ store.remainingFunds() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
      </section>

      <section class="content-grid two-one">
        <div class="panel-stack">
          <article class="panel-card mobile-recurring-plans">
            <header class="panel-heading split">
              <div>
                <h2>Recurring Plans</h2>
                <p>Monthly and weekly commitments</p>
              </div>
              <span class="badge neutral">{{ store.recurringPlanRows().length }} active</span>
            </header>
            <div class="soft-list">
              @for (plan of store.recurringPlanRows(); track plan.id) {
                <article class="plan-row">
                  <span class="category-icon {{ store.categoryTone(plan.categoryName) }}">
                    <mat-icon aria-hidden="true">{{ plan.icon }}</mat-icon>
                  </span>
                  <div>
                    <strong>{{ plan.name }}</strong>
                    <small>{{ store.investmentFrequencyLabel(plan) }}</small>
                  </div>
                  <b>{{ plan.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                  <span class="plan-row-actions">
                    <span class="badge success">ON</span>
                    <button
                      mat-icon-button
                      type="button"
                      [attr.aria-label]="'Edit recurring plan ' + plan.name"
                      matTooltip="Edit recurring plan"
                      (click)="store.openBulkEditor('monthly', 1, plan.id)"
                      [disabled]="!store.canWrite()"
                    >
                      <mat-icon aria-hidden="true">edit</mat-icon>
                    </button>
                  </span>
                </article>
              } @empty {
                <div class="empty-state">No recurring plans active for this month</div>
              }
            </div>
          </article>

          <article class="panel-card mobile-one-time-plans">
            <header class="panel-heading split">
              <div>
                <h2>One-time Planned Expenses</h2>
                <p>Upcoming non-recurring spends</p>
              </div>
              <span class="badge neutral">{{ store.oneTimePlannedRows().length }} items</span>
            </header>
            <div class="mobile-plan-list">
              @for (expense of store.oneTimePlannedRows(); track expense.id) {
                <article class="mobile-plan-card">
                  <div>
                    <small>{{ store.shortDateLabel(store.recordDate(expense)) }}</small>
                    <strong>{{ expense.name }}</strong>
                  </div>
                  <span class="badge neutral">{{ expense.categoryName }}</span>
                  <b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                  <span class="badge success">{{ expense.status }}</span>
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'Edit planned expense ' + expense.name"
                    matTooltip="Edit planned expense"
                    (click)="store.openBulkEditor('monthly', 0, expense.id)"
                    [disabled]="!store.canWrite()"
                  >
                    <mat-icon aria-hidden="true">edit</mat-icon>
                  </button>
                </article>
              } @empty {
                <div class="empty-state">No one-time planned expenses</div>
              }
            </div>

            <div class="data-table-wrap compact" tabindex="0" aria-label="One-time planned expenses table">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (expense of store.oneTimePlannedRows(); track expense.id) {
                    <tr>
                      <td>{{ store.shortDateLabel(store.recordDate(expense)) }}</td>
                      <td><strong>{{ expense.name }}</strong></td>
                      <td><span class="badge neutral">{{ expense.categoryName }}</span></td>
                      <td><b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b></td>
                      <td><span class="badge success">{{ expense.status }}</span></td>
                      <td>
                        <button
                          mat-icon-button
                          type="button"
                          [attr.aria-label]="'Edit planned expense ' + expense.name"
                          matTooltip="Edit planned expense"
                          (click)="store.openBulkEditor('monthly', 0, expense.id)"
                          [disabled]="!store.canWrite()"
                        >
                          <mat-icon aria-hidden="true">edit</mat-icon>
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6"><div class="empty-state">No one-time planned expenses</div></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <div class="panel-stack mobile-hidden">
          <article class="panel-card">
            <header class="panel-heading">
              <h2>Monthly Budget Allocation</h2>
              <p>{{ store.monthlyIncome() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }} distributed across categories</p>
            </header>
            <div class="allocation-bar" aria-hidden="true">
              @for (category of store.budgetAllocationRows(); track category.id) {
                <span [style.width.%]="store.clampPercent(category.share)" [style.background]="category.color"></span>
              }
            </div>
            <div class="allocation-grid">
              @for (category of store.budgetAllocationRows(); track category.id) {
                <div>
                  <span class="dot" [style.background]="category.color" aria-hidden="true"></span>
                  {{ category.name }} {{ category.share | percent: '1.0-0' }}
                </div>
              } @empty {
                <div class="empty-state">No budgets allocated</div>
              }
            </div>
          </article>

          <article class="panel-card">
            <header class="panel-heading split">
              <div>
                <h2>Planning Timeline</h2>
                <p>Key financial events for {{ store.monthLabel() }}</p>
              </div>
              <mat-icon class="panel-icon" aria-hidden="true">schedule</mat-icon>
            </header>
            <div class="timeline-list">
              @for (event of store.planningTimelineRows(); track event.date + event.label) {
                <article class="timeline-item" [class]="event.tone">
                  <span class="timeline-dot" [style.background]="event.color" aria-hidden="true"></span>
                  <small>{{ store.monthDayLabel(event.date) }}</small>
                  <strong>{{ event.label }}</strong>
                  <b>{{ event.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                </article>
              } @empty {
                <div class="empty-state">No timeline items for this month</div>
              }
            </div>
          </article>
        </div>
      </section>
    </section>
    }
  `,
  styles: [
    `
      .plan-row-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
      }

      .mobile-plan-card button,
      .plan-row-actions button {
        flex: 0 0 auto;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningPage {
  readonly store = inject(BudgetStore);
}
