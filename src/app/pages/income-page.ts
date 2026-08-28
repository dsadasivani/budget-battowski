import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { MonthMemberControls } from '../shared/month-member-controls';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-income-page',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="planning" />
    } @else {
      <section class="page mobile-income-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Income</h1>
            <p>Track monthly and one-time income with a preserved change history.</p>
          </div>
          <div class="header-actions">
            <app-month-member-controls />
            <button
              mat-flat-button
              type="button"
              (click)="store.openIncomeEditor()"
              [disabled]="!store.canWrite()"
            >
              <mat-icon aria-hidden="true">add</mat-icon>
              Add income
            </button>
          </div>
        </header>

        <div class="mobile-page-controls mobile-filter-strip">
          <app-month-member-controls />
        </div>

        <section class="stat-grid three" aria-label="Income summary">
          <article class="stat-card">
            <span class="icon-chip green"><mat-icon aria-hidden="true">payments</mat-icon></span>
            <p>{{ store.monthLabel() }} income</p>
            <strong>{{
              store.monthlyIncome() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip blue"><mat-icon aria-hidden="true">source</mat-icon></span>
            <p>Active sources</p>
            <strong>{{ store.incomeRows().length }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip teal"><mat-icon aria-hidden="true">trending_up</mat-icon></span>
            <p>Month-over-month</p>
            <strong>{{ store.incomeGrowthRate() | percent: '1.0-1' }}</strong>
          </article>
        </section>

        <section class="content-grid two-one">
          <article class="panel-card">
            <header class="panel-heading split">
              <div>
                <h2>Income sources</h2>
                <p>Sources effective in {{ store.monthLabel() }}</p>
              </div>
              <button
                mat-icon-button
                type="button"
                aria-label="Add income"
                matTooltip="Add income"
                (click)="store.openIncomeEditor()"
                [disabled]="!store.canWrite()"
              >
                <mat-icon aria-hidden="true">add</mat-icon>
              </button>
            </header>
            <div class="data-table-wrap" tabindex="0" aria-label="Income sources table">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Category</th>
                    <th>Owner</th>
                    <th>Cadence</th>
                    <th>Amount</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (income of store.incomeRows(); track income.id) {
                    <tr>
                      <td>
                        <strong>{{ income.source }}</strong
                        ><small>{{ income.notes }}</small>
                      </td>
                      <td>
                        <span class="badge neutral">{{ income.categoryName }}</span>
                      </td>
                      <td>{{ income.memberName }}</td>
                      <td>
                        <span class="badge success">{{ income.cadence }}</span>
                      </td>
                      <td>
                        <b>{{ income.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                      </td>
                      <td>
                        <button
                          mat-icon-button
                          type="button"
                          [attr.aria-label]="'Edit income ' + income.source"
                          matTooltip="Edit income"
                          (click)="store.openIncomeEditor(income)"
                          [disabled]="!store.canWrite()"
                        >
                          <mat-icon aria-hidden="true">edit</mat-icon>
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6">
                        <div class="empty-state">No income sources for this month</div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="mobile-income-list" aria-label="Income sources">
              @for (income of store.incomeRows(); track income.id) {
                <article class="mobile-income-row">
                  <span class="income-source-icon" aria-hidden="true">
                    <mat-icon>payments</mat-icon>
                  </span>
                  <div class="income-source-copy">
                    <strong>{{ income.source }}</strong>
                    <small>{{ income.categoryName }} &middot; {{ income.memberName }}</small>
                    @if (income.notes) {
                      <small class="income-notes">{{ income.notes }}</small>
                    }
                  </div>
                  <div class="income-row-value">
                    <b>{{ income.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                    <span class="badge success">{{ income.cadence }}</span>
                  </div>
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'Edit income ' + income.source"
                    matTooltip="Edit income"
                    (click)="store.openIncomeEditor(income)"
                    [disabled]="!store.canWrite()"
                  >
                    <mat-icon aria-hidden="true">edit</mat-icon>
                  </button>
                </article>
              } @empty {
                <div class="empty-state">No income sources for this month</div>
              }
            </div>
          </article>

          <article class="panel-card">
            <header class="panel-heading">
              <h2>Income history</h2>
              <p>Last 12 months, including effective-dated changes</p>
            </header>
            <div class="income-chart" role="img" aria-label="Twelve month income history chart">
              @for (row of store.incomeHistoryRows(); track row.month) {
                <div>
                  <span>{{ row.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</span>
                  <i [style.height.%]="barHeight(row.amount)"></i>
                  <small>{{ row.label.split(' ')[0] }}</small>
                </div>
              }
            </div>
          </article>
        </section>
      </section>
    }
  `,
  styles: `
    .income-chart {
      min-height: 260px;
      display: grid;
      grid-template-columns: repeat(12, minmax(22px, 1fr));
      align-items: end;
      gap: 6px;
      overflow-x: auto;
    }
    .income-chart > div {
      height: 220px;
      display: grid;
      grid-template-rows: 24px 1fr 24px;
      align-items: end;
      text-align: center;
      min-width: 34px;
    }
    .income-chart span {
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .income-chart i {
      display: block;
      min-height: 2px;
      border-radius: 6px 6px 0 0;
      background: #10b981;
    }
    td small {
      display: block;
    }
    .mobile-income-list {
      display: none;
    }
    @media (max-width: 780px) {
      .mobile-income-page .data-table-wrap {
        display: none;
      }
      .mobile-income-list {
        display: grid;
        gap: 10px;
      }
      .mobile-income-row {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto 44px;
        align-items: center;
        gap: 10px;
        min-height: 74px;
        padding: 11px 10px 11px 12px;
        border: 1px solid var(--bb-border);
        border-radius: 18px;
        background: var(--bb-surface);
      }
      .income-source-icon {
        display: grid;
        width: 42px;
        height: 42px;
        place-items: center;
        border-radius: 14px;
        background: var(--bb-primary-soft);
        color: var(--bb-primary);
      }
      .income-source-icon mat-icon {
        width: 21px;
        height: 21px;
        font-size: 21px;
      }
      .income-source-copy,
      .income-row-value {
        min-width: 0;
      }
      .income-source-copy strong,
      .income-source-copy small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .income-source-copy strong {
        color: var(--bb-ink);
        font-size: 0.9rem;
      }
      .income-source-copy small {
        margin-top: 3px;
        color: var(--bb-muted);
        font-size: 0.72rem;
      }
      .income-source-copy .income-notes {
        margin-top: 2px;
        font-weight: 400;
      }
      .income-row-value {
        display: grid;
        justify-items: end;
        gap: 5px;
      }
      .income-row-value b {
        color: var(--bb-ink);
        font-size: 0.86rem;
        white-space: nowrap;
      }
      .income-row-value .badge {
        max-width: 92px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .income-chart {
        min-height: 230px;
        scroll-snap-type: x proximity;
      }
      .income-chart > div {
        height: 194px;
        scroll-snap-align: start;
      }
    }
    @media (max-width: 390px) {
      .mobile-income-row {
        grid-template-columns: 38px minmax(0, 1fr) auto;
      }
      .mobile-income-row > button {
        grid-column: 3;
        grid-row: 2;
        justify-self: end;
      }
      .income-row-value {
        grid-column: 3;
        grid-row: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomePage {
  readonly store = inject(BudgetStore);

  barHeight(amount: number): number {
    const maximum = Math.max(...this.store.incomeHistoryRows().map((row) => row.amount), 1);
    return Math.max(2, (amount / maximum) * 100);
  }
}
