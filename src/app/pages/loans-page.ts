import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-loans-page',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="loans" />
    } @else {
    <section class="page mobile-loans-page">
      <header class="mobile-page-hero compact-hero">
        <div class="mobile-title-row">
          <div class="mobile-title-with-icon">
            <span class="mobile-page-mark" aria-hidden="true">
              <mat-icon>account_balance</mat-icon>
            </span>
            <h1>Loans</h1>
          </div>
          <button
            mat-flat-button
            type="button"
            (click)="store.openBulkEditor('loans')"
            [disabled]="!store.canWrite()"
          >
            <mat-icon aria-hidden="true">add</mat-icon>
            Add Loan
          </button>
        </div>
      </header>

      <header class="page-header desktop-page-header">
        <div>
          <h1>Loans</h1>
          <p>Manage EMIs, outstanding balances, and repayment progress.</p>
        </div>
        <button
          mat-flat-button
          type="button"
          (click)="store.openBulkEditor('loans')"
          [disabled]="!store.canWrite()"
        >
          <mat-icon aria-hidden="true">add</mat-icon>
          Add Loan
        </button>
      </header>

      <section class="stat-grid four">
        <article class="stat-card">
          <span class="icon-chip orange"><mat-icon aria-hidden="true">account_balance</mat-icon></span>
          <p>Total EMI/Month</p>
          <strong>{{ store.debtEmiTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip red"><mat-icon aria-hidden="true">error_outline</mat-icon></span>
          <p>Total Outstanding</p>
          <strong>{{ store.totalDebt() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip blue"><mat-icon aria-hidden="true">article</mat-icon></span>
          <p>Loans Active</p>
          <strong>{{ store.activeLoans().length }}</strong>
        </article>
        <article class="stat-card">
          <span class="icon-chip teal"><mat-icon aria-hidden="true">event_available</mat-icon></span>
          <p>Projected Closure</p>
          <strong>{{ store.projectedLoanClosure() ? (store.projectedLoanClosure() | date: 'MMM y') : 'Not set' }}</strong>
        </article>
      </section>

      <section class="content-grid two-one">
        <article class="panel-card">
          <header class="panel-heading">
            <h2>Loan Accounts</h2>
            <p>Track principal, outstanding balance, and repayment progress</p>
          </header>
          <div class="loan-list">
            @for (loan of store.loanRepaymentRows(); track loan.id) {
              <article class="loan-account">
                <div>
                  <strong>{{ loan.lender }}</strong>
                  <span class="badge neutral">{{ loan.loanType }}</span>
                </div>
                <div>
                  <small>Principal</small>
                  <b>{{ loan.principal | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                </div>
                <div>
                  <small>Outstanding</small>
                  <b>{{ loan.outstanding | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                </div>
                <div>
                  <small>EMI</small>
                  <b>{{ loan.emi | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}/mo</b>
                </div>
                <div>
                  <small>{{ loan.monthsLeft }} months left</small>
                  <mat-progress-bar
                    mode="determinate"
                    [value]="store.clampPercent(loan.paidRatio)"
                    [attr.aria-label]="loan.lender + ' paid percentage'"
                  ></mat-progress-bar>
                </div>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Edit loans"
                  matTooltip="Edit loans"
                  (click)="store.openBulkEditor('loans')"
                  [disabled]="!store.canWrite()"
                >
                  <mat-icon aria-hidden="true">edit</mat-icon>
                </button>
              </article>
            } @empty {
              <div class="empty-state">No loans saved</div>
            }
          </div>
        </article>

        <div class="panel-stack">
          <article class="panel-card mobile-hidden">
            <header class="panel-heading">
              <h2>EMI Calendar</h2>
              <p>{{ store.monthLabel() }} due dates and payment reminders</p>
            </header>
            <div class="calendar-grid" aria-label="Loan EMI calendar">
              @for (dayName of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; track dayName) {
                <strong>{{ dayName }}</strong>
              }
              @for (day of store.loanCalendarDays(); track day.date) {
                <div class="calendar-day" [class.has-items]="day.items.length">
                  <span>{{ day.day }}</span>
                  @for (item of day.items; track item.id) {
                    <i [style.background]="item.color" [attr.aria-label]="item.label"></i>
                  }
                </div>
              }
            </div>
            <div class="calendar-legend">
              @for (loan of store.loanRepaymentRows(); track loan.id) {
                <span><i [style.background]="loan.color"></i> {{ loan.lender }} {{ loan.emi | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</span>
              }
            </div>
          </article>

          <article class="panel-card">
            <header class="panel-heading">
              <h2>Repayment Summary</h2>
              <p>Monthly EMI distribution by loan</p>
            </header>
            <div class="donut-layout single">
              <div
                class="donut-chart"
                [style.background]="loanDonutStyle()"
                role="img"
                [attr.aria-label]="'Monthly EMI total ' + store.formatMoney(store.debtEmiTotal())"
              >
                <span>Total<br /><b>{{ store.debtEmiTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}/mo</b></span>
              </div>
            </div>
            <div class="summary-list">
              @for (loan of store.loanRepaymentRows(); track loan.id) {
                <div>
                  <span><i [style.background]="loan.color"></i>{{ loan.lender }}</span>
                  <b>{{ loan.emi | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</b>
                </div>
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
export class LoansPage {
  readonly store = inject(BudgetStore);

  loanDonutStyle(): string {
    const loans = this.store.loanRepaymentRows();
    const total = this.store.debtEmiTotal();
    if (!total) {
      return 'conic-gradient(#d7dee8 0 100%)';
    }

    let cursor = 0;
    const stops = loans.map((loan) => {
      const start = cursor;
      cursor += loan.share * 100;
      return `${loan.color} ${start}% ${cursor}%`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  }
}
