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
  selector: 'app-expenses-page',
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
      <app-page-skeleton variant="expenses" />
    } @else {
      <section class="page mobile-expenses-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Monthly Expenses</h1>
            <p>Track recurring and one-time spending across members.</p>
          </div>
          <div class="header-actions">
            <app-month-member-controls />
          </div>
        </header>

        <div class="mobile-page-controls mobile-filter-strip">
          <app-month-member-controls />
        </div>

        <section
          class="stat-grid"
          [class.three]="!store.hasMonthlyReviewRows()"
          aria-label="Expense summary"
        >
          @if (store.hasMonthlyReviewRows()) {
            <article class="stat-card review-stat-card">
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
          <article class="stat-card expense-total-card">
            <span class="icon-chip red"><mat-icon aria-hidden="true">credit_card</mat-icon></span>
            <p>Total Expenses</p>
            <strong>{{
              store.outflowTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card recurring-total-card">
            <span class="icon-chip orange"><mat-icon aria-hidden="true">sync</mat-icon></span>
            <p>Recurring</p>
            <strong>{{
              store.recurringTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card one-time-total-card">
            <span class="icon-chip purple"
              ><mat-icon aria-hidden="true">shopping_bag</mat-icon></span
            >
            <p>One-time</p>
            <strong>{{
              store.oneTimeTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
        </section>

        <label class="search-box mobile-search-box mobile-transaction-search">
          <mat-icon aria-hidden="true">search</mat-icon>
          <span class="sr-only">Search expenses</span>
          <input
            type="search"
            placeholder="Search transactions"
            [value]="query()"
            (input)="setQuery($event)"
          />
        </label>

        <section class="content-grid two-one">
          <article class="panel-card">
            <header class="panel-heading split">
              <div>
                <h2>Recent Transactions</h2>
                <p>Search, review, and manage monthly transactions</p>
              </div>
              <div class="table-actions">
                <label class="search-box desktop-search-box">
                  <mat-icon aria-hidden="true">search</mat-icon>
                  <span class="sr-only">Search expenses</span>
                  <input
                    type="search"
                    placeholder="Search expenses"
                    [value]="query()"
                    (input)="setQuery($event)"
                  />
                </label>
                <button
                  mat-flat-button
                  type="button"
                  (click)="store.openBulkEditor('monthly')"
                  [disabled]="!store.canWrite()"
                >
                  <mat-icon aria-hidden="true">add</mat-icon>
                  Add Expense
                </button>
              </div>
            </header>

            <div class="mobile-expense-list">
              @for (expense of visibleRows(); track expense.id) {
                <article class="mobile-expense-row">
                  <span>{{ expense.dayLabel }}</span>
                  <strong>{{ expense.name }}</strong>
                  <span class="badge">
                    <span
                      class="dot"
                      [style.background]="expense.categoryColor"
                      aria-hidden="true"
                    ></span>
                    {{ expense.categoryName }}
                  </span>
                  <b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                  <span class="badge neutral">
                    {{ expense.typeLabel === 'recurring' ? 'Recur' : '1x' }}
                  </span>
                  @if (expense.paymentModeMeta; as paymentMode) {
                    <span class="payment-mode-badge mobile-payment-mode-tag {{ paymentMode.tone }}">
                      <img [ngSrc]="paymentMode.iconSrc" width="18" height="18" alt="" />
                      {{ paymentMode.label }}
                    </span>
                  }
                </article>
              } @empty {
                <div class="empty-state">No expenses match this view</div>
              }
              @if (filteredRows().length > 6) {
                <button class="mobile-view-all" type="button" (click)="toggleExpenseRows()">
                  {{ showAllRows() ? 'Show fewer expenses' : 'View all expenses' }}
                  <mat-icon aria-hidden="true">{{
                    showAllRows() ? 'expand_less' : 'expand_more'
                  }}</mat-icon>
                </button>
              }
            </div>

            <div class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Paid via</th>
                    <th>Type</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (expense of filteredRows(); track expense.id) {
                    <tr>
                      <td>{{ expense.dayLabel }}</td>
                      <td>
                        <strong>{{ expense.name }}</strong>
                      </td>
                      <td>
                        <span class="badge">
                          <span
                            class="dot"
                            [style.background]="expense.categoryColor"
                            aria-hidden="true"
                          ></span>
                          {{ expense.categoryName }}
                        </span>
                      </td>
                      <td>
                        <b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                      </td>
                      <td>
                        @if (expense.paymentModeMeta; as paymentMode) {
                          <span class="payment-mode-badge {{ paymentMode.tone }}">
                            <img [ngSrc]="paymentMode.iconSrc" width="18" height="18" alt="" />
                            {{ paymentMode.label }}
                          </span>
                        } @else {
                          <span class="badge neutral">Not set</span>
                        }
                      </td>
                      <td>
                        <span class="badge neutral">{{ expense.typeLabel }}</span>
                      </td>
                      <td>
                        <button
                          mat-icon-button
                          type="button"
                          [attr.aria-label]="'Edit expense ' + expense.name"
                          matTooltip="Edit expense"
                          (click)="store.openBulkEditor('monthly', 0, expense.id)"
                          [disabled]="!store.canWrite()"
                        >
                          <mat-icon aria-hidden="true">edit</mat-icon>
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7">
                        <div class="empty-state">No expenses match this view</div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </article>

          <div class="panel-stack">
            <article class="panel-card">
              <header class="panel-heading split">
                <div>
                  <h2>Spending by Category</h2>
                  <p>{{ store.monthLabel() }} distribution overview</p>
                </div>
                <mat-icon class="panel-icon" aria-hidden="true">pie_chart</mat-icon>
              </header>
              <div class="donut-layout">
                <div
                  class="donut-chart"
                  [style.background]="store.donutStyle()"
                  role="img"
                  [attr.aria-label]="'Expense total ' + store.formatMoney(store.outflowTotal())"
                >
                  <span
                    >Total<br /><b>{{
                      store.outflowTotal() | currency: 'INR' : 'symbol' : '1.1-1' : 'en-IN'
                    }}</b></span
                  >
                </div>
                <div class="legend-list">
                  @for (category of store.spendingBreakdownRows(); track category.id) {
                    <div>
                      <span
                        class="dot"
                        [style.background]="category.color"
                        aria-hidden="true"
                      ></span>
                      <strong>{{ category.name }}</strong>
                      <b>{{ category.share | percent: '1.0-0' }}</b>
                    </div>
                  }
                </div>
              </div>
            </article>

            <article class="panel-card">
              <header class="panel-heading split">
                <div>
                  <h2>Top Spenders</h2>
                  <p>Member-wise monthly totals</p>
                </div>
                <mat-icon class="panel-icon" aria-hidden="true">group</mat-icon>
              </header>
              <div class="progress-list">
                @for (member of store.topSpenders(); track member.memberEmail) {
                  <article class="member-progress">
                    <div>
                      <span class="avatar mini">{{ member.initial }}</span>
                      <strong>{{ member.name }}</strong>
                      <b>{{ member.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                    </div>
                    <mat-progress-bar
                      mode="determinate"
                      [value]="store.clampPercent(member.share)"
                      [attr.aria-label]="member.name + ' spending share'"
                    ></mat-progress-bar>
                  </article>
                } @empty {
                  <div class="empty-state">No spender data yet</div>
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
export class ExpensesPage {
  readonly store = inject(BudgetStore);
  readonly query = signal('');
  readonly showAllRows = signal(false);
  readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.store.expenseRows();
    }

    return this.store
      .expenseRows()
      .filter((expense) =>
        [expense.name, expense.categoryName, expense.typeLabel]
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
  });
  readonly visibleRows = computed(() =>
    this.showAllRows() ? this.filteredRows() : this.filteredRows().slice(0, 6),
  );

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  toggleExpenseRows(): void {
    this.showAllRows.update((show) => !show);
  }
}
