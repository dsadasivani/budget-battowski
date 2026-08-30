import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import type { InvestmentAccount, InvestmentType } from '../domain/investments/investment.models';
import { InvestmentStore } from '../stores/investment.store';

export interface InvestmentTypeGroup {
  type: InvestmentType;
  label: string;
  description: string;
  icon: string;
  accounts: InvestmentAccount[];
}

export type InvestmentViewMode = 'grid' | 'list';

@Component({
  selector: 'app-investment-type-section',
  imports: [CommonModule, RouterLink, MatIconModule, MatChipsModule],
  template: `
    <section
      class="type-section panel-card"
      [class.stocks]="group().type === 'STOCK'"
      [class.funds]="group().type === 'MUTUAL_FUND'"
      [class.nps]="group().type === 'NPS'"
      [class.ppf]="group().type === 'PPF'"
      [class.ssy]="group().type === 'SSY'"
      [class.list-view]="viewMode() === 'list'"
      [attr.aria-labelledby]="headingId()"
    >
      <header class="type-heading">
        <div class="type-identity">
          <span class="type-icon" aria-hidden="true">
            <mat-icon>{{ group().icon }}</mat-icon>
          </span>
          <div>
            <div class="title-line">
              <h3 [id]="headingId()">{{ group().label }}</h3>
              <span class="account-count">{{ group().accounts.length }} </span>
            </div>
            <p>{{ group().description }}</p>
          </div>
        </div>

        <dl class="type-summary">
          <div>
            <dt>Current value</dt>
            <dd>{{ groupValue() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</dd>
          </div>
          <div>
            <dt>Portfolio share</dt>
            <dd>{{ allocation() | number: '1.0-1' }}%</dd>
          </div>
        </dl>
      </header>

      <div
        class="allocation-track"
        role="progressbar"
        [attr.aria-label]="group().label + ' share of the portfolio'"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="allocation()"
      >
        <span [style.width.%]="allocation()"></span>
      </div>

      <div class="account-grid">
        @for (account of group().accounts; track account.id) {
          <a
            class="account-row"
            [class.has-recurring-plan]="hasRecurringPlan(account)"
            [routerLink]="['/investments', account.id]"
            [attr.aria-label]="'Open ' + account.name + ' investment'"
          >
            <header>
              <div class="account-identity">
                <span class="account-monogram" aria-hidden="true">{{ initial(account.name) }}</span>
                <div>
                  <h4>{{ account.name }}</h4>
                  <p>{{ accountDetail(account) }}</p>
                  @if (showInstitutionChip(account)) {
                    <mat-chip-set
                      class="institution-chip-set"
                      [attr.aria-label]="institutionChipLabel(account)"
                    >
                      <mat-chip>{{ account.institution }}</mat-chip>
                    </mat-chip-set>
                  }
                </div>
              </div>
              <span class="open-icon" aria-hidden="true">
                <mat-icon>arrow_outward</mat-icon>
              </span>
            </header>

            @if (account.needsInstrumentMapping) {
              <p class="mapping-notice">
                <mat-icon aria-hidden="true">link_off</mat-icon>
                Connect instrument for live values
              </p>
            }

            <div class="account-value-row">
              <div>
                <span>Current value</span>
                <strong>{{
                  investments.display(account.summary.currentValue)
                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                }}</strong>
              </div>
              @if (account.summary.refreshStatus && account.summary.refreshStatus !== 'CURRENT') {
                <span class="valuation-status">
                  <mat-icon aria-hidden="true">schedule</mat-icon>
                  Saved value
                </span>
              }
            </div>

            <dl class="account-metrics">
              @if (account.type === 'STOCK') {
                <div>
                  <dt>Shares held</dt>
                  <dd>
                    {{ investments.display(account.summary.currentQuantity) | number: '1.0-4' }}
                  </dd>
                </div>
              }
              <div>
                <dt>Invested</dt>
                <dd>
                  {{
                    investments.display(account.summary.remainingCostBasis)
                      | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                  }}
                </dd>
              </div>
              <div>
                <dt>Total return</dt>
                <dd
                  [class.positive]="investments.display(account.summary.overallReturnAmount) > 0"
                  [class.negative]="investments.display(account.summary.overallReturnAmount) < 0"
                >
                  {{
                    investments.display(account.summary.overallReturnAmount)
                      | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                  }}
                  <small>
                    {{
                      investments.display(account.summary.overallReturnPercentage)
                        | number: '1.1-2'
                    }}%
                  </small>
                </dd>
              </div>
            </dl>

            @if (hasRecurringPlan(account)) {
              <footer>
                <mat-icon aria-hidden="true">autorenew</mat-icon>
                <span>
                  {{
                    investments.display(investments.recurringPlanDisplayAmount(account))
                      | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                  }}
                  @if (investments.recurringPlanIsUpcoming(account)) {
                    starting {{ account.recurringPlan?.startDate | date: 'mediumDate' }}
                  } @else {
                    every {{ cadence(account.recurringPlan?.frequency) }}
                  }
                </span>
                @if (account.recurringPlan?.stepUp?.enabled) {
                  <span class="step-up"
                    >Step-up every {{ cadence(account.recurringPlan?.stepUp?.frequency) }}</span
                  >
                }
              </footer>
            }
          </a>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .type-section {
      --type-color: #2f80ed;
      --type-soft: #eaf4ff;
      display: grid;
      gap: 15px;
      padding: 20px;
      overflow: hidden;
    }

    .type-section.funds {
      --type-color: #7c3aed;
      --type-soft: #f3e8ff;
    }

    .type-section.nps {
      --type-color: #0f766e;
      --type-soft: #e6fbf7;
    }

    .type-section.ppf {
      --type-color: #c2410c;
      --type-soft: #fff5e8;
    }

    .type-section.ssy {
      --type-color: #be123c;
      --type-soft: #fff0f3;
    }

    .type-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }

    .type-identity,
    .title-line,
    .account-identity {
      display: flex;
      min-width: 0;
      align-items: center;
    }

    .type-identity {
      gap: 14px;
    }

    .title-line {
      flex-wrap: wrap;
      gap: 8px;
    }

    .type-icon {
      display: grid;
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      place-items: center;
      border-radius: 8px;
      background: var(--type-soft);
      color: var(--type-color);
    }

    .type-heading h3,
    .type-heading p,
    .account-row h4,
    .account-row p {
      margin: 0;
    }

    .type-heading h3 {
      color: #111827;
      font-size: 1.22rem;
      line-height: 1.2;
    }

    .type-heading p {
      margin-top: 4px;
      color: #4b5563;
      font-size: 0.86rem;
    }

    .account-count,
    .valuation-status,
    .step-up {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 650;
      white-space: nowrap;
    }

    .account-count {
      min-height: 25px;
      padding: 0 9px;
      background: var(--type-soft);
      color: var(--type-color);
    }

    .type-summary {
      display: grid;
      min-width: 250px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
      margin: 0;
    }

    .type-summary div {
      display: grid;
      gap: 3px;
    }

    .type-summary dt,
    .account-metrics dt,
    .account-value-row span {
      color: #66748a;
      font-size: 0.74rem;
      font-weight: 550;
    }

    .type-summary dd {
      margin: 0;
      color: #111827;
      font-size: 1.02rem;
      font-weight: 700;
    }

    .allocation-track {
      height: 5px;
      overflow: hidden;
      border-radius: 999px;
      background: #edf1f5;
    }

    .allocation-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--type-color);
    }

    .account-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .account-row {
      display: grid;
      min-width: 0;
      gap: 11px;
      padding: 14px;
      border: 1px solid #e5ebf3;
      border-radius: 8px;
      background: #fbfcfe;
      color: #111827;
      text-decoration: none;
      transition:
        border-color 150ms ease,
        box-shadow 150ms ease,
        transform 150ms ease;
    }

    .account-row:hover {
      border-color: color-mix(in srgb, var(--type-color) 45%, #e5ebf3);
      box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08);
      transform: translateY(-1px);
    }

    .account-row:focus-visible {
      outline: 3px solid var(--bb-focus);
      outline-offset: 2px;
    }

    .account-row > header,
    .account-value-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .account-identity {
      gap: 10px;
    }

    .account-monogram {
      display: grid;
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      place-items: center;
      border-radius: 50%;
      background: var(--type-soft);
      color: var(--type-color);
      font-size: 0.82rem;
      font-weight: 750;
    }

    .account-row h4 {
      overflow-wrap: anywhere;
      font-size: 0.9rem;
      line-height: 1.25;
    }

    .account-row header p {
      margin-top: 3px;
      color: #66748a;
      font-size: 0.74rem;
      line-height: 1.3;
    }

    .institution-chip-set {
      display: block;
      margin-top: 6px;
    }

    .institution-chip-set mat-chip {
      --mdc-chip-container-height: 24px;
      --mdc-chip-label-text-size: 0.7rem;
      --mdc-chip-label-text-color: var(--type-color);
      --mdc-chip-elevated-container-color: var(--type-soft);
    }

    .open-icon {
      color: #94a3b8;
    }

    .open-icon mat-icon {
      width: 19px;
      height: 19px;
      font-size: 19px;
    }

    .mapping-notice {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      border: 1px solid #fed7aa;
      border-radius: 6px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .mapping-notice mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }

    .account-value-row > div {
      display: grid;
      gap: 3px;
    }

    .account-value-row strong {
      color: #0b1426;
      font-size: 1.3rem;
      letter-spacing: -0.035em;
      line-height: 1.1;
    }

    .valuation-status {
      min-height: 27px;
      gap: 5px;
      padding: 0 9px;
      background: #eef2f7;
      color: #4b5563;
    }

    .valuation-status mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }

    .account-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
      gap: 9px;
      margin: 0;
      padding-top: 10px;
      border-top: 1px solid #e5ebf3;
    }

    .account-metrics div {
      display: grid;
      gap: 4px;
    }

    .account-metrics dd {
      margin: 0;
      color: #334155;
      font-size: 0.86rem;
      font-weight: 700;
    }

    .account-metrics dd small {
      margin-left: 3px;
      font-size: 0.72rem;
      font-weight: 650;
    }

    .positive {
      color: #047857 !important;
    }

    .negative {
      color: #b42318 !important;
    }

    .account-row footer {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 6px;
      color: #4b5563;
      font-size: 0.74rem;
      font-weight: 550;
    }

    .account-row footer mat-icon {
      width: 16px;
      height: 16px;
      color: var(--type-color);
      font-size: 16px;
    }

    .list-view .account-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .list-view .account-row {
      grid-template-columns: minmax(220px, 1.25fr) minmax(145px, 0.65fr) minmax(230px, 1fr);
      align-items: center;
      gap: 14px;
      min-height: 72px;
      padding: 11px 14px;
    }

    .list-view .account-value-row {
      grid-column: 2;
      align-items: center;
    }

    .list-view .account-row > header {
      grid-column: 1;
    }

    .list-view .account-value-row strong {
      font-size: 1.08rem;
    }

    .list-view .valuation-status {
      display: none;
    }

    .list-view .account-metrics {
      grid-column: 3;
      padding: 0;
      border: 0;
    }

    .list-view .account-row footer {
      grid-column: 4;
      justify-content: flex-start;
    }

    .list-view .mapping-notice {
      grid-column: 1 / -1;
      margin-top: -4px;
    }

    @media (min-width: 1001px) {
      .list-view .account-row.has-recurring-plan {
        grid-template-columns:
          minmax(220px, 1.25fr) minmax(145px, 0.65fr) minmax(230px, 1fr)
          minmax(160px, 0.7fr);
      }
    }

    .step-up {
      min-height: 23px;
      margin-left: auto;
      padding: 0 8px;
      background: var(--type-soft);
      color: var(--type-color);
    }

    @media (max-width: 1000px) {
      .account-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .list-view .account-row {
        grid-template-columns: minmax(210px, 1fr) minmax(140px, 0.65fr) minmax(220px, 1fr);
      }

      .list-view .account-row footer {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 900px) {
      .type-heading {
        align-items: flex-start;
      }

      .type-summary {
        min-width: 220px;
      }

      .account-grid {
        grid-template-columns: 1fr;
      }

      .list-view .account-row {
        grid-template-columns: minmax(0, 1fr) minmax(130px, auto);
      }

      .list-view .account-metrics,
      .list-view .account-row footer,
      .list-view .mapping-notice {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 600px) {
      .type-section {
        gap: 15px;
        padding: 18px;
        border-radius: 24px;
      }

      .type-heading {
        display: grid;
        gap: 16px;
      }

      .type-icon {
        width: 42px;
        height: 42px;
        flex-basis: 42px;
        border-radius: 50%;
      }

      .type-icon mat-icon {
        width: 21px;
        height: 21px;
        font-size: 21px;
      }

      .type-summary {
        width: 100%;
        min-width: 0;
      }

      .account-row {
        gap: 11px;
        padding: 13px;
        border-radius: 18px;
        background: #faf7f7;
      }

      .account-value-row strong {
        font-size: 1.22rem;
      }

      .list-view .account-row {
        grid-template-columns: minmax(0, 1fr) auto;
        padding-block: 11px;
      }

      .list-view .account-value-row {
        text-align: right;
      }

      .list-view .account-metrics,
      .list-view .account-row footer,
      .list-view .mapping-notice {
        grid-column: 1 / -1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .account-row {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentTypeSection {
  readonly group = input.required<InvestmentTypeGroup>();
  readonly portfolioValue = input.required<number>();
  readonly viewMode = input.required<InvestmentViewMode>();
  readonly investments = inject(InvestmentStore);

  readonly headingId = computed(() => `investment-type-${this.group().type.toLowerCase()}`);
  readonly groupValue = computed(() =>
    this.group().accounts.reduce(
      (total, account) => total + this.investments.display(account.summary.currentValue),
      0,
    ),
  );
  readonly allocation = computed(() => {
    const portfolioValue = this.portfolioValue();
    if (portfolioValue <= 0) return 0;
    return Math.min(100, Math.max(0, (this.groupValue() / portfolioValue) * 100));
  });

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || 'I';
  }

  hasRecurringPlan(account: InvestmentAccount): boolean {
    return account.type !== 'STOCK' && account.recurringPlan?.enabled === true;
  }

  showInstitutionChip(account: InvestmentAccount): boolean {
    return !!account.institution && (account.type === 'STOCK' || account.type === 'MUTUAL_FUND');
  }

  institutionChipLabel(account: InvestmentAccount): string {
    return `${account.type === 'STOCK' ? 'Broker' : 'AMC or investment platform'}: ${account.institution}`;
  }

  accountDetail(account: InvestmentAccount): string {
    const instrument = account.instrument;
    if (instrument?.kind === 'STOCK') {
      return [instrument.exchange, instrument.tradingSymbol].filter(Boolean).join(' · ');
    }
    if (instrument?.kind === 'MUTUAL_FUND') {
      return [instrument.plan, instrument.option].filter(Boolean).join(' · ');
    }
    if (instrument?.kind === 'NPS') {
      const schemes = instrument.schemeHoldings.length;
      return [
        instrument.cra ?? account.institution,
        this.npsAccountTypeLabel(instrument.accountType),
        `${schemes} ${schemes === 1 ? 'scheme' : 'schemes'}`,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (instrument?.kind === 'SSY') {
      return [account.institution, instrument.beneficiaryName].filter(Boolean).join(' · ');
    }
    return account.institution || 'Manually valued account';
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
}
