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
  InvestmentTransaction,
  NpsSchemeHolding,
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
      <section class="page mobile-investment-detail-page investment-detail-page">
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

          @if (npsSchemeDetails().length) {
            <article class="panel-card nps-scheme-details" aria-labelledby="scheme-details-title">
              <header class="panel-heading split">
                <div>
                  <h2 id="scheme-details-title">
                    <mat-icon class="panel-icon" aria-hidden="true">account_tree</mat-icon>
                    Scheme holdings
                  </h2>
                  <p>Current units and values across this NPS account.</p>
                </div>
                <div class="scheme-view-controls">
                  <span>{{ npsSchemeDetails().length }} schemes</span>
                  <div class="scheme-view-toggle" role="group" aria-label="NPS scheme layout">
                    <button
                      type="button"
                      [class.active]="npsSchemeViewMode() === 'grid'"
                      [attr.aria-pressed]="npsSchemeViewMode() === 'grid'"
                      aria-label="Show NPS schemes in grid view"
                      (click)="setNpsSchemeViewMode('grid')"
                    >
                      <mat-icon aria-hidden="true">grid_view</mat-icon>
                      <span>Grid</span>
                    </button>
                    <button
                      type="button"
                      [class.active]="npsSchemeViewMode() === 'list'"
                      [attr.aria-pressed]="npsSchemeViewMode() === 'list'"
                      aria-label="Show NPS schemes in list view"
                      (click)="setNpsSchemeViewMode('list')"
                    >
                      <mat-icon aria-hidden="true">view_list</mat-icon>
                      <span>List</span>
                    </button>
                  </div>
                </div>
              </header>
              <div
                class="nps-scheme-grid"
                [class.grid]="npsSchemeViewMode() === 'grid'"
                [class.list]="npsSchemeViewMode() === 'list'"
              >
                @for (holding of npsSchemeDetails(); track holding.schemeCode) {
                  <article class="nps-scheme-card">
                    <header>
                      <div>
                        <strong>{{ holding.schemeName || holding.schemeCode }}</strong>
                        <span>{{ holding.pfmName || 'Pension fund manager not specified' }}</span>
                      </div>
                      <span class="scheme-code">{{ holding.schemeCode }}</span>
                    </header>
                    <div class="scheme-tags" aria-label="Scheme classification">
                      @if (holding.assetClass) {
                        <span>Asset class {{ holding.assetClass }}</span>
                      }
                      @if (holding.tier) {
                        <span>Tier {{ holding.tier }}</span>
                      }
                      @if (holding.channel) {
                        <span>{{ holding.channel }}</span>
                      }
                    </div>
                    <dl>
                      <div>
                        <dt>Current units</dt>
                        <dd>{{ investments.display(holding.units) | number: '1.0-4' }}</dd>
                      </div>
                      <div>
                        <dt>Latest NAV</dt>
                        <dd>
                          @if (holding.nav) {
                            {{
                              investments.display(holding.nav)
                                | currency: 'INR' : 'symbol' : '1.2-4' : 'en-IN'
                            }}
                          } @else {
                            Not available
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Current value</dt>
                        <dd>
                          {{
                            investments.display(investments.npsHoldingValue(holding))
                              | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                          }}
                        </dd>
                      </div>
                      <div>
                        <dt>Recurring contribution split</dt>
                        <dd>
                          @if (holding.allocationPercentage) {
                            {{ holding.allocationPercentage }}%
                          } @else {
                            Not set
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>NAV date</dt>
                        <dd>
                          @if (holding.navDate) {
                            {{ holding.navDate | date: 'mediumDate' }}
                          } @else {
                            Not available
                          }
                        </dd>
                      </div>
                    </dl>
                  </article>
                }
              </div>
            </article>
          }

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
                        @if (transaction.paymentModeId) {
                          · {{ budget.paymentModeLabel(transaction.paymentModeId) }}
                        }
                      </small>
                      @if (transaction.schemeAllocations?.length) {
                        <div class="transaction-schemes" aria-label="NPS scheme allocations">
                          @for (
                            allocation of transaction.schemeAllocations;
                            track allocation.schemeCode
                          ) {
                            <span>
                              {{ npsSchemeName(item, allocation.schemeCode) }}:
                              @if (allocation.amount) {
                                {{
                                  investments.display(allocation.amount)
                                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                                }}
                                &middot;
                              }
                              {{ allocation.units }} units
                            </span>
                          }
                        </div>
                      }
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
                    <button
                      mat-icon-button
                      class="transaction-delete-action"
                      type="button"
                      [attr.aria-label]="
                        'Delete ' + transactionLabel(transaction.type) + ' transaction'
                      "
                      [disabled]="
                        investments.deletingTransactionId() === transaction.id ||
                        !investments.canDeleteTransaction(item, transaction)
                      "
                      (click)="deleteTransaction(item, transaction)"
                    >
                      <mat-icon aria-hidden="true">delete_outline</mat-icon>
                    </button>
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
                    @if (item.type === 'NPS' && npsSchemeDetails().length) {
                      <div class="plan-allocations" aria-label="Recurring contribution split">
                        @for (holding of npsSchemeDetails(); track holding.schemeCode) {
                          @if (holding.allocationPercentage) {
                            <div>
                              <span>{{ holding.assetClass || holding.schemeCode }}</span>
                              <strong>
                                {{ holding.allocationPercentage }}% &middot;
                                {{
                                  investments.display(npsPlannedAmount(item, holding))
                                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                                }}
                              </strong>
                            </div>
                          }
                        }
                      </div>
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
                    <dt>Default payment mode</dt>
                    <dd>{{ budget.paymentModeLabel(item.paymentModeId) || 'Not linked' }}</dd>
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
                  @if (item.summary.appliedGovernmentRate; as rate) {
                    <div>
                      <dt>Applied interest rate</dt>
                      <dd>{{ rate.annualRate }}% p.a.</dd>
                    </div>
                    <div>
                      <dt>Effective period</dt>
                      <dd>
                        {{ rate.effectiveFrom | date: 'mediumDate' }}–{{
                          rate.effectiveTo | date: 'mediumDate'
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>Rate verification</dt>
                      <dd>
                        {{ rateConfigurationLabel(rate.configurationSource) }} ·
                        {{ rate.verifiedAt | date: 'mediumDate' }}
                      </dd>
                    </div>
                    <div>
                      <dt>Official source</dt>
                      <dd>
                        <a [href]="rate.sourceUrl" target="_blank" rel="noopener noreferrer">
                          Published {{ rate.publishedDate | date: 'mediumDate' }}
                        </a>
                      </dd>
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
      width: min(1420px, 100%);
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

    .nps-scheme-details {
      display: grid;
      gap: 10px;
      padding: 14px;
    }

    .scheme-view-controls,
    .scheme-view-toggle {
      display: flex;
      align-items: center;
    }

    .scheme-view-controls {
      gap: 8px;
    }

    .scheme-view-controls > span {
      color: #0f766e;
      font-size: 0.72rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .scheme-view-toggle {
      padding: 2px;
      border: 1px solid #dce4ef;
      border-radius: 7px;
      background: #fff;
    }

    .scheme-view-toggle button {
      display: inline-flex;
      min-height: 30px;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: 650;
    }

    .scheme-view-toggle button.active {
      background: #e6fbf7;
      color: #0f766e;
    }

    .scheme-view-toggle mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }

    .nps-scheme-grid {
      display: grid;
      gap: 8px;
    }

    .nps-scheme-grid.grid {
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }

    .nps-scheme-grid.list {
      grid-template-columns: 1fr;
    }

    .nps-scheme-card {
      display: grid;
      min-width: 0;
      gap: 8px;
      padding: 10px;
      border: 1px solid #dce9e7;
      border-radius: 8px;
      background: #fbfefd;
    }

    .nps-scheme-card > header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .nps-scheme-card > header > div {
      display: grid;
      min-width: 0;
      gap: 2px;
    }

    .nps-scheme-card > header strong {
      color: #1f2937;
      font-size: 0.78rem;
      overflow-wrap: anywhere;
    }

    .nps-scheme-card > header span,
    .scheme-tags span,
    .nps-scheme-card dt {
      color: #66748a;
      font-size: 0.66rem;
    }

    .scheme-code,
    .scheme-tags span {
      padding: 3px 6px;
      border-radius: 999px;
      background: #e6fbf7;
      color: #0f766e !important;
      font-weight: 700;
    }

    .scheme-code {
      white-space: nowrap;
    }

    .scheme-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .nps-scheme-card dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px;
      margin: 0;
    }

    .nps-scheme-card dl div {
      display: grid;
      gap: 2px;
      padding: 7px;
      border-radius: 6px;
      background: #fff;
    }

    .nps-scheme-card dd {
      margin: 0;
      color: #334155;
      font-size: 0.73rem;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .nps-scheme-grid.list .nps-scheme-card {
      grid-template-columns: minmax(220px, 1.25fr) auto minmax(480px, 2fr);
      align-items: center;
      padding: 8px 10px;
    }

    .nps-scheme-grid.list .nps-scheme-card > header {
      min-width: 0;
    }

    .nps-scheme-grid.list .scheme-tags {
      max-width: 150px;
    }

    .nps-scheme-grid.list .nps-scheme-card dl {
      grid-template-columns: repeat(5, minmax(80px, 1fr));
    }

    .nps-scheme-grid.list .nps-scheme-card dl div {
      padding: 4px 7px;
      border-left: 1px solid #e7eeec;
      border-radius: 0;
      background: transparent;
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
      grid-template-columns: 40px minmax(0, 1fr) auto auto 40px;
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

    .transaction-schemes {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 7px;
    }

    .transaction-schemes span {
      padding: 4px 7px;
      border-radius: 999px;
      background: #e6fbf7;
      color: #0f766e;
      font-size: 0.68rem;
      font-weight: 650;
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

    .transaction-delete-action {
      grid-column: 5;
      color: #b42318;
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

    .plan-allocations {
      display: grid;
      gap: 7px;
    }

    .plan-allocations div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: #f3fbf9;
      color: #475569;
      font-size: 0.72rem;
    }

    .plan-allocations strong {
      color: #0f766e;
      font-size: 0.72rem;
      text-align: right;
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

    .account-details a {
      color: #0f5f9e;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
    }

    .account-details a:focus-visible {
      border-radius: 3px;
      outline: 2px solid #0f5f9e;
      outline-offset: 2px;
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

      .nps-scheme-grid.list .nps-scheme-card {
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .nps-scheme-grid.list .nps-scheme-card dl {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 780px) {
      .back-link {
        margin-top: 2px;
      }

      .detail-header {
        gap: 18px;
        padding: 18px;
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

      .nps-scheme-details {
        padding: 12px;
        border-radius: 18px;
      }

      .nps-scheme-details > header {
        align-items: flex-start;
        gap: 8px;
      }

      .scheme-view-controls {
        align-items: flex-end;
        flex-direction: column;
      }

      .transaction-ledger,
      .recurring-plan,
      .performance-panel,
      .account-details {
        padding: 18px;
        border-radius: 24px;
      }

      .transaction-row {
        grid-template-columns: 36px minmax(0, 1fr) auto 36px;
        border-radius: 18px;
        background: #faf7f7;
      }

      .transaction-units {
        display: none;
      }

      .transaction-row b {
        grid-column: 3;
      }

      .transaction-delete-action {
        grid-column: 4;
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

      .nps-scheme-grid.list .nps-scheme-card,
      .nps-scheme-grid.grid .nps-scheme-card {
        grid-template-columns: 1fr;
      }

      .nps-scheme-grid.list .scheme-tags,
      .nps-scheme-grid.list .nps-scheme-card dl {
        grid-column: auto;
        max-width: none;
      }

      .nps-scheme-card dl,
      .nps-scheme-grid.list .nps-scheme-card dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .nps-scheme-grid.list .nps-scheme-card dl div {
        padding: 6px;
        border-left: 0;
        border-radius: 6px;
        background: #fff;
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
  readonly npsSchemeViewMode = signal<'grid' | 'list'>('list');
  readonly npsSchemeDetails = computed(() => {
    const account = this.account();
    return account?.type === 'NPS' ? this.investments.npsHoldingsFor(account) : [];
  });

  setNpsSchemeViewMode(mode: 'grid' | 'list'): void {
    this.npsSchemeViewMode.set(mode);
  }

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
      return [
        instrument.cra ?? account.institution,
        this.npsAccountTypeLabel(instrument.accountType),
        `${instrument.schemeHoldings.length} tracked schemes`,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (instrument?.kind === 'SSY') {
      return [account.institution, instrument.beneficiaryName].filter(Boolean).join(' · ');
    }
    return account.institution || 'Personal investment';
  }

  valuationStatus(account: InvestmentAccount): string {
    if (
      account.summary.refreshStatus === 'CURRENT' &&
      account.summary.valuationSource === 'INTERNAL'
    ) {
      return 'Current calculated value';
    }
    if (account.summary.refreshStatus === 'CURRENT') return 'Current provider value';
    if (account.summary.refreshStatus === 'FAILED') return 'Value refresh failed';
    if (account.summary.refreshStatus === 'STALE') return 'Saved value';
    return account.summary.valuationSource ? 'Provider value' : 'Manual value';
  }

  rateConfigurationLabel(source: 'FIRESTORE' | 'BUNDLED'): string {
    return source === 'FIRESTORE' ? 'Central configuration' : 'Bundled fallback';
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

  private npsAccountTypeLabel(value: string | undefined): string | undefined {
    return value === 'TIER_I'
      ? 'Tier I'
      : value === 'TIER_I_MSF'
        ? 'Tier I MSF'
        : value === 'TIER_II'
          ? 'Tier II'
          : value === 'TIER_II_TAX_SAVER'
            ? 'Tier II Tax Saver'
            : undefined;
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

  npsPlannedAmount(account: InvestmentAccount, holding: NpsSchemeHolding): string {
    return (
      (this.investments.display(this.investments.recurringPlanDisplayAmount(account)) *
        this.investments.display(holding.allocationPercentage)) /
      100
    ).toString();
  }

  npsSchemeName(account: InvestmentAccount, schemeCode: string): string {
    if (account.instrument?.kind !== 'NPS') return schemeCode;
    const holding = account.instrument.schemeHoldings.find(
      (candidate) => candidate.schemeCode === schemeCode,
    );
    return holding?.assetClass ? `Asset ${holding.assetClass}` : holding?.schemeName || schemeCode;
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

  async deleteTransaction(
    account: InvestmentAccount,
    transaction: InvestmentTransaction,
  ): Promise<void> {
    this.deleteError.set('');
    const label = this.transactionLabel(transaction.type);
    const amount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(this.investments.display(transaction.amount));
    const transactionDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(
      new Date(`${transaction.date}T00:00:00`),
    );
    const { WorkspaceConfirmDialog: confirmDialog } = await import('../workspace-form-dialog');
    const data: WorkspaceConfirmData = {
      title: `Delete ${label.toLowerCase()}?`,
      message: `This permanently removes the ${label.toLowerCase()} of ${amount} recorded on ${transactionDate}. Investment totals and holdings will be recalculated. This cannot be undone.`,
      confirmLabel: 'Delete transaction',
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
      await this.investments.deleteTransaction(account, transaction);
      this.snack.open('Transaction deleted.', 'Dismiss', { duration: 3500 });
    } catch (error) {
      this.deleteError.set(
        error instanceof Error ? error.message : 'Transaction could not be deleted.',
      );
    }
  }
}
