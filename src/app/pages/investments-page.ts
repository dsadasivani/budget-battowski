import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { BudgetStore } from '../budget.store';
import type {
  InvestmentAccount,
  InvestmentFrequencyV2,
  InvestmentInstrument,
  InvestmentType,
  MutualFundSipType,
  RecurringInvestmentPlan,
} from '../domain/investments/investment.models';
import {
  InvestmentStore,
  type MutualFundSearchResult,
  type NewInvestmentInput,
  type StockSearchResult,
} from '../stores/investment.store';

const TYPE_LABELS: Record<InvestmentType, string> = {
  STOCK: 'Stock',
  MUTUAL_FUND: 'Mutual Fund',
  NPS: 'NPS',
  PPF: 'PPF',
  SSY: 'Sukanya Samriddhi',
};

@Component({
  selector: 'app-investment-account-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Add investment</h2>
    <mat-dialog-content>
      <form class="investment-form" [formGroup]="form" (ngSubmit)="save()">
        <fieldset class="type-picker">
          <legend>What are you investing in?</legend>
          @for (type of types; track type) {
            <button
              type="button"
              [class.selected]="form.controls.type.value === type"
              (click)="form.controls.type.setValue(type)"
            >
              <mat-icon aria-hidden="true">{{ icon(type) }}</mat-icon>
              <span>{{ label(type) }}</span>
            </button>
          }
        </fieldset>

        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" required />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Institution (optional)</mat-label>
          <input matInput formControlName="institution" />
        </mat-form-field>

        @switch (form.controls.type.value) {
          @case ('STOCK') {
            <div class="catalog-search">
              <button
                mat-stroked-button
                type="button"
                (click)="searchCatalog()"
                [disabled]="catalogSearching()"
              >
                <mat-icon aria-hidden="true">search</mat-icon
                >{{ catalogSearching() ? 'Searching…' : 'Find stock' }}
              </button>
              <span>Enter a company name above, then select the exact NSE/BSE instrument.</span>
            </div>
            @if (stockResults().length) {
              <div class="catalog-results" aria-label="Stock search results">
                @for (result of stockResults(); track result.instrumentKey) {
                  <button type="button" (click)="selectStock(result)">
                    <strong>{{ result.name }}</strong
                    ><span
                      >{{ result.exchange }} • {{ result.tradingSymbol }} •
                      {{ result.isin || 'No ISIN' }}</span
                    >
                  </button>
                }
              </div>
            }
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Trading symbol</mat-label>
                <input matInput formControlName="tradingSymbol" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Exchange</mat-label>
                <mat-select formControlName="exchange">
                  <mat-option value="NSE">NSE</mat-option>
                  <mat-option value="BSE">BSE</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>Market instrument key</mat-label>
                <input matInput formControlName="providerKey" placeholder="NSE_EQ|INE002A01018" />
                <mat-hint>Use the key returned by stock search.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>ISIN (optional)</mat-label>
                <input matInput formControlName="isin" />
              </mat-form-field>
            </div>
          }
          @case ('MUTUAL_FUND') {
            <div class="catalog-search">
              <button
                mat-stroked-button
                type="button"
                (click)="searchCatalog()"
                [disabled]="catalogSearching()"
              >
                <mat-icon aria-hidden="true">search</mat-icon
                >{{ catalogSearching() ? 'Searching…' : 'Find scheme' }}
              </button>
              <span
                >Search via MFAPI, then verify the exact Direct/Regular and Growth/IDCW
                scheme.</span
              >
            </div>
            @if (fundResults().length) {
              <div class="catalog-results" aria-label="Mutual fund scheme search results">
                @for (result of fundResults(); track result.schemeCode) {
                  <button type="button" (click)="selectFund(result)">
                    <strong>{{ result.schemeName }}</strong
                    ><span>AMFI scheme {{ result.schemeCode }}</span>
                  </button>
                }
              </div>
            }
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>AMFI scheme code</mat-label>
                <input matInput formControlName="schemeCode" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Plan</mat-label>
                <mat-select formControlName="plan">
                  <mat-option value="Direct">Direct</mat-option>
                  <mat-option value="Regular">Regular</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Option</mat-label>
                <mat-select formControlName="option">
                  <mat-option value="Growth">Growth</mat-option>
                  <mat-option value="IDCW">IDCW</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          }
          @case ('NPS') {
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Scheme code</mat-label>
                <input matInput formControlName="schemeCode" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>PFM name (optional)</mat-label>
                <input matInput formControlName="pfmName" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Opening scheme units</mat-label>
                <input matInput type="number" min="0" formControlName="openingUnits" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>Additional scheme holdings</mat-label>
                <textarea
                  matInput
                  formControlName="npsHoldings"
                  rows="3"
                  placeholder="SM002, 125.45, PFM name&#10;SM003, 80.1, PFM name"
                ></textarea>
                <mat-hint>One scheme per line: scheme code, units, optional PFM.</mat-hint>
              </mat-form-field>
            </div>
          }
          @case ('SSY') {
            <mat-form-field appearance="outline">
              <mat-label>Beneficiary name</mat-label>
              <input matInput formControlName="beneficiaryName" />
            </mat-form-field>
          }
        }

        <section class="form-section" aria-labelledby="opening-heading">
          <h3 id="opening-heading">Opening existing investment</h3>
          <p>Use a snapshot so you do not need to recreate old transactions.</p>
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>As-of date</mat-label>
              <input matInput type="date" formControlName="asOfDate" [max]="today" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Total invested</mat-label>
              <input matInput type="number" min="0" formControlName="investedAmount" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Current value / balance</mat-label>
              <input matInput type="number" min="0" formControlName="currentValue" />
            </mat-form-field>
            @if (form.controls.type.value === 'STOCK') {
              <mat-form-field appearance="outline">
                <mat-label>Quantity</mat-label>
                <input matInput type="number" min="0" formControlName="openingQuantity" />
              </mat-form-field>
            }
            @if (form.controls.type.value === 'MUTUAL_FUND') {
              <mat-form-field appearance="outline">
                <mat-label>Units</mat-label>
                <input matInput type="number" min="0" formControlName="openingUnits" />
              </mat-form-field>
            }
          </div>
        </section>

        @if (form.controls.type.value !== 'STOCK') {
          <section class="form-section" aria-labelledby="recurring-heading">
            <label class="check-row">
              <input type="checkbox" formControlName="recurringEnabled" />
              <span id="recurring-heading">Track a recurring plan</span>
            </label>
            @if (form.controls.recurringEnabled.value) {
              <p class="accounting-note">
                A plan is a commitment only. It never creates an actual investment transaction.
              </p>
              <div class="form-grid">
                <mat-form-field appearance="outline">
                  <mat-label>Recurring amount</mat-label>
                  <input matInput type="number" min="0" formControlName="recurringAmount" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Frequency</mat-label>
                  <mat-select formControlName="frequency">
                    <mat-option value="MONTHLY">Monthly</mat-option>
                    <mat-option value="QUARTERLY">Quarterly</mat-option>
                    <mat-option value="HALF_YEARLY">Half-yearly</mat-option>
                    <mat-option value="YEARLY">Annual</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Start date</mat-label>
                  <input matInput type="date" formControlName="recurringStartDate" />
                </mat-form-field>
              </div>
              @if (form.controls.type.value === 'MUTUAL_FUND') {
                <mat-form-field appearance="outline">
                  <mat-label>SIP type</mat-label>
                  <mat-select formControlName="sipType">
                    <mat-option value="FIXED">Fixed SIP</mat-option>
                    <mat-option value="STEP_UP">Step-up SIP</mat-option>
                  </mat-select>
                </mat-form-field>
                @if (form.controls.sipType.value === 'STEP_UP') {
                  <div class="form-grid">
                    <mat-form-field appearance="outline">
                      <mat-label>SIP increase amount</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        formControlName="stepUpValue"
                        required
                      />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Step-up frequency</mat-label>
                      <mat-select formControlName="stepUpFrequency">
                        <mat-option value="MONTHLY">Monthly</mat-option>
                        <mat-option value="QUARTERLY">Quarterly</mat-option>
                        <mat-option value="HALF_YEARLY">Half-yearly</mat-option>
                        <mat-option value="YEARLY">Annual</mat-option>
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Upcoming step-up month</mat-label>
                      <input matInput type="month" formControlName="stepUpMonth" required />
                      <mat-hint>The SIP increases at the start of this month.</mat-hint>
                    </mat-form-field>
                  </div>
                }
              }
            }
          </section>
        }
        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button type="button" (click)="save()" [disabled]="saving()">
        {{ saving() ? 'Saving…' : 'Add investment' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .investment-form {
        display: grid;
        gap: 16px;
        padding-top: 8px;
      }
      .type-picker {
        display: grid;
        grid-template-columns: repeat(5, minmax(90px, 1fr));
        gap: 8px;
        border: 0;
        padding: 0;
      }
      .type-picker legend {
        grid-column: 1/-1;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .type-picker button {
        display: grid;
        justify-items: center;
        gap: 5px;
        min-height: 78px;
        padding: 10px;
        border: 1px solid #d8e0eb;
        border-radius: 14px;
        background: #fff;
        color: #344054;
      }
      .type-picker button.selected {
        border-color: #0000ff;
        background: #eeeeff;
        color: #0000cc;
      }
      .catalog-search {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .catalog-search span {
        color: #667085;
        font-size: 0.76rem;
      }
      .catalog-results {
        display: grid;
        max-height: 190px;
        overflow: auto;
        border: 1px solid #dfe5ee;
        border-radius: 12px;
      }
      .catalog-results button {
        display: grid;
        gap: 3px;
        padding: 10px 12px;
        border: 0;
        border-bottom: 1px solid #eef1f5;
        background: #fff;
        text-align: left;
      }
      .catalog-results button:hover,
      .catalog-results button:focus-visible {
        background: #f5f6ff;
      }
      .catalog-results span {
        color: #667085;
        font-size: 0.72rem;
      }
      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .wide {
        grid-column: 1/-1;
      }
      .form-section {
        display: grid;
        gap: 10px;
        padding: 16px;
        border: 1px solid #e1e7ef;
        border-radius: 16px;
      }
      .form-section h3,
      .form-section p {
        margin: 0;
      }
      .form-section p {
        color: #667085;
        font-size: 0.82rem;
      }
      .check-row {
        display: flex;
        align-items: center;
        gap: 9px;
        font-weight: 650;
      }
      .accounting-note {
        padding: 10px;
        border-radius: 10px;
        background: #f4f7ff;
        color: #344054 !important;
      }
      .form-error {
        color: #b42318;
      }
      @media (max-width: 700px) {
        .type-picker {
          grid-template-columns: repeat(2, 1fr);
        }
        .form-grid {
          grid-template-columns: 1fr;
        }
        .wide {
          grid-column: auto;
        }
        .catalog-search {
          align-items: start;
          flex-direction: column;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentAccountDialog {
  readonly dialogRef =
    inject<MatDialogRef<InvestmentAccountDialog, InvestmentAccount>>(MatDialogRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly investments = inject(InvestmentStore);
  readonly today = new Date().toISOString().slice(0, 10);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly catalogSearching = signal(false);
  readonly stockResults = signal<StockSearchResult[]>([]);
  readonly fundResults = signal<MutualFundSearchResult[]>([]);
  readonly types: InvestmentType[] = ['STOCK', 'MUTUAL_FUND', 'NPS', 'PPF', 'SSY'];
  readonly form = this.fb.group({
    type: this.fb.control<InvestmentType>('STOCK'),
    name: ['', Validators.required],
    institution: [''],
    tradingSymbol: [''],
    exchange: this.fb.control<'NSE' | 'BSE'>('NSE'),
    providerKey: [''],
    isin: [''],
    schemeCode: [''],
    plan: ['Direct'],
    option: ['Growth'],
    pfmName: [''],
    npsHoldings: [''],
    beneficiaryName: [''],
    asOfDate: [this.today],
    investedAmount: ['0'],
    currentValue: ['0'],
    openingQuantity: [''],
    openingUnits: [''],
    recurringEnabled: [false],
    recurringAmount: [''],
    frequency: this.fb.control<InvestmentFrequencyV2>('MONTHLY'),
    recurringStartDate: [this.today],
    sipType: this.fb.control<MutualFundSipType>('FIXED'),
    stepUpValue: [''],
    stepUpFrequency: this.fb.control<InvestmentFrequencyV2>('HALF_YEARLY'),
    stepUpMonth: [this.today.slice(0, 7)],
  });

  label(type: InvestmentType): string {
    return TYPE_LABELS[type];
  }
  icon(type: InvestmentType): string {
    return {
      STOCK: 'show_chart',
      MUTUAL_FUND: 'account_balance',
      NPS: 'savings',
      PPF: 'lock_clock',
      SSY: 'family_restroom',
    }[type];
  }

  async searchCatalog(): Promise<void> {
    const query = this.form.controls.name.value.trim();
    if (query.length < 2) {
      this.error.set('Enter at least two characters in the investment name.');
      return;
    }
    this.catalogSearching.set(true);
    this.error.set('');
    try {
      if (this.form.controls.type.value === 'STOCK')
        this.stockResults.set(await this.investments.searchStocks(query));
      if (this.form.controls.type.value === 'MUTUAL_FUND')
        this.fundResults.set(await this.investments.searchMutualFunds(query));
    } catch {
      this.error.set(
        'Instrument search is temporarily unavailable. You can enter the provider identifier manually.',
      );
    } finally {
      this.catalogSearching.set(false);
    }
  }

  selectStock(result: StockSearchResult): void {
    this.form.patchValue({
      name: result.name,
      tradingSymbol: result.tradingSymbol,
      exchange: result.exchange,
      providerKey: result.instrumentKey,
      isin: result.isin ?? '',
    });
    this.stockResults.set([]);
  }

  selectFund(result: MutualFundSearchResult): void {
    this.form.patchValue({ name: result.schemeName, schemeCode: result.schemeCode });
    this.fundResults.set([]);
  }

  async save(): Promise<void> {
    if (this.form.invalid || !this.form.controls.name.value.trim()) {
      this.form.markAllAsTouched();
      this.error.set('Enter a name for this investment.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      let instrument: InvestmentInstrument | undefined;
      if (v.type === 'STOCK' && v.providerKey.trim())
        instrument = {
          kind: 'STOCK',
          isin: v.isin.trim() || undefined,
          tradingSymbol: v.tradingSymbol.trim(),
          companyName: v.name.trim(),
          exchange: v.exchange,
          provider: 'UPSTOX',
          upstoxInstrumentKey: v.providerKey.trim(),
        };
      if (v.type === 'MUTUAL_FUND' && v.schemeCode.trim())
        instrument = {
          kind: 'MUTUAL_FUND',
          schemeCode: v.schemeCode.trim(),
          schemeName: v.name.trim(),
          plan: v.plan,
          option: v.option,
          provider: 'AMFI',
        };
      if (v.type === 'NPS' && v.schemeCode.trim()) {
        const additional = v.npsHoldings.split(/\r?\n/).flatMap((line) => {
          const [schemeCode, units, pfmName] = line.split(',').map((part) => part.trim());
          return schemeCode && Number(units) > 0
            ? [{ schemeCode, units, pfmName: pfmName || undefined }]
            : [];
        });
        instrument = {
          kind: 'NPS',
          provider: 'NPS_TRUST',
          schemeHoldings: [
            {
              schemeCode: v.schemeCode.trim(),
              pfmName: v.pfmName.trim() || undefined,
              units: v.openingUnits || '0',
            },
            ...additional,
          ],
        };
      }
      if (v.type === 'PPF' || v.type === 'SSY')
        instrument = {
          kind: v.type,
          provider: 'INTERNAL',
          beneficiaryName: v.type === 'SSY' ? v.beneficiaryName.trim() || undefined : undefined,
        };
      let recurringPlan: RecurringInvestmentPlan | undefined;
      if (v.type !== 'STOCK' && v.recurringEnabled) {
        if (Number(v.recurringAmount) <= 0)
          throw new Error('Recurring amount must be greater than zero.');
        if (v.type === 'MUTUAL_FUND' && v.sipType === 'STEP_UP') {
          if (Number(v.stepUpValue) <= 0)
            throw new Error('SIP increase amount must be greater than zero.');
          if (!/^\d{4}-\d{2}$/.test(v.stepUpMonth))
            throw new Error('Choose the upcoming step-up month.');
          if (v.stepUpMonth < v.recurringStartDate.slice(0, 7))
            throw new Error('Upcoming step-up month cannot be before the SIP start month.');
        }
        recurringPlan = {
          enabled: true,
          amount: v.recurringAmount,
          frequency: v.frequency,
          startDate: v.recurringStartDate,
          sipType: v.type === 'MUTUAL_FUND' ? v.sipType : undefined,
          stepUp:
            v.type === 'MUTUAL_FUND' && v.sipType === 'STEP_UP'
              ? {
                  enabled: true,
                  type: 'FIXED_AMOUNT',
                  value: v.stepUpValue,
                  frequency: v.stepUpFrequency,
                  effectiveFrom: `${v.stepUpMonth}-01`,
                }
              : undefined,
        };
      }
      const input: NewInvestmentInput = {
        name: v.name,
        type: v.type,
        institution: v.institution,
        instrument,
        openingSnapshot: {
          asOfDate: v.asOfDate,
          investedAmount: v.investedAmount || '0',
          currentValue: v.currentValue || v.investedAmount || '0',
          quantity: v.type === 'STOCK' ? v.openingQuantity || undefined : undefined,
          units: v.type === 'MUTUAL_FUND' ? v.openingUnits || undefined : undefined,
          schemeHoldings:
            v.type === 'NPS' && instrument?.kind === 'NPS' ? instrument.schemeHoldings : undefined,
        },
        recurringPlan,
      };
      this.dialogRef.close(await this.investments.addInvestment(input));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Investment could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }
}

@Component({
  selector: 'app-investments-page',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <section class="page investments-v2-page">
      <header class="investment-header">
        <div>
          <span class="eyebrow">INVESTMENTS</span>
          <h1>How your money is growing</h1>
        </div>
        <div class="header-actions">
          <button
            mat-stroked-button
            type="button"
            (click)="refresh()"
            [disabled]="investments.refreshing() || !budget.canWrite()"
          >
            <mat-icon aria-hidden="true">refresh</mat-icon
            >{{ investments.refreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button mat-flat-button type="button" (click)="add()" [disabled]="!budget.canWrite()">
            <mat-icon aria-hidden="true">add</mat-icon>Add investment
          </button>
        </div>
      </header>

      @if (investments.error()) {
        <div class="refresh-message" role="status">
          <mat-icon aria-hidden="true">info</mat-icon><span>{{ investments.error() }}</span>
        </div>
      }
      @if (investments.loading()) {
        <div class="investment-loading">
          <mat-spinner diameter="36" aria-label="Loading investments" /><span
            >Loading investments…</span
          >
        </div>
      } @else if (!investments.accounts().length) {
        <section class="investment-empty">
          <mat-icon aria-hidden="true">savings</mat-icon>
          <h2>No investments yet</h2>
          <p>
            Track stocks, mutual funds, NPS, PPF and SSY to understand how much you're investing and
            how your money is growing.
          </p>
          <button mat-flat-button type="button" (click)="add()">Add Investment</button>
        </section>
      } @else {
        <section class="portfolio-hero" aria-label="Investment portfolio summary">
          <div class="hero-value">
            <span>Current value</span
            ><strong>{{
              investments.display(investments.portfolio().currentValue)
                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong
            ><small
              >{{
                investments.display(investments.portfolio().investedAmount)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}
              invested</small
            >
          </div>
          <div
            class="hero-return"
            [class.loss]="investments.display(investments.portfolio().overallReturnAmount) < 0"
          >
            <span>Overall return</span
            ><strong>{{
              investments.display(investments.portfolio().overallReturnAmount)
                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong
            ><small
              >{{
                investments.display(investments.portfolio().overallReturnPercentage)
                  | number: '1.2-2'
              }}%</small
            >
          </div>
          <div>
            <span>Invested this month</span
            ><strong>{{
              investments.display(investments.portfolio().investedThisMonth)
                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </div>
          <div>
            <span>Recurring commitment</span
            ><strong
              >{{
                investments.display(investments.portfolio().recurringCommitmentMonthly)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}/mo</strong
            >
          </div>
        </section>
        <p class="last-refreshed">
          @if (investments.lastRefreshedAt()) {
            Last refreshed: {{ investments.lastRefreshedAt() | date: 'medium' }}
          } @else {
            Values are saved locally until you refresh.
          }
        </p>

        <section class="investment-section">
          <header>
            <h2>Active investments</h2>
            <span>{{ investments.activeAccounts().length }}</span>
          </header>
          <div class="investment-grid">
            @for (account of investments.activeAccounts(); track account.id) {
              <a class="investment-card" [routerLink]="['/investments', account.id]">
                <div class="card-heading">
                  <div>
                    <h3>{{ account.name }}</h3>
                    <p>
                      {{ label(account.type) }}
                      @if (account.instrument?.kind === 'STOCK') {
                        • {{ account.instrument?.exchange }}
                      }
                      @if (account.instrument?.kind === 'MUTUAL_FUND') {
                        • {{ account.instrument?.plan }} {{ account.instrument?.option }}
                      }
                    </p>
                  </div>
                  @if (
                    account.summary.refreshStatus && account.summary.refreshStatus !== 'CURRENT'
                  ) {
                    <span class="stale">Saved value</span>
                  }
                </div>
                <strong class="card-value">{{
                  investments.display(account.summary.currentValue)
                    | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                }}</strong>
                <dl>
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
                    <dt>Return</dt>
                    <dd
                      [class.negative]="
                        investments.display(account.summary.overallReturnAmount) < 0
                      "
                    >
                      {{
                        investments.display(account.summary.overallReturnAmount)
                          | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                      }}
                      •
                      {{
                        investments.display(account.summary.overallReturnPercentage)
                          | number: '1.2-2'
                      }}%
                    </dd>
                  </div>
                </dl>
                @if (account.recurringPlan?.enabled) {
                  <p class="recurring-line">
                    {{
                      investments.display(investments.effectiveRecurring(account))
                        | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                    }}
                    / {{ cadence(account.recurringPlan?.frequency) }}
                    @if (account.recurringPlan?.stepUp?.enabled) {
                      • Step-up {{ account.recurringPlan?.stepUp?.value
                      }}{{
                        account.recurringPlan?.stepUp?.type === 'PERCENTAGE' ? '%' : ' rupees'
                      }}
                      every {{ cadence(account.recurringPlan?.stepUp?.frequency) }}
                    }
                  </p>
                }
              </a>
            }
          </div>
        </section>

        @if (investments.closedAccounts().length) {
          <mat-expansion-panel class="closed-panel"
            ><mat-expansion-panel-header
              ><mat-panel-title>Closed investments</mat-panel-title
              ><mat-panel-description>{{
                investments.closedAccounts().length
              }}</mat-panel-description></mat-expansion-panel-header
            >
            <div class="investment-grid">
              @for (account of investments.closedAccounts(); track account.id) {
                <a class="investment-card" [routerLink]="['/investments', account.id]"
                  ><div class="card-heading">
                    <div>
                      <h3>{{ account.name }}</h3>
                      <p>{{ label(account.type) }} • Closed</p>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Lifetime contributions</dt>
                      <dd>
                        {{
                          investments.display(account.summary.totalContributions)
                            | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                        }}
                      </dd>
                    </div>
                    <div>
                      <dt>Lifetime return</dt>
                      <dd>
                        {{
                          investments.display(account.summary.overallReturnAmount)
                            | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                        }}
                      </dd>
                    </div>
                  </dl></a
                >
              }
            </div></mat-expansion-panel
          >
        }

        @if (investments.monthlyTransactions().length) {
          <section class="monthly-investments">
            <h2>Investments this month</h2>
            @if (investments.monthlyContributions().length) {
              <h3>Contributions</h3>
              @for (transaction of investments.monthlyContributions(); track transaction.id) {
                <div>
                  <span
                    >{{ accountName(transaction.investmentId) }}
                    <small>{{
                      transaction.source === 'RECURRING' ? 'Recurring' : 'Ad-hoc'
                    }}</small></span
                  ><strong>{{
                    investments.display(transaction.amount)
                      | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                  }}</strong>
                </div>
              }
            }
            @if (investments.monthlyWithdrawals().length) {
              <h3>Investment withdrawals</h3>
              @for (transaction of investments.monthlyWithdrawals(); track transaction.id) {
                <div>
                  <span>{{ accountName(transaction.investmentId) }}</span
                  ><strong>{{
                    investments.display(transaction.amount)
                      | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                  }}</strong>
                </div>
              }
            }
          </section>
        }
      }
    </section>
  `,
  styles: [
    `
      .investments-v2-page {
        max-width: 1180px;
        margin: auto;
      }
      .investment-header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 20px;
      }
      .investment-header h1 {
        margin: 5px 0 0;
        font-size: clamp(1.6rem, 4vw, 2.4rem);
      }
      .eyebrow {
        color: #0000cc;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.16em;
      }
      .header-actions {
        display: flex;
        gap: 10px;
      }
      .refresh-message {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border: 1px solid #fed7aa;
        border-radius: 12px;
        background: #fff7ed;
      }
      .investment-loading,
      .investment-empty {
        display: grid;
        justify-items: center;
        gap: 12px;
        padding: 64px 20px;
        text-align: center;
      }
      .investment-empty mat-icon {
        width: 54px;
        height: 54px;
        font-size: 54px;
        color: #0000cc;
      }
      .investment-empty p {
        max-width: 480px;
        color: #667085;
      }
      .portfolio-hero {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 1px;
        overflow: hidden;
        border: 1px solid #dfe5ee;
        border-radius: 24px;
        background: #dfe5ee;
      }
      .portfolio-hero > div {
        display: grid;
        align-content: center;
        gap: 6px;
        min-height: 112px;
        padding: 22px;
        background: #fff;
      }
      .portfolio-hero .hero-value {
        grid-row: span 2;
        min-height: 225px;
      }
      .portfolio-hero span,
      .portfolio-hero small {
        color: #667085;
      }
      .portfolio-hero strong {
        font-size: 1.35rem;
      }
      .portfolio-hero .hero-value strong {
        font-size: clamp(2.4rem, 6vw, 4.1rem);
        font-weight: 450;
        letter-spacing: -0.06em;
      }
      .hero-return strong,
      .hero-return small,
      .investment-card dd:not(.negative) {
        color: #067647;
      }
      .hero-return.loss strong,
      .hero-return.loss small,
      .negative {
        color: #b42318 !important;
      }
      .last-refreshed {
        color: #667085;
        font-size: 0.78rem;
      }
      .investment-section > header {
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .investment-section > header span {
        padding: 3px 8px;
        border-radius: 999px;
        background: #eef2f6;
        font-size: 0.72rem;
      }
      .investment-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .investment-card {
        display: grid;
        gap: 18px;
        padding: 22px;
        border: 1px solid #dfe5ee;
        border-radius: 20px;
        background: #fff;
        color: #101828;
        text-decoration: none;
        transition:
          border-color 0.15s,
          transform 0.15s;
      }
      .investment-card:hover {
        border-color: #0000cc;
        transform: translateY(-2px);
      }
      .investment-card:focus-visible {
        outline: 3px solid rgba(0, 0, 255, 0.25);
        outline-offset: 2px;
      }
      .card-heading {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .card-heading h3,
      .card-heading p {
        margin: 0;
      }
      .card-heading p {
        margin-top: 4px;
        color: #667085;
        font-size: 0.78rem;
      }
      .card-value {
        font-size: 1.8rem;
        letter-spacing: -0.04em;
      }
      .investment-card dl {
        display: grid;
        gap: 8px;
        margin: 0;
      }
      .investment-card dl div {
        display: flex;
        justify-content: space-between;
        gap: 15px;
      }
      .investment-card dt {
        color: #667085;
      }
      .investment-card dd {
        margin: 0;
        font-weight: 700;
      }
      .stale {
        height: max-content;
        padding: 4px 8px;
        border-radius: 999px;
        background: #f2f4f7;
        color: #667085;
        font-size: 0.68rem;
      }
      .recurring-line {
        margin: 0;
        padding-top: 13px;
        border-top: 1px solid #eaecf0;
        color: #475467;
        font-size: 0.78rem;
      }
      .closed-panel {
        border: 1px solid #dfe5ee !important;
        border-radius: 18px !important;
        box-shadow: none !important;
      }
      .monthly-investments {
        max-width: 720px;
        padding: 22px;
        border: 1px solid #dfe5ee;
        border-radius: 20px;
      }
      .monthly-investments h2 {
        margin-top: 0;
      }
      .monthly-investments h3 {
        margin: 20px 0 8px;
        color: #667085;
        font-size: 0.75rem;
        text-transform: uppercase;
      }
      .monthly-investments > div {
        display: flex;
        justify-content: space-between;
        padding: 9px 0;
        border-bottom: 1px solid #f0f2f5;
      }
      .monthly-investments small {
        margin-left: 6px;
        color: #667085;
      }
      @media (max-width: 760px) {
        .investment-header {
          align-items: start;
        }
        .header-actions {
          flex-direction: column;
        }
        .portfolio-hero {
          grid-template-columns: 1fr 1fr;
        }
        .portfolio-hero .hero-value {
          grid-column: 1/-1;
          grid-row: auto;
          min-height: 180px;
        }
        .portfolio-hero .hero-return {
          grid-column: 1/-1;
        }
        .investment-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentsPage {
  readonly investments = inject(InvestmentStore);
  readonly budget = inject(BudgetStore);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  label(type: InvestmentType): string {
    return TYPE_LABELS[type];
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
  accountName(id: string): string {
    return this.investments.accounts().find((item) => item.id === id)?.name ?? 'Investment';
  }
  add(): void {
    this.dialog.open(InvestmentAccountDialog, {
      width: 'min(760px, 96vw)',
      maxHeight: '92vh',
      autoFocus: 'first-tabbable',
    });
  }
  async refresh(): Promise<void> {
    await this.investments.refresh();
    if (!this.investments.partialRefresh())
      this.snack.open('Investments refreshed.', 'Dismiss', { duration: 3500 });
  }
}
