import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { MonthMemberControls } from '../shared/month-member-controls';

@Component({
  selector: 'app-expenses-page',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    MonthMemberControls,
  ],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Monthly Expenses</h1>
          <p>Track recurring and one-time spending across members.</p>
        </div>
        <div class="header-actions">
          <app-month-member-controls />
        </div>
      </header>

      <section class="stat-grid three" aria-label="Expense summary">
        <article class="stat-card">
          <span class="icon-chip red"><mat-icon aria-hidden="true">credit_card</mat-icon></span>
          <p>Total Expenses</p>
          <strong>{{ store.outflowTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip orange"><mat-icon aria-hidden="true">sync</mat-icon></span>
          <p>Recurring</p>
          <strong>{{ store.recurringTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip purple"><mat-icon aria-hidden="true">shopping_bag</mat-icon></span>
          <p>One-time</p>
          <strong>{{ store.oneTimeTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
      </section>

      <section class="content-grid two-one">
        <article class="panel-card">
          <header class="panel-heading split">
            <div>
              <h2>All Expenses</h2>
              <p>Search, review, and manage monthly transactions</p>
            </div>
            <div class="table-actions">
              <label class="search-box">
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

          <div class="data-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (expense of filteredRows(); track expense.id) {
                  <tr>
                    <td>{{ expense.dayLabel }}</td>
                    <td><strong>{{ expense.name }}</strong></td>
                    <td>
                      <span class="badge" [style.color]="expense.categoryColor">
                        {{ expense.categoryName }}
                      </span>
                    </td>
                    <td><span class="avatar mini">{{ expense.memberInitial }}</span></td>
                    <td><b>{{ expense.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b></td>
                    <td><span class="badge neutral">{{ expense.typeLabel }}</span></td>
                    <td>
                      <button
                        mat-icon-button
                        type="button"
                        aria-label="Edit expenses"
                        matTooltip="Edit expenses"
                        (click)="store.openBulkEditor('monthly')"
                        [disabled]="!store.canWrite()"
                      >
                        <mat-icon aria-hidden="true">edit</mat-icon>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7"><div class="empty-state">No expenses match this view</div></td>
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
                <span>Total<br /><b>{{ store.outflowTotal() | currency: 'INR' : 'symbol' : '1.1-1' : 'en-IN' }}</b></span>
              </div>
              <div class="legend-list">
                @for (category of store.spendingBreakdownRows(); track category.id) {
                  <div>
                    <span class="dot" [style.background]="category.color" aria-hidden="true"></span>
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesPage {
  readonly store = inject(BudgetStore);
  readonly query = signal('');
  readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.store.expenseRows();
    }

    return this.store.expenseRows().filter((expense) =>
      [expense.name, expense.categoryName, expense.memberName, expense.typeLabel]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  });

  setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
