import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { BudgetStore } from '../budget.store';
import type {
  LoanAccountDialog,
  LoanAccountDialogData,
  LoanAccountDialogResult,
} from '../loan-account-dialog';
import { MonthMemberControls } from '../shared/month-member-controls';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

@Component({
  selector: 'app-loans-page',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="loans" />
    } @else {
      <section class="page loans-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Loans</h1>
            <p>Track repayments, outstanding balances, and payoff progress.</p>
          </div>
          <div class="header-actions">
            <app-month-member-controls />
            <button
              mat-flat-button
              type="button"
              (click)="openAccountEditor()"
              [disabled]="!store.canWrite()"
            >
              <mat-icon aria-hidden="true">add</mat-icon> Add loan
            </button>
          </div>
        </header>
        <div class="mobile-page-controls mobile-filter-strip"><app-month-member-controls /></div>

        <section class="stat-grid four" aria-label="Loan portfolio summary">
          <article class="stat-card">
            <span class="icon-chip orange"><mat-icon aria-hidden="true">payments</mat-icon></span>
            <p>Current EMI / month</p>
            <strong>{{
              store.debtEmiTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip red"
              ><mat-icon aria-hidden="true">account_balance_wallet</mat-icon></span
            >
            <p>Calculated outstanding</p>
            <strong>{{
              store.totalDebt() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
            <small>As of {{ store.monthLabel() }}</small>
          </article>
          <article class="stat-card">
            <span class="icon-chip blue"><mat-icon aria-hidden="true">receipt_long</mat-icon></span>
            <p>Open accounts</p>
            <strong>{{ store.loanAccountRows().length }}</strong>
          </article>
          <article class="stat-card">
            <span class="icon-chip teal"
              ><mat-icon aria-hidden="true">event_available</mat-icon></span
            >
            <p>Portfolio closure</p>
            <strong>{{
              store.projectedLoanClosure()
                ? (store.projectedLoanClosure() | date: 'MMM y')
                : 'Needs data'
            }}</strong>
            <small>Projected, not lender-certified</small>
          </article>
        </section>

        <section class="panel-card accounts-panel" aria-labelledby="loan-accounts-title">
          <header class="panel-heading">
            <div>
              <h2 id="loan-accounts-title">Loan accounts</h2>
              <p>Review balances, repayment progress, and upcoming installments.</p>
            </div>
          </header>
          <div class="account-grid">
            @for (loan of store.loanAccountRows(); track loan.id) {
              <article
                class="account-card"
                [class.needs-attention]="loan.status === 'needs-attention'"
              >
                <header>
                  <div>
                    <h3>{{ loan.lender }}</h3>
                    <p>{{ loan.loanType }}</p>
                  </div>
                  <span class="accuracy" [class.verified]="loan.accuracy.label === 'Verified'">
                    {{ loan.accuracy.label }}
                    @if (loan.accuracy.throughDate) {
                      through {{ loan.accuracy.throughDate | date: 'mediumDate' }}
                    }
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{{ loan.outstanding | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</dd>
                    <small>Calculated</small>
                  </div>
                  <div>
                    <dt>Current EMI</dt>
                    <dd>{{ loan.emi | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</dd>
                    <small>{{ loan.annualRate | number: '1.0-2' }}% p.a.</small>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{{ loan.monthsLeft }} installments</dd>
                    <small>{{
                      loan.payoffDate
                        ? 'Projected ' + (loan.payoffDate | date: 'MMM y')
                        : 'Needs attention'
                    }}</small>
                  </div>
                </dl>
                <mat-progress-bar
                  mode="determinate"
                  [value]="store.clampPercent(loan.paidRatio)"
                  [attr.aria-label]="loan.lender + ' calculated principal repayment progress'"
                />

                <footer>
                  <a mat-flat-button [routerLink]="['/loans', loan.id]">Open account</a>
                  <button
                    mat-button
                    type="button"
                    (click)="openAccountEditor(loan.id)"
                    [disabled]="!store.canWrite()"
                  >
                    Edit account
                  </button>
                  <span>{{
                    loan.historyCoverage === 'partial' ? 'Partial history' : 'Complete history'
                  }}</span>
                </footer>
              </article>
            } @empty {
              <div class="empty-state rich-empty">
                <mat-icon aria-hidden="true">account_balance</mat-icon>
                <h2>No loans yet</h2>
                <p>
                  Add contract terms and an optional lender balance checkpoint to build your first
                  projection.
                </p>
                <button mat-flat-button type="button" (click)="openAccountEditor()">
                  Add a loan
                </button>
              </div>
            }
          </div>
        </section>

        @if (store.closedLoanAccounts().length) {
          <details class="panel-card closed-accounts">
            <summary>
              Closed and archived accounts ({{ store.closedLoanAccounts().length }})
            </summary>
            @for (account of store.closedLoanAccounts(); track account.id) {
              <a [routerLink]="['/loans', account.id]"
                >{{ account.lender }} · {{ account.loanType }}</a
              >
            }
          </details>
        }
      </section>
    }
  `,
  styles: `
    .accounts-panel {
      margin-top: 20px;
    }
    .account-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .account-card {
      border: 1px solid #dbe3ec;
      border-radius: 16px;
      padding: 20px;
      background: #fff;
    }
    .account-card.needs-attention {
      border-color: #f59e0b;
    }
    .account-card > header,
    .account-card footer {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .account-card h3 {
      margin: 4px 0 0;
      font-size: 1.2rem;
    }
    .account-card header p {
      margin: 2px 0;
      color: #64748b;
    }
    .accuracy {
      border-radius: 999px;
      padding: 5px 9px;
      color: #854d0e;
      background: #fef3c7;
      font-size: 0.75rem;
      font-weight: 700;
      text-align: right;
    }
    .accuracy.verified {
      color: #166534;
      background: #dcfce7;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 22px 0;
    }
    dt,
    small {
      color: #64748b;
      font-size: 0.75rem;
    }
    dd {
      margin: 4px 0;
      color: #0f172a;
      font-weight: 800;
    }
    .account-card footer {
      align-items: center;
      margin-top: 18px;
    }
    .account-card footer span {
      color: #64748b;
      font-size: 0.78rem;
    }
    .rich-empty {
      grid-column: 1 / -1;
      padding: 56px 20px;
      text-align: center;
    }
    .rich-empty mat-icon {
      width: 42px;
      height: 42px;
      font-size: 42px;
      color: #64748b;
    }
    .closed-accounts {
      margin-top: 16px;
    }
    .closed-accounts summary {
      cursor: pointer;
      font-weight: 700;
    }
    .closed-accounts a {
      display: block;
      margin-top: 12px;
    }
    @media (max-width: 900px) {
      .account-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 560px) {
      dl {
        grid-template-columns: 1fr 1fr;
      }
      .account-card > header {
        flex-direction: column;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoansPage {
  readonly store = inject(BudgetStore);
  private readonly dialog = inject(MatDialog);

  async openAccountEditor(accountId?: string): Promise<void> {
    const { LoanAccountDialog: dialogComponent } = await import('../loan-account-dialog');
    const data: LoanAccountDialogData = {
      account: accountId ? this.store.loanAccount(accountId) : undefined,
      events: accountId
        ? this.store.loanEvents().filter((event) => event.loanId === accountId)
        : [],
      memberEmail: this.store.actingMemberEmail(),
      paymentModes: this.store.activePaymentModes(),
    };
    const result = await firstValueFrom(
      this.dialog
        .open<LoanAccountDialog, LoanAccountDialogData, LoanAccountDialogResult>(dialogComponent, {
          autoFocus: 'first-tabbable',
          data,
          maxHeight: '94dvh',
          maxWidth: '96vw',
          width: 'min(900px, 96vw)',
        })
        .afterClosed(),
    );
    if (result) {
      const saved = await this.store.saveLoanAccount(
        result.account,
        result.openingAnchor,
        result.assumeHistoricalEmisPaid,
      );
      let ledgerReady = saved;
      if (saved && result.matchingPartPayment) {
        ledgerReady = await this.store.recordLoanEvent(result.matchingPartPayment);
      }
      if (ledgerReady) {
        for (const reconciliation of result.lenderReconciliations ?? []) {
          await this.store.reconcileLoan({
            loanId: result.account.id,
            ...reconciliation,
            sourceKind: 'repayment-schedule',
          });
        }
      }
    }
  }
}
