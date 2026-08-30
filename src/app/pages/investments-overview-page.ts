import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../budget.store';
import type { InvestmentType } from '../domain/investments/investment.models';
import { MonthMemberControls } from '../shared/month-member-controls';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';
import { InvestmentStore } from '../stores/investment.store';
import { InvestmentAccountDialog } from './investments-page';
import {
  InvestmentTypeSection,
  type InvestmentTypeGroup,
  type InvestmentViewMode,
} from './investment-type-section';

interface InvestmentTypePresentation {
  label: string;
  description: string;
  icon: string;
}

const TYPE_ORDER: InvestmentType[] = ['STOCK', 'MUTUAL_FUND', 'NPS', 'PPF', 'SSY'];

const TYPE_PRESENTATION: Record<InvestmentType, InvestmentTypePresentation> = {
  STOCK: {
    label: 'Stocks',
    description: 'Direct equity holdings',
    icon: 'show_chart',
  },
  MUTUAL_FUND: {
    label: 'Mutual funds',
    description: 'Diversified market investments',
    icon: 'donut_large',
  },
  NPS: {
    label: 'National Pension System',
    description: 'Long-term retirement holdings',
    icon: 'savings',
  },
  PPF: {
    label: 'Public Provident Fund',
    description: 'Government-backed long-term savings',
    icon: 'account_balance',
  },
  SSY: {
    label: 'Sukanya Samriddhi',
    description: 'Goal-based government savings',
    icon: 'family_restroom',
  },
};

@Component({
  selector: 'app-investments-overview-page',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatExpansionModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
    InvestmentTypeSection,
  ],
  template: `
    @if (showSkeleton()) {
      <app-page-skeleton variant="investments" />
    } @else {
      <section class="page mobile-investments-page investments-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Investments</h1>
            <p>See your portfolio by asset type, returns, and recurring commitments.</p>
          </div>
          <div class="header-actions">
            <app-month-member-controls />
            <button
              mat-stroked-button
              type="button"
              (click)="refresh()"
              [disabled]="investments.refreshing() || !budget.canWrite()"
            >
              <mat-icon aria-hidden="true">refresh</mat-icon>
              {{ investments.refreshing() ? 'Refreshing…' : 'Refresh values' }}
            </button>
            <button mat-flat-button type="button" (click)="add()" [disabled]="!budget.canWrite()">
              <mat-icon aria-hidden="true">add</mat-icon>
              Add investment
            </button>
          </div>
        </header>

        <div class="mobile-page-controls mobile-filter-strip">
          <app-month-member-controls />
        </div>

        @if (investments.error()) {
          <div class="status-message" role="status">
            <mat-icon aria-hidden="true">info</mat-icon>
            <span>{{ investments.error() }}</span>
          </div>
        }

        @if (!investments.visibleAccounts().length) {
          <section class="panel-card investment-empty" aria-labelledby="empty-investments-title">
            <span class="empty-icon" aria-hidden="true"><mat-icon>savings</mat-icon></span>
            <h2 id="empty-investments-title">Build your investment portfolio</h2>
            <p>
              Add stocks, mutual funds, NPS, PPF, or SSY accounts. We’ll organise them by type and
              show how each part of your portfolio is performing.
            </p>
            <button mat-flat-button type="button" (click)="add()" [disabled]="!budget.canWrite()">
              <mat-icon aria-hidden="true">add</mat-icon>
              Add your first investment
            </button>
          </section>
        } @else {
          <section class="stat-grid four portfolio-summary" aria-label="Portfolio summary">
            <article class="stat-card investment-total-card portfolio-value-card">
              <span class="icon-chip blue"
                ><mat-icon aria-hidden="true">trending_up</mat-icon></span
              >
              <p>Portfolio value</p>
              <strong>{{
                portfolioValue() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>
                {{
                  investments.display(investments.portfolio().investedThisMonth)
                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                }}
                invested this month
              </small>
            </article>

            <article class="stat-card">
              <span class="icon-chip purple"
                ><mat-icon aria-hidden="true">account_balance_wallet</mat-icon></span
              >
              <p>Total invested</p>
              <strong>{{
                investments.display(investments.portfolio().investedAmount)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>Remaining cost basis</small>
            </article>

            <article
              class="stat-card return-card"
              [class.loss]="investments.display(investments.portfolio().overallReturnAmount) < 0"
            >
              <span class="icon-chip green"
                ><mat-icon aria-hidden="true">{{
                  investments.display(investments.portfolio().overallReturnAmount) < 0
                    ? 'trending_down'
                    : 'moving'
                }}</mat-icon></span
              >
              <p>Total return</p>
              <strong>{{
                investments.display(investments.portfolio().overallReturnAmount)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>
                {{
                  investments.display(investments.portfolio().overallReturnPercentage)
                    | number: '1.1-2'
                }}% overall
              </small>
            </article>

            <article class="stat-card">
              <span class="icon-chip orange"
                ><mat-icon aria-hidden="true">autorenew</mat-icon></span
              >
              <p>Monthly commitment</p>
              <strong>{{
                investments.display(investments.portfolio().recurringCommitmentMonthly)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</strong>
              <small>From active recurring plans</small>
            </article>
          </section>

          <div class="portfolio-toolbar">
            <div class="refresh-note">
              <mat-icon aria-hidden="true">schedule</mat-icon>
              <span>
                @if (investments.lastRefreshedAt()) {
                  Values refreshed {{ investments.lastRefreshedAt() | date: 'medium' }}
                } @else {
                  Showing your saved values
                }
              </span>
            </div>
            <div class="mobile-portfolio-actions">
              <button
                mat-icon-button
                type="button"
                aria-label="Refresh investment values"
                (click)="refresh()"
                [disabled]="investments.refreshing() || !budget.canWrite()"
              >
                <mat-icon aria-hidden="true">refresh</mat-icon>
              </button>
              <button
                mat-icon-button
                class="mobile-panel-add-button"
                type="button"
                aria-label="Add investment"
                (click)="add()"
                [disabled]="!budget.canWrite()"
              >
                <mat-icon aria-hidden="true">add</mat-icon>
              </button>
            </div>
          </div>

          <section class="portfolio-content" aria-labelledby="portfolio-types-title">
            <header class="section-heading">
              <div>
                <h2 id="portfolio-types-title">Portfolio by investment type</h2>
                <p>Compare allocation and performance across each part of your portfolio.</p>
              </div>
              <div class="portfolio-view-controls">
                <span class="account-total">
                  {{ investments.activeAccounts().length }} active
                  {{ investments.activeAccounts().length === 1 ? 'investment' : 'investments' }}
                </span>
                <div class="view-toggle" role="group" aria-label="Investment record layout">
                  <button
                    type="button"
                    [class.active]="viewMode() === 'grid'"
                    [attr.aria-pressed]="viewMode() === 'grid'"
                    aria-label="Show investments in grid view"
                    (click)="setViewMode('grid')"
                  >
                    <mat-icon aria-hidden="true">grid_view</mat-icon>
                    <span>Grid</span>
                  </button>
                  <button
                    type="button"
                    [class.active]="viewMode() === 'list'"
                    [attr.aria-pressed]="viewMode() === 'list'"
                    aria-label="Show investments in list view"
                    (click)="setViewMode('list')"
                  >
                    <mat-icon aria-hidden="true">view_list</mat-icon>
                    <span>List</span>
                  </button>
                </div>
              </div>
            </header>

            <div class="type-stack">
              @for (group of activeGroups(); track group.type) {
                <app-investment-type-section
                  [group]="group"
                  [portfolioValue]="portfolioValue()"
                  [viewMode]="viewMode()"
                />
              }
            </div>
          </section>

          <section class="secondary-content">
            @if (investments.monthlyTransactions().length) {
              <article
                class="panel-card activity-panel"
                aria-labelledby="investment-activity-title"
              >
                <header class="panel-heading">
                  <div>
                    <h2 id="investment-activity-title">
                      <mat-icon class="panel-icon" aria-hidden="true">receipt_long</mat-icon>
                      This month’s activity
                    </h2>
                    <p>Contributions and withdrawals recorded this month.</p>
                  </div>
                </header>

                <div class="activity-list">
                  @for (transaction of investments.monthlyContributions(); track transaction.id) {
                    <div class="activity-row">
                      <span class="activity-icon contribution" aria-hidden="true">
                        <mat-icon>south_west</mat-icon>
                      </span>
                      <div>
                        <strong>{{ accountName(transaction.investmentId) }}</strong>
                        <small>
                          Contribution ·
                          {{ transaction.source === 'RECURRING' ? 'Recurring' : 'Ad-hoc' }}
                        </small>
                      </div>
                      <b>{{
                        investments.display(transaction.amount)
                          | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                      }}</b>
                    </div>
                  }
                  @for (transaction of investments.monthlyWithdrawals(); track transaction.id) {
                    <div class="activity-row">
                      <span class="activity-icon withdrawal" aria-hidden="true">
                        <mat-icon>north_east</mat-icon>
                      </span>
                      <div>
                        <strong>{{ accountName(transaction.investmentId) }}</strong>
                        <small>Withdrawal</small>
                      </div>
                      <b class="withdrawal-value"
                        >−{{
                          investments.display(transaction.amount)
                            | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                        }}</b
                      >
                    </div>
                  }
                </div>
              </article>
            }

            @if (closedGroups().length) {
              <mat-expansion-panel class="closed-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>Closed investments</mat-panel-title>
                  <mat-panel-description>
                    {{ investments.closedAccounts().length }}
                    {{ investments.closedAccounts().length === 1 ? 'account' : 'accounts' }}
                  </mat-panel-description>
                </mat-expansion-panel-header>

                <div class="closed-groups">
                  @for (group of closedGroups(); track group.type) {
                    <section [attr.aria-labelledby]="'closed-' + group.type">
                      <h3 [id]="'closed-' + group.type">
                        <mat-icon aria-hidden="true">{{ group.icon }}</mat-icon>
                        {{ group.label }}
                      </h3>
                      <div class="closed-list">
                        @for (account of group.accounts; track account.id) {
                          <a [routerLink]="['/investments', account.id]">
                            <span>
                              <strong>{{ account.name }}</strong>
                              @if (
                                account.institution &&
                                (account.type === 'STOCK' || account.type === 'MUTUAL_FUND')
                              ) {
                                <mat-chip-set
                                  class="closed-institution-chip-set"
                                  [attr.aria-label]="
                                    (account.type === 'STOCK' ? 'Broker: ' : 'AMC or platform: ') +
                                    account.institution
                                  "
                                >
                                  <mat-chip>{{ account.institution }}</mat-chip>
                                </mat-chip-set>
                              } @else {
                                <small>{{ account.institution || 'Closed account' }}</small>
                              }
                            </span>
                            <span>
                              <small>Lifetime return</small>
                              <b
                                [class.negative]="
                                  investments.display(account.summary.overallReturnAmount) < 0
                                "
                                >{{
                                  investments.display(account.summary.overallReturnAmount)
                                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                                }}</b
                              >
                            </span>
                            <mat-icon aria-hidden="true">chevron_right</mat-icon>
                          </a>
                        }
                      </div>
                    </section>
                  }
                </div>
              </mat-expansion-panel>
            }
          </section>
        }
      </section>
    }
  `,
  styles: `
    .investments-page {
      width: min(1420px, 100%);
    }

    .status-message {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 0.86rem;
      font-weight: 550;
    }

    .investment-empty {
      display: grid;
      min-height: 360px;
      align-content: center;
      justify-items: center;
      gap: 12px;
      text-align: center;
    }

    .investment-empty {
      padding: 48px 24px;
    }

    .investment-empty h2,
    .investment-empty p {
      margin: 0;
    }

    .investment-empty h2 {
      color: #111827;
      font-size: 1.4rem;
    }

    .investment-empty p {
      max-width: 540px;
      color: #4b5563;
      line-height: 1.55;
    }

    .empty-icon {
      display: grid;
      width: 66px;
      height: 66px;
      place-items: center;
      border-radius: 50%;
      background: var(--bb-primary-soft);
      color: var(--bb-primary);
    }

    .empty-icon mat-icon {
      width: 34px;
      height: 34px;
      font-size: 34px;
    }

    .portfolio-summary .stat-card {
      min-width: 0;
    }

    .portfolio-summary small {
      line-height: 1.35;
    }

    .portfolio-value-card {
      border-color: #d7e8ff;
      background: linear-gradient(145deg, #f1f7ff, #fff 70%);
    }

    .return-card strong,
    .return-card small {
      color: #047857;
    }

    .return-card.loss strong,
    .return-card.loss small {
      color: #b42318;
    }

    .return-card.loss .icon-chip {
      background: #fff0f3;
      color: #ef2f4f;
    }

    .portfolio-toolbar,
    .section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .refresh-note {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #66748a;
      font-size: 0.76rem;
      font-weight: 550;
    }

    .refresh-note mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }

    .mobile-portfolio-actions {
      display: none;
    }

    .portfolio-content,
    .type-stack,
    .secondary-content {
      display: grid;
    }

    .portfolio-content,
    .type-stack {
      gap: 12px;
    }

    .secondary-content {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 18px;
    }

    .section-heading h2,
    .section-heading p {
      margin: 0;
    }

    .section-heading h2 {
      color: #111827;
      font-size: 1.18rem;
      line-height: 1.2;
    }

    .section-heading p {
      margin-top: 3px;
      color: #4b5563;
      font-size: 0.8rem;
    }

    .account-total {
      display: inline-flex;
      min-height: 28px;
      align-items: center;
      padding: 0 10px;
      border-radius: 999px;
      background: #eef2f7;
      color: #45556c;
      font-size: 0.7rem;
      font-weight: 650;
      white-space: nowrap;
    }

    .portfolio-view-controls,
    .view-toggle {
      display: flex;
      align-items: center;
    }

    .portfolio-view-controls {
      gap: 7px;
    }

    .view-toggle {
      padding: 2px;
      border: 1px solid #dce4ef;
      border-radius: 8px;
      background: #fff;
    }

    .view-toggle button {
      display: inline-flex;
      min-height: 32px;
      align-items: center;
      gap: 6px;
      padding: 0 9px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #64748b;
      cursor: pointer;
      font-size: 0.72rem;
      font-weight: 650;
    }

    .view-toggle button.active {
      background: var(--bb-primary-soft);
      color: var(--bb-primary);
    }

    .view-toggle mat-icon {
      width: 17px;
      height: 17px;
      font-size: 17px;
    }

    .activity-panel {
      grid-column: 1 / -1;
    }

    .activity-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .activity-row {
      display: grid;
      min-width: 0;
      grid-template-columns: 38px minmax(0, 1fr) auto;
      align-items: center;
      gap: 11px;
      padding: 12px;
      border-radius: 8px;
      background: #f8fafc;
    }

    .activity-icon {
      display: grid;
      width: 38px;
      height: 38px;
      place-items: center;
      border-radius: 50%;
    }

    .activity-icon mat-icon {
      width: 19px;
      height: 19px;
      font-size: 19px;
    }

    .activity-icon.contribution {
      background: #e8fbf2;
      color: #047857;
    }

    .activity-icon.withdrawal {
      background: #fff0f3;
      color: #be123c;
    }

    .activity-row strong,
    .activity-row small {
      display: block;
      min-width: 0;
    }

    .activity-row strong {
      overflow-wrap: anywhere;
      color: #111827;
      font-size: 0.88rem;
    }

    .activity-row small {
      margin-top: 2px;
      color: #66748a;
      font-size: 0.72rem;
    }

    .activity-row b {
      color: #047857;
      font-size: 0.86rem;
    }

    .activity-row .withdrawal-value {
      color: #b42318;
    }

    .closed-panel {
      grid-column: 1 / -1;
      border: 1px solid #e0e7f1 !important;
      border-radius: 8px !important;
      background: #fff;
      box-shadow: 0 12px 34px rgba(15, 23, 42, 0.07) !important;
    }

    .closed-groups {
      display: grid;
      gap: 20px;
      padding-top: 8px;
    }

    .closed-groups h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 9px;
      color: #334155;
      font-size: 0.88rem;
    }

    .closed-groups h3 mat-icon {
      width: 18px;
      height: 18px;
      color: #64748b;
      font-size: 18px;
    }

    .closed-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }

    .closed-list a {
      display: grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) auto 22px;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid #e5ebf3;
      border-radius: 8px;
      color: #334155;
      text-decoration: none;
    }

    .closed-list a:hover {
      border-color: #bfdbfe;
      background: #f8fbff;
    }

    .closed-list span:nth-child(2) {
      text-align: right;
    }

    .closed-list strong,
    .closed-list small,
    .closed-list b {
      display: block;
    }

    .closed-list small {
      margin-top: 2px;
      color: #66748a;
      font-size: 0.7rem;
    }

    .closed-institution-chip-set {
      display: block;
      margin-top: 5px;
    }

    .closed-institution-chip-set mat-chip {
      --mdc-chip-container-height: 24px;
      --mdc-chip-label-text-size: 0.7rem;
      --mdc-chip-label-text-color: #475569;
      --mdc-chip-elevated-container-color: #eef2f7;
    }

    .closed-list b {
      margin-top: 2px;
      color: #047857;
      font-size: 0.8rem;
    }

    .closed-list .negative {
      color: #b42318;
    }

    .closed-list mat-icon {
      color: #94a3b8;
    }

    @media (max-width: 900px) {
      .activity-list,
      .closed-list {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 780px) {
      .investments-page {
        gap: 18px;
      }

      .portfolio-summary {
        gap: 12px;
      }

      .portfolio-value-card {
        min-height: 160px;
      }

      .portfolio-summary .stat-card:last-child {
        grid-column: 1 / -1;
        min-height: 112px;
      }

      .portfolio-toolbar {
        min-height: 40px;
      }

      .mobile-portfolio-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .mobile-portfolio-actions > button:first-child {
        color: var(--bb-primary);
      }

      .section-heading {
        align-items: flex-start;
      }

      .section-heading p {
        font-size: 0.78rem;
      }

      .account-total {
        min-height: 28px;
        padding-inline: 10px;
        font-size: 0.68rem;
      }

      .portfolio-view-controls {
        align-items: center;
        flex-direction: row;
        gap: 6px;
      }

      .view-toggle button {
        width: 44px;
        min-height: 44px;
        justify-content: center;
        padding: 0;
      }

      .view-toggle button span {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }

      .activity-panel {
        padding: 18px;
        border-radius: 24px;
      }

      .activity-list {
        gap: 8px;
      }

      .activity-row {
        border-radius: 18px;
        background: #faf7f7;
      }

      .closed-panel {
        border-radius: 24px !important;
        box-shadow: 0 2px 3px rgba(28, 27, 27, 0.05) !important;
      }
    }

    @media (max-width: 520px) {
      .refresh-note {
        max-width: calc(100% - 92px);
      }

      .section-heading {
        display: grid;
        gap: 10px;
      }

      .portfolio-view-controls {
        width: 100%;
        justify-content: space-between;
      }

      .activity-row {
        grid-template-columns: 34px minmax(0, 1fr) auto;
        gap: 9px;
      }

      .activity-icon {
        width: 34px;
        height: 34px;
      }

      .closed-list a {
        grid-template-columns: minmax(0, 1fr) 22px;
      }

      .closed-list span:nth-child(2) {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentsOverviewPage {
  readonly investments = inject(InvestmentStore);
  readonly budget = inject(BudgetStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly showSkeleton = computed(
    () => this.budget.showPageSkeleton() || this.investments.loading(),
  );
  readonly viewMode = signal<InvestmentViewMode>('list');
  readonly portfolioValue = computed(() =>
    this.investments.display(this.investments.portfolio().currentValue),
  );
  readonly activeGroups = computed(() => this.groupsForStatus('ACTIVE'));
  readonly closedGroups = computed(() => this.groupsForStatus('CLOSED'));

  accountName(id: string): string {
    return this.investments.accounts().find((account) => account.id === id)?.name ?? 'Investment';
  }

  setViewMode(mode: InvestmentViewMode): void {
    this.viewMode.set(mode);
  }

  add(): void {
    this.dialog.open(InvestmentAccountDialog, {
      width: 'min(760px, 96vw)',
      maxHeight: '92dvh',
      autoFocus: 'first-tabbable',
    });
  }

  async refresh(): Promise<void> {
    await this.investments.refresh();
    if (!this.investments.partialRefresh()) {
      this.snack.open('Investment values refreshed.', 'Dismiss', { duration: 3500 });
    }
  }

  private groupsForStatus(status: 'ACTIVE' | 'CLOSED'): InvestmentTypeGroup[] {
    const accounts =
      status === 'ACTIVE' ? this.investments.activeAccounts() : this.investments.closedAccounts();

    return TYPE_ORDER.flatMap((type) => {
      const matchingAccounts = accounts.filter((account) => account.type === type);
      if (!matchingAccounts.length) return [];
      return [
        {
          type,
          ...TYPE_PRESENTATION[type],
          accounts: matchingAccounts,
        },
      ];
    });
  }
}
