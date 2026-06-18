import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { MonthMemberControls } from '../shared/month-member-controls';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-investments-page',
  imports: [
    CommonModule,
    NgOptimizedImage,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="investments" />
    } @else {
    <section class="page mobile-investments-page">
      <header class="mobile-page-hero investments-hero">
        <div class="mobile-title-row">
          <div>
            <h1>Investments</h1>
            <p>Track SIPs, mutual funds, and long-term wealth</p>
          </div>
          <button
            mat-flat-button
            type="button"
            (click)="store.openBulkEditor('planning', 2)"
            [disabled]="!store.canWrite()"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
            Add Investment
          </button>
        </div>
      </header>

      <div class="mobile-member-tabs">
        <app-month-member-controls />
      </div>

      <header class="page-header desktop-page-header">
        <div>
          <h1>Investments</h1>
          <p>Track SIPs, mutual funds, and long-term wealth.</p>
        </div>
        <div class="header-actions">
          <app-month-member-controls />
        </div>
      </header>

      <section class="stat-grid" [class.three]="!store.hasMonthlyReviewRows()">
        @if (store.hasMonthlyReviewRows()) {
          <article class="stat-card">
            <span class="icon-chip blue"><mat-icon aria-hidden="true">fact_check</mat-icon></span>
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
          <span class="icon-chip teal"><mat-icon aria-hidden="true">trending_up</mat-icon></span>
          <p>Total Invested</p>
          <strong>{{ store.investmentTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
          <small>This month</small>
        </article>
        <article class="stat-card">
          <span class="icon-chip green"><mat-icon aria-hidden="true">functions</mat-icon></span>
          <p>Derived Tracking</p>
          <strong>{{ store.portfolioRows().length }}</strong>
          <small>Active plans</small>
        </article>
        <article class="stat-card">
          <span class="icon-chip blue"><mat-icon aria-hidden="true">work</mat-icon></span>
          <p>Scheduled Total</p>
          <strong>{{ store.portfolioValue() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
          <small>Derived from plan history</small>
        </article>
      </section>

      <section class="content-grid two-one">
        <article class="panel-card mobile-portfolio-panel">
          <header class="panel-heading split">
            <div>
              <h2>Investment Portfolio</h2>
              <p>All active SIPs and investments</p>
            </div>
            <div class="table-actions">
              <label class="search-box">
                <mat-icon aria-hidden="true">search</mat-icon>
                <span class="sr-only">Search investments</span>
                <input
                  type="search"
                  placeholder="Search investments"
                  [value]="query()"
                  (input)="setQuery($event)"
                />
              </label>
              <button
                mat-flat-button
                type="button"
                (click)="store.openBulkEditor('planning', 2)"
                [disabled]="!store.canWrite()"
              >
                <mat-icon aria-hidden="true">add</mat-icon>
                Add Investment
              </button>
            </div>
          </header>

          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Member</th>
                  <th>Paid via</th>
                  <th>Monthly</th>
                  <th>Total Invested</th>
                  <th>Status</th>
                  <th><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (investment of filteredRows(); track investment.id) {
                  <tr>
                    <td><strong>{{ investment.name }}</strong></td>
                    <td><span class="badge neutral">{{ investment.categoryName }}</span></td>
                    <td>
                      <span class="avatar mini">{{ investment.memberInitial }}</span>
                      {{ investment.memberName }}
                    </td>
                    <td>
                      @if (investment.paymentModeMeta; as paymentMode) {
                        <span class="payment-mode-badge {{ paymentMode.tone }}">
                          <img [ngSrc]="paymentMode.iconSrc" width="18" height="18" alt="" />
                          {{ paymentMode.label }}
                        </span>
                      } @else {
                        <span class="badge neutral">Not set</span>
                      }
                    </td>
                    <td><b>{{ investment.monthlyAmount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b></td>
                    <td>{{ investment.totalInvested | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</td>
                    <td><span class="badge success">{{ store.investmentFrequencyLabel(investment) }}</span></td>
                    <td>
                      <button
                        mat-icon-button
                        type="button"
                        aria-label="Edit investments"
                        matTooltip="Edit investments"
                        (click)="store.openBulkEditor('planning', 2)"
                        [disabled]="!store.canWrite()"
                      >
                        <mat-icon aria-hidden="true">edit</mat-icon>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8"><div class="empty-state">No investments match this view</div></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </article>

        <div class="panel-stack">
          <article class="panel-card mobile-hidden">
            <header class="panel-heading split">
              <div>
                <h2>Returns Overview</h2>
                <p>Monthly invested amount, derived from plans</p>
              </div>
              <mat-icon class="panel-icon" aria-hidden="true">bar_chart</mat-icon>
            </header>
            <div class="bar-chart" aria-label="Six month investment amounts">
              @for (row of store.trendRows(); track row.month) {
                <div>
                  <span>{{ row.invested | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</span>
                  <i [style.height.%]="barHeight(row.invested)"></i>
                  <b>{{ row.label.split(' ')[0] }}</b>
                </div>
              }
            </div>
          </article>

          <article class="panel-card mobile-member-allocation-panel">
            <header class="panel-heading split">
              <div>
                <h2>Member Allocation</h2>
                <p>Monthly SIP distribution</p>
              </div>
              <mat-icon class="panel-icon" aria-hidden="true">group</mat-icon>
            </header>
            <div class="progress-list">
              @for (member of store.investmentMemberAllocationRows(); track member.memberEmail) {
                <article class="member-progress">
                  <div>
                    <span class="avatar mini">{{ member.initial }}</span>
                    <strong>{{ member.name }}</strong>
                    <b>{{ member.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}/mo</b>
                  </div>
                  <mat-progress-bar
                    mode="determinate"
                    [value]="store.clampPercent(member.share)"
                    [attr.aria-label]="member.name + ' investment allocation'"
                  ></mat-progress-bar>
                </article>
              } @empty {
                <div class="empty-state">No allocation data yet</div>
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
export class InvestmentsPage {
  readonly store = inject(BudgetStore);
  readonly query = signal('');
  readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.store.portfolioRows();
    }

    return this.store.portfolioRows().filter((investment) =>
      [investment.name, investment.categoryName, investment.memberName]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });
  readonly maxInvested = computed(() =>
    Math.max(1, ...this.store.trendRows().map((row) => row.invested)),
  );

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  barHeight(amount: number): number {
    return Math.max(8, (amount / this.maxInvested()) * 100);
  }
}
