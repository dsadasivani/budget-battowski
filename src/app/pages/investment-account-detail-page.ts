import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { BudgetStore } from '../budget.store';
import type {
  InvestmentAccount,
  InvestmentTransactionSource,
  InvestmentTransactionType,
} from '../domain/investments/investment.models';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';
import { InvestmentStore } from '../stores/investment.store';
import type { WorkspaceConfirmData, WorkspaceConfirmDialog } from '../workspace-form-dialog';
import {
  InvestmentEditDialog,
  InvestmentTransactionDialog,
  RecurringPlanDialog,
} from './investment-detail-page';

@Component({
  selector: 'app-investment-account-detail-page',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, AppPageSkeletonComponent],
  template: `
    @if (showSkeleton()) {
      <app-page-skeleton variant="investmentDetail" />
    } @else {
      <section class="page narrow mobile-investment-detail-page investment-detail-page">
        <a routerLink="/investments" class="back-link">
          <mat-icon aria-hidden="true">arrow_back</mat-icon>
          Back to investments
        </a>

        @if (account(); as item) {
          <header
            class="detail-header panel-card"
            [class.stocks]="item.type === 'STOCK'"
            [class.funds]="item.type === 'MUTUAL_FUND'"
            [class.nps]="item.type === 'NPS'"
            [class.ppf]="item.type === 'PPF'"
            [class.ssy]="item.type === 'SSY'"
          >
            <div class="account-heading">
              <span class="account-type-icon" aria-hidden="true">
                <mat-icon>{{ typeIcon(item) }}</mat-icon>
              </span>
              <div>
                <div class="account-labels">
                  <span class="type-label">{{ typeLabel(item) }}</span>
                  <span class="status-label" [class.closed]="item.status === 'CLOSED'">
                    <span aria-hidden="true"></span>
                    {{ item.status === 'ACTIVE' ? 'Active' : 'Closed' }}
                  </span>
                </div>
                <h1>{{ item.name }}</h1>
                <p>{{ accountSubtitle(item) }}</p>
              </div>
            </div>

            <div class="detail-actions">
              <button mat-flat-button type="button" (click)="addTransaction(item, false)">
                <mat-icon aria-hidden="true">add</mat-icon>
                {{ addLabel(item) }}
              </button>
              <button mat-stroked-button type="button" (click)="addTransaction(item, true)">
                <mat-icon aria-hidden="true">remove</mat-icon>
                {{ liquidationLabel(item) }}
              </button>
              <button mat-stroked-button type="button" (click)="edit(item)">
                <mat-icon aria-hidden="true">edit</mat-icon>
                Edit
              </button>
              <button
                mat-stroked-button
                class="delete-action"
                type="button"
                [attr.aria-label]="'Delete ' + item.name"
                (click)="deleteInvestment(item)"
                [disabled]="
                  investments.deletingAccountId() === item.id || !investments.canDelete(item)
                "
              >
                <mat-icon aria-hidden="true">delete</mat-icon>
                {{ investments.deletingAccountId() === item.id ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
          </header>

          @if (deleteError()) {
            <p class="delete-error" role="alert">{{ deleteError() }}</p>
          }

          @if (item.needsInstrumentMapping) {
            <div class="mapping-notice" role="status">
              <mat-icon aria-hidden="true">link_off</mat-icon>
              <div>
                <strong>Live values aren’t connected</strong>
                <span
                  >Edit this account and map its market instrument to enable provider values.</span
                >
              </div>
              <button mat-button type="button" (click)="edit(item)">Connect instrument</button>
            </div>
          }

          <section class="stat-grid four detail-summary" aria-label="Investment account summary">
            <article class="stat-card primary-stat">
              <span class="icon-chip blue"><mat-icon aria-hidden="true">payments</mat-icon></span>
              <p>Current value</p>
              <strong>{{
                investments.display(item.summary.currentValue)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>{{ valuationStatus(item) }}</small>
            </article>

            <article class="stat-card">
              <span class="icon-chip purple">
                <mat-icon aria-hidden="true">account_balance_wallet</mat-icon>
              </span>
              <p>{{ item.status === 'CLOSED' ? 'Lifetime invested' : 'Amount invested' }}</p>
              <strong>{{
                investments.display(
                  item.status === 'CLOSED'
                    ? item.summary.totalContributions
                    : item.summary.remainingCostBasis
                ) | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>Remaining cost basis</small>
            </article>

            <article
              class="stat-card return-stat"
              [class.loss]="investments.display(item.summary.overallReturnAmount) < 0"
            >
              <span class="icon-chip green">
                <mat-icon aria-hidden="true">{{
                  investments.display(item.summary.overallReturnAmount) < 0
                    ? 'trending_down'
                    : 'moving'
                }}</mat-icon>
              </span>
              <p>Overall return</p>
              <strong>{{
                investments.display(item.summary.overallReturnAmount)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>
                {{ investments.display(item.summary.overallReturnPercentage) | number: '1.1-2' }}%
                since inception
              </small>
            </article>

            <article class="stat-card">
              <span class="icon-chip teal">
                <mat-icon aria-hidden="true">{{ holdingIcon(item) }}</mat-icon>
              </span>
              <p>{{ holdingLabel(item) }}</p>
              <strong>{{ holdingValue(item) }}</strong>
              <small>{{ holdingHint(item) }}</small>
            </article>
          </section>

          <section class="detail-layout">
            <article class="panel-card transaction-ledger" aria-labelledby="transactions-title">
              <header class="panel-heading split">
                <div>
                  <h2 id="transactions-title">
                    <mat-icon class="panel-icon" aria-hidden="true">receipt_long</mat-icon>
                    Transactions
                  </h2>
                  <p>{{ transactions().length }} recorded after the opening snapshot.</p>
                </div>
                <button mat-button type="button" (click)="addTransaction(item, false)">
                  <mat-icon aria-hidden="true">add</mat-icon>
                  Add
                </button>
              </header>

              <div class="ledger-list">
                @for (transaction of transactions(); track transaction.id) {
                  <article class="transaction-row">
                    <span
                      class="transaction-icon"
                      [class.withdrawal]="isWithdrawal(transaction.type)"
                      aria-hidden="true"
                    >
                      <mat-icon>{{
                        isWithdrawal(transaction.type) ? 'north_east' : 'south_west'
                      }}</mat-icon>
                    </span>
                    <div class="transaction-name">
                      <strong>{{ transactionLabel(transaction.type) }}</strong>
                      <small>
                        {{ transaction.date | date: 'mediumDate' }} ·
                        {{ transactionSourceLabel(transaction.source) }}
                      </small>
                    </div>
                    @if (transaction.quantity || transaction.units) {
                      <span class="transaction-units">
                        {{ transaction.quantity || transaction.units }}
                        {{ item.type === 'STOCK' ? 'shares' : 'units' }}
                      </span>
                    }
                    <b [class.withdrawal-value]="isWithdrawal(transaction.type)">
                      {{ isWithdrawal(transaction.type) ? '−' : '+'
                      }}{{
                        investments.display(transaction.amount)
                          | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                      }}
                    </b>
                  </article>
                } @empty {
                  <div class="empty-ledger">
                    <span aria-hidden="true"><mat-icon>receipt_long</mat-icon></span>
                    <strong>No transactions yet</strong>
                    <p>Add the first transaction after this account’s opening snapshot.</p>
                    <button mat-stroked-button type="button" (click)="addTransaction(item, false)">
                      {{ addLabel(item) }}
                    </button>
                  </div>
                }
              </div>
            </article>

            <aside class="detail-sidebar" aria-label="Investment account details">
              @if (item.type !== 'STOCK') {
                <article class="panel-card recurring-plan">
                  <header>
                    <span class="side-icon blue" aria-hidden="true"
                      ><mat-icon>autorenew</mat-icon></span
                    >
                    <div>
                      <h2>Recurring plan</h2>
                      <p>Commitment only; transactions are recorded separately.</p>
                    </div>
                  </header>
                  @if (item.recurringPlan?.enabled) {
                    <div class="plan-value">
                      <strong>{{
                        investments.display(investments.recurringPlanDisplayAmount(item))
                          | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                      }}</strong>
                      @if (investments.recurringPlanIsUpcoming(item)) {
                        <span>
                          Starts {{ item.recurringPlan?.startDate | date: 'mediumDate' }} · then
                          every {{ cadence(item.recurringPlan?.frequency) }}
                        </span>
                      } @else {
                        <span>every {{ cadence(item.recurringPlan?.frequency) }}</span>
                      }
                    </div>
                    @if (item.recurringPlan?.stepUp?.enabled) {
                      <span class="plan-badge"
                        >Step-up every {{ cadence(item.recurringPlan?.stepUp?.frequency) }}</span
                      >
                    }
                  } @else {
                    <div class="plan-empty">
                      <strong>No recurring plan</strong>
                      <span>Add one to track future commitments.</span>
                    </div>
                  }
                  <button mat-stroked-button type="button" (click)="editPlan(item)">
                    <mat-icon aria-hidden="true">edit_calendar</mat-icon>
                    {{ item.recurringPlan?.enabled ? 'Edit plan' : 'Set up plan' }}
                  </button>
                </article>
              }

              <article class="panel-card performance-panel">
                <header>
                  <span class="side-icon green" aria-hidden="true"
                    ><mat-icon>monitoring</mat-icon></span
                  >
                  <div>
                    <h2>Return breakdown</h2>
                    <p>Realized and current market movement.</p>
                  </div>
                </header>
                <dl>
                  <div>
                    <dt>Realized return</dt>
                    <dd [class.negative]="investments.display(item.summary.realizedReturn) < 0">
                      {{
                        investments.display(item.summary.realizedReturn)
                          | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>Unrealized return</dt>
                    <dd [class.negative]="investments.display(item.summary.unrealizedReturn) < 0">
                      {{
                        investments.display(item.summary.unrealizedReturn)
                          | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                      }}
                    </dd>
                  </div>
                </dl>
              </article>

              <article class="panel-card account-details">
                <header>
                  <span class="side-icon slate" aria-hidden="true"><mat-icon>info</mat-icon></span>
                  <div>
                    <h2>Account details</h2>
                    <p>Instrument and valuation information.</p>
                  </div>
                </header>
                <dl>
                  <div>
                    <dt>Investment type</dt>
                    <dd>{{ typeLabel(item) }}</dd>
                  </div>
                  <div>
                    <dt>Institution</dt>
                    <dd>{{ item.institution || 'Not specified' }}</dd>
                  </div>
                  <div>
                    <dt>Valuation</dt>
                    <dd>{{ valuationStatus(item) }}</dd>
                  </div>
                  @if (item.summary.valuationDate) {
                    <div>
                      <dt>Value date</dt>
                      <dd>{{ item.summary.valuationDate | date: 'mediumDate' }}</dd>
                    </div>
                  }
                  @if (item.openingSnapshot?.asOfDate) {
                    <div>
                      <dt>Opening snapshot</dt>
                      <dd>{{ item.openingSnapshot?.asOfDate | date: 'mediumDate' }}</dd>
                    </div>
                  }
                </dl>
              </article>
            </aside>
          </section>
        } @else {
          <section class="panel-card missing-account">
            <mat-icon aria-hidden="true">search_off</mat-icon>
            <h1>Investment not found</h1>
            <p>This account may have been removed or is no longer available.</p>
            <a mat-flat-button routerLink="/investments">Return to investments</a>
          </section>
        }
      </section>
    }
  `,
  styles: `
    .investment-detail-page {
      margin-inline: auto;
    }

    .back-link {
      display: inline-flex;
      width: fit-content;
      min-height: 36px;
      align-items: center;
      gap: 6px;
      color: #475569;
      font-size: 0.82rem;
      font-weight: 650;
      text-decoration: none;
    }

    .back-link:hover {
      color: var(--bb-primary);
    }

    .back-link mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }

    .detail-header {
      --type-color: #2f80ed;
      --type-soft: #eaf4ff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }

    .detail-header.funds {
      --type-color: #7c3aed;
      --type-soft: #f3e8ff;
    }

    .detail-header.nps {
      --type-color: #0f766e;
      --type-soft: #e6fbf7;
    }

    .detail-header.ppf {
      --type-color: #c2410c;
      --type-soft: #fff5e8;
    }

    .detail-header.ssy {
      --type-color: #be123c;
      --type-soft: #fff0f3;
    }

    .account-heading,
    .account-labels,
    .detail-actions {
      display: flex;
      min-width: 0;
      align-items: center;
    }

    .account-heading {
      gap: 16px;
    }

    .account-labels,
    .detail-actions {
      flex-wrap: wrap;
      gap: 8px;
    }

    .account-type-icon {
      display: grid;
      width: 58px;
      height: 58px;
      flex: 0 0 58px;
      place-items: center;
      border-radius: 10px;
      background: var(--type-soft);
      color: var(--type-color);
    }

    .account-type-icon mat-icon {
      width: 28px;
      height: 28px;
      font-size: 28px;
    }

    .detail-header h1,
    .detail-header p {
      margin: 0;
    }

    .detail-header h1 {
      margin-top: 5px;
      overflow-wrap: anywhere;
      color: #0b1426;
      font-size: clamp(1.55rem, 3vw, 2.15rem);
      line-height: 1.08;
    }

    .detail-header p {
      margin-top: 5px;
      color: #5a6678;
      font-size: 0.84rem;
    }

    .type-label,
    .status-label,
    .plan-badge {
      display: inline-flex;
      min-height: 25px;
      align-items: center;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
    }

    .type-label {
      padding: 0 9px;
      background: var(--type-soft);
      color: var(--type-color);
    }

    .status-label {
      gap: 6px;
      color: #047857;
    }

    .status-label > span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }

    .status-label.closed {
      color: #64748b;
    }

    .delete-action {
      color: #b42318;
    }

    .delete-error,
    .mapping-notice {
      margin: 0;
      border-radius: 8px;
    }

    .delete-error {
      padding: 12px 16px;
      border: 1px solid #fda29b;
      background: #fff1f0;
      color: #b42318;
    }

    .mapping-notice {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 13px 16px;
      border: 1px solid #fed7aa;
      background: #fff7ed;
      color: #9a3412;
    }

    .mapping-notice strong,
    .mapping-notice span {
      display: block;
    }

    .mapping-notice span {
      margin-top: 2px;
      color: #7c2d12;
      font-size: 0.76rem;
    }

    .detail-summary .stat-card {
      min-width: 0;
    }

    .primary-stat {
      border-color: #d7e8ff;
      background: linear-gradient(145deg, #f1f7ff, #fff 72%);
    }

    .return-stat strong,
    .return-stat small {
      color: #047857;
    }

    .return-stat.loss strong,
    .return-stat.loss small {
      color: #b42318;
    }

    .return-stat.loss .icon-chip {
      background: #fff0f3;
      color: #ef2f4f;
    }

    .detail-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(310px, 0.72fr);
      align-items: start;
      gap: 18px;
    }

    .transaction-ledger {
      min-width: 0;
    }

    .ledger-list,
    .detail-sidebar {
      display: grid;
    }

    .ledger-list {
      gap: 7px;
    }

    .detail-sidebar {
      gap: 18px;
    }

    .transaction-row {
      display: grid;
      min-width: 0;
      grid-template-columns: 40px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      background: #f8fafc;
    }

    .transaction-icon,
    .side-icon {
      display: grid;
      place-items: center;
      border-radius: 50%;
    }

    .transaction-icon {
      width: 38px;
      height: 38px;
      background: #e8fbf2;
      color: #047857;
    }

    .transaction-icon.withdrawal {
      background: #fff0f3;
      color: #be123c;
    }

    .transaction-icon mat-icon {
      width: 19px;
      height: 19px;
      font-size: 19px;
    }

    .transaction-name strong,
    .transaction-name small {
      display: block;
    }

    .transaction-name strong {
      color: #111827;
      font-size: 0.88rem;
    }

    .transaction-name small,
    .transaction-units {
      color: #66748a;
      font-size: 0.7rem;
    }

    .transaction-name small {
      margin-top: 3px;
    }

    .transaction-units {
      grid-column: 3;
      padding: 4px 8px;
      border-radius: 999px;
      background: #eef2f7;
      white-space: nowrap;
    }

    .transaction-row b {
      grid-column: 4;
      justify-self: end;
      color: #047857;
      font-size: 0.86rem;
      white-space: nowrap;
    }

    .transaction-row .withdrawal-value,
    .negative {
      color: #b42318 !important;
    }

    .empty-ledger,
    .missing-account {
      display: grid;
      align-content: center;
      justify-items: center;
      text-align: center;
    }

    .empty-ledger {
      min-height: 260px;
      gap: 8px;
      color: #66748a;
    }

    .empty-ledger > span {
      display: grid;
      width: 54px;
      height: 54px;
      place-items: center;
      border-radius: 50%;
      background: #eef2f7;
    }

    .empty-ledger strong,
    .empty-ledger p {
      margin: 0;
    }

    .empty-ledger strong {
      color: #334155;
    }

    .empty-ledger p {
      max-width: 350px;
      font-size: 0.78rem;
    }

    .recurring-plan,
    .performance-panel,
    .account-details {
      display: grid;
      gap: 16px;
    }

    .recurring-plan > header,
    .performance-panel > header,
    .account-details > header {
      display: flex;
      align-items: flex-start;
      gap: 11px;
    }

    .recurring-plan h2,
    .recurring-plan p,
    .performance-panel h2,
    .performance-panel p,
    .account-details h2,
    .account-details p {
      margin: 0;
    }

    .recurring-plan h2,
    .performance-panel h2,
    .account-details h2 {
      color: #111827;
      font-size: 1rem;
    }

    .recurring-plan p,
    .performance-panel p,
    .account-details p {
      margin-top: 3px;
      color: #66748a;
      font-size: 0.72rem;
      line-height: 1.4;
    }

    .side-icon {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
    }

    .side-icon mat-icon {
      width: 19px;
      height: 19px;
      font-size: 19px;
    }

    .side-icon.blue {
      background: #eaf4ff;
      color: #2f80ed;
    }

    .side-icon.green {
      background: #e8fbf2;
      color: #047857;
    }

    .side-icon.slate {
      background: #eef2f7;
      color: #64748b;
    }

    .plan-value,
    .plan-empty {
      display: grid;
      gap: 3px;
      padding: 13px;
      border-radius: 8px;
      background: #f8fafc;
    }

    .plan-value strong {
      color: #0b1426;
      font-size: 1.35rem;
    }

    .plan-value span,
    .plan-empty span {
      color: #66748a;
      font-size: 0.74rem;
    }

    .plan-badge {
      width: fit-content;
      padding: 0 9px;
      background: #e8fbf2;
      color: #047857;
    }

    .performance-panel dl,
    .account-details dl {
      display: grid;
      gap: 0;
      margin: 0;
    }

    .performance-panel dl div,
    .account-details dl div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 10px 0;
      border-bottom: 1px solid #edf1f5;
    }

    .performance-panel dl div:last-child,
    .account-details dl div:last-child {
      border-bottom: 0;
    }

    .performance-panel dt,
    .account-details dt {
      color: #66748a;
      font-size: 0.74rem;
    }

    .performance-panel dd,
    .account-details dd {
      margin: 0;
      color: #334155;
      font-size: 0.76rem;
      font-weight: 700;
      text-align: right;
    }

    .performance-panel dd:not(.negative) {
      color: #047857;
    }

    .missing-account {
      min-height: 360px;
      gap: 10px;
    }

    .missing-account > mat-icon {
      width: 48px;
      height: 48px;
      color: #64748b;
      font-size: 48px;
    }

    .missing-account h1,
    .missing-account p {
      margin: 0;
    }

    .missing-account p {
      color: #66748a;
    }

    @media (max-width: 960px) {
      .detail-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .detail-layout {
        grid-template-columns: 1fr;
      }

      .detail-sidebar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .account-details {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 780px) {
      .back-link {
        margin-top: 2px;
      }

      .detail-header {
        gap: 18px;
        padding: 20px;
        border-radius: 24px;
      }

      .account-type-icon {
        width: 46px;
        height: 46px;
        flex-basis: 46px;
        border-radius: 50%;
      }

      .detail-actions {
        width: 100%;
      }

      .detail-actions button {
        flex: 1 1 auto;
      }

      .detail-summary .stat-card:first-child {
        grid-column: 1 / -1;
      }

      .detail-summary .stat-card:last-child {
        grid-column: 1 / -1;
        min-height: 112px;
      }

      .mapping-notice {
        grid-template-columns: 22px minmax(0, 1fr);
      }

      .mapping-notice button {
        grid-column: 1 / -1;
        justify-self: start;
      }

      .transaction-ledger,
      .recurring-plan,
      .performance-panel,
      .account-details {
        padding: 18px;
        border-radius: 24px;
      }

      .transaction-row {
        grid-template-columns: 36px minmax(0, 1fr) auto;
        border-radius: 18px;
        background: #faf7f7;
      }

      .transaction-units {
        display: none;
      }

      .transaction-row b {
        grid-column: 3;
      }
    }

    @media (max-width: 600px) {
      .detail-sidebar {
        grid-template-columns: 1fr;
      }

      .account-details {
        grid-column: auto;
      }

      .detail-actions button {
        min-width: calc(50% - 4px);
      }

      .transaction-row {
        gap: 9px;
        padding: 11px;
      }

      .transaction-row b {
        font-size: 0.78rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentAccountDetailPage {
  readonly investments = inject(InvestmentStore);
  readonly budget = inject(BudgetStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly deleteError = signal('');
  readonly investmentId = this.route.snapshot.paramMap.get('investmentId') ?? '';
  readonly showSkeleton = computed(
    () => this.budget.showPageSkeleton() || this.investments.loading(),
  );
  readonly account = computed(() =>
    this.investments.accounts().find((item) => item.id === this.investmentId),
  );
  readonly transactions = computed(() => this.investments.transactionsFor(this.investmentId));

  typeLabel(account: InvestmentAccount): string {
    return {
      STOCK: 'Stock',
      MUTUAL_FUND: 'Mutual Fund',
      NPS: 'National Pension System',
      PPF: 'Public Provident Fund',
      SSY: 'Sukanya Samriddhi',
    }[account.type];
  }

  typeIcon(account: InvestmentAccount): string {
    return {
      STOCK: 'show_chart',
      MUTUAL_FUND: 'donut_large',
      NPS: 'savings',
      PPF: 'account_balance',
      SSY: 'family_restroom',
    }[account.type];
  }

  accountSubtitle(account: InvestmentAccount): string {
    const instrument = account.instrument;
    if (instrument?.kind === 'STOCK') {
      return [account.institution, instrument.exchange, instrument.tradingSymbol]
        .filter(Boolean)
        .join(' · ');
    }
    if (instrument?.kind === 'MUTUAL_FUND') {
      return [account.institution, instrument.plan, instrument.option].filter(Boolean).join(' · ');
    }
    if (instrument?.kind === 'NPS') {
      return [account.institution, `${instrument.schemeHoldings.length} tracked schemes`]
        .filter(Boolean)
        .join(' · ');
    }
    if (instrument?.kind === 'SSY') {
      return [account.institution, instrument.beneficiaryName].filter(Boolean).join(' · ');
    }
    return account.institution || 'Personal investment';
  }

  valuationStatus(account: InvestmentAccount): string {
    if (account.summary.refreshStatus === 'CURRENT') return 'Current provider value';
    if (account.summary.refreshStatus === 'FAILED') return 'Value refresh failed';
    if (account.summary.refreshStatus === 'STALE') return 'Saved value';
    return account.summary.valuationSource ? 'Provider value' : 'Manual value';
  }

  holdingLabel(account: InvestmentAccount): string {
    if (account.type === 'STOCK') return 'Shares held';
    if (account.type === 'MUTUAL_FUND') return 'Units held';
    if (account.type === 'NPS') return 'NPS schemes';
    return 'Account status';
  }

  holdingValue(account: InvestmentAccount): string {
    if (account.type === 'NPS' && account.instrument?.kind === 'NPS') {
      return account.instrument.schemeHoldings.length.toString();
    }
    if (account.type === 'STOCK' || account.type === 'MUTUAL_FUND') {
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(
        this.investments.display(account.summary.currentQuantity),
      );
    }
    return account.status === 'ACTIVE' ? 'Active' : 'Closed';
  }

  holdingHint(account: InvestmentAccount): string {
    if (account.type === 'STOCK') return 'Current portfolio quantity';
    if (account.type === 'MUTUAL_FUND') return 'Current scheme units';
    if (account.type === 'NPS') return 'Tracked scheme allocations';
    return 'Government savings account';
  }

  holdingIcon(account: InvestmentAccount): string {
    if (account.type === 'STOCK') return 'numbers';
    if (account.type === 'MUTUAL_FUND') return 'data_usage';
    if (account.type === 'NPS') return 'account_tree';
    return 'verified_user';
  }

  addLabel(account: InvestmentAccount): string {
    return account.type === 'STOCK'
      ? 'Add purchase'
      : account.type === 'MUTUAL_FUND'
        ? 'Add investment'
        : 'Add contribution';
  }

  liquidationLabel(account: InvestmentAccount): string {
    return account.type === 'STOCK'
      ? 'Sell'
      : account.type === 'MUTUAL_FUND'
        ? 'Redeem'
        : 'Withdraw';
  }

  cadence(value: string | undefined): string {
    return value === 'QUARTERLY'
      ? 'quarter'
      : value === 'HALF_YEARLY'
        ? 'half-year'
        : value === 'YEARLY'
          ? 'year'
          : 'month';
  }

  isWithdrawal(type: InvestmentTransactionType): boolean {
    return type === 'SELL' || type === 'REDEMPTION' || type === 'WITHDRAWAL';
  }

  transactionLabel(type: InvestmentTransactionType): string {
    return {
      BUY: 'Purchase',
      SIP: 'SIP investment',
      CONTRIBUTION: 'Contribution',
      SELL: 'Sale',
      REDEMPTION: 'Redemption',
      WITHDRAWAL: 'Withdrawal',
    }[type];
  }

  transactionSourceLabel(source: InvestmentTransactionSource): string {
    return source === 'RECURRING' ? 'Recurring' : source === 'ADHOC' ? 'Ad-hoc' : 'Liquidation';
  }

  addTransaction(account: InvestmentAccount, liquidation: boolean): void {
    this.dialog.open(InvestmentTransactionDialog, {
      data: { account, liquidation },
      width: 'min(520px, 96vw)',
      autoFocus: 'first-tabbable',
    });
  }

  edit(account: InvestmentAccount): void {
    this.dialog.open(InvestmentEditDialog, {
      data: account,
      width: 'min(520px, 96vw)',
      autoFocus: 'first-tabbable',
    });
  }

  editPlan(account: InvestmentAccount): void {
    this.dialog.open(RecurringPlanDialog, {
      data: account,
      width: 'min(520px, 96vw)',
      autoFocus: 'first-tabbable',
    });
  }

  async deleteInvestment(account: InvestmentAccount): Promise<void> {
    this.deleteError.set('');
    const transactionCount = this.investments.transactionsFor(account.id).length;
    const { WorkspaceConfirmDialog: confirmDialog } = await import('../workspace-form-dialog');
    const data: WorkspaceConfirmData = {
      title: `Delete ${account.name}?`,
      message: `This permanently removes the investment, its opening balance, recurring plan, saved valuation, and ${transactionCount} recorded ${transactionCount === 1 ? 'transaction' : 'transactions'}. This cannot be undone.`,
      confirmLabel: 'Delete investment',
      icon: 'delete_forever',
    };
    const confirmed = await firstValueFrom(
      this.dialog
        .open<WorkspaceConfirmDialog, WorkspaceConfirmData, boolean>(confirmDialog, {
          ariaLabel: data.title,
          autoFocus: 'first-tabbable',
          data,
          maxWidth: '94vw',
          restoreFocus: true,
          width: 'min(460px, 94vw)',
        })
        .afterClosed(),
    );
    if (confirmed !== true) return;

    try {
      await this.investments.deleteInvestment(account);
      this.snack.open('Investment deleted.', 'Dismiss', { duration: 3500 });
      await this.router.navigate(['/investments']);
    } catch (error) {
      this.deleteError.set(
        error instanceof Error ? error.message : 'Investment could not be deleted.',
      );
    }
  }
}
