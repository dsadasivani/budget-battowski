import { CommonModule } from '@angular/common';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
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
import { investmentDecimal } from '../domain/investments/investment-decimal';
import {
  InvestmentStore,
  type MutualFundSearchResult,
  type NewInvestmentInput,
  type NpsSearchResult,
  type StockSearchResult,
} from '../stores/investment.store';

interface NpsHoldingDraft extends NpsSearchResult {
  allocationPercentage: string;
  units: string;
}

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
    MatAutocompleteModule,
    MatButtonModule,
    MatChipsModule,
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
              (click)="selectType(type)"
            >
              <mat-icon aria-hidden="true">{{ icon(type) }}</mat-icon>
              <span>{{ label(type) }}</span>
            </button>
          }
        </fieldset>

        @if (form.controls.type.value === 'STOCK') {
          <div class="instrument-search-row stock-search-row">
            <mat-form-field appearance="outline">
              <mat-label>Stock name</mat-label>
              <input
                matInput
                formControlName="name"
                autocomplete="off"
                required
                (input)="onStockNameInput()"
              />
              <mat-hint>Enter a company name or trading symbol.</mat-hint>
            </mat-form-field>
            <button
              mat-stroked-button
              type="button"
              (click)="searchCatalog()"
              [disabled]="catalogSearching()"
            >
              <mat-icon aria-hidden="true">search</mat-icon>
              {{ catalogSearching() ? 'Searching…' : 'Find stock' }}
            </button>
            @if (stockResults().length) {
              <div class="catalog-results instrument-results" aria-label="Stock search results">
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
          </div>
        } @else if (form.controls.type.value === 'MUTUAL_FUND') {
          <div class="instrument-search-row fund-search-row">
            <mat-form-field appearance="outline">
              <mat-label>Scheme name</mat-label>
              <input
                matInput
                formControlName="name"
                autocomplete="off"
                required
                (input)="onFundNameInput()"
              />
              <mat-hint>Enter a mutual fund or scheme name.</mat-hint>
            </mat-form-field>
            <button
              mat-stroked-button
              type="button"
              (click)="searchCatalog()"
              [disabled]="catalogSearching()"
            >
              <mat-icon aria-hidden="true">search</mat-icon>
              {{ catalogSearching() ? 'Searching…' : 'Find scheme' }}
            </button>
            @if (fundResults().length) {
              <div
                class="catalog-results instrument-results"
                aria-label="Mutual fund scheme search results"
              >
                @for (result of fundResults(); track result.schemeCode) {
                  <button type="button" (click)="selectFund(result)">
                    <strong>{{ result.schemeName }}</strong
                    ><span>AMFI scheme {{ result.schemeCode }}</span>
                  </button>
                }
              </div>
            }
          </div>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name" required />
          </mat-form-field>
        }

        @if (form.controls.type.value === 'STOCK' || form.controls.type.value === 'MUTUAL_FUND') {
          <mat-form-field appearance="outline">
            <mat-label>
              {{
                form.controls.type.value === 'STOCK'
                  ? 'Broker / demat account (optional)'
                  : 'AMC / investment platform (optional)'
              }}
            </mat-label>
            <mat-chip-grid #institutionChipGrid [attr.aria-label]="institutionFieldLabel()">
              @if (form.controls.institution.value) {
                <mat-chip-row (removed)="removeInstitution()">
                  {{ form.controls.institution.value }}
                  <button
                    matChipRemove
                    type="button"
                    [attr.aria-label]="'Remove ' + form.controls.institution.value"
                  >
                    <mat-icon aria-hidden="true">cancel</mat-icon>
                  </button>
                </mat-chip-row>
              } @else {
                <input
                  placeholder="Type to search or add"
                  autocomplete="off"
                  [formControl]="institutionInput"
                  [matAutocomplete]="institutionAutocomplete"
                  [matChipInputFor]="institutionChipGrid"
                  [matChipInputSeparatorKeyCodes]="separatorKeysCodes"
                  [matChipInputAddOnBlur]="true"
                  (matChipInputTokenEnd)="addInstitution($event)"
                />
              }
            </mat-chip-grid>
            <mat-autocomplete
              #institutionAutocomplete="matAutocomplete"
              (optionSelected)="selectInstitution($event.option.value)"
            >
              @for (tag of institutionOptions(); track tag) {
                <mat-option [value]="tag">{{ tag }}</mat-option>
              }
            </mat-autocomplete>
            <mat-hint>
              {{
                form.controls.type.value === 'STOCK'
                  ? 'Choose a saved broker or type a new one. New values save on add.'
                  : 'Choose a saved AMC/platform or type a new one. New values save on add.'
              }}
            </mat-hint>
          </mat-form-field>
        } @else if (form.controls.type.value !== 'NPS') {
          <mat-form-field appearance="outline">
            <mat-label>Institution (optional)</mat-label>
            <input matInput formControlName="institution" />
          </mat-form-field>
        }

        @switch (form.controls.type.value) {
          @case ('STOCK') {
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Trading symbol</mat-label>
                <input matInput formControlName="tradingSymbol" readonly />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Exchange</mat-label>
                <input matInput formControlName="exchange" readonly />
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>Market instrument key</mat-label>
                <input matInput formControlName="providerKey" readonly />
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>ISIN</mat-label>
                <input matInput formControlName="isin" readonly />
              </mat-form-field>
            </div>
            @if (!form.controls.providerKey.value) {
              <p class="selection-note">Find and select a stock to fill its market details.</p>
            }
          }
          @case ('MUTUAL_FUND') {
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>AMFI scheme code</mat-label>
                <input matInput formControlName="schemeCode" readonly />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Plan</mat-label>
                <input matInput formControlName="plan" readonly />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Option</mat-label>
                <input matInput formControlName="option" readonly />
              </mat-form-field>
            </div>
            @if (!form.controls.schemeCode.value) {
              <p class="selection-note">Find and select a scheme to fill its fund details.</p>
            }
          }
          @case ('NPS') {
            <section class="nps-scheme-section" aria-labelledby="nps-schemes-heading">
              <div>
                <h3 id="nps-schemes-heading">Scheme holdings</h3>
                <p>Search using the scheme name shown on your CRA statement.</p>
              </div>
              <div class="instrument-search-row nps-search-row">
                <mat-form-field appearance="outline">
                  <mat-label>NPS scheme name or ID</mat-label>
                  <input
                    matInput
                    autocomplete="off"
                    [formControl]="npsSearchInput"
                    (input)="npsResults.set([])"
                  />
                  <mat-hint>Include POP, DIRECT, or GS when shown on the statement.</mat-hint>
                </mat-form-field>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="searchNpsCatalog()"
                  [disabled]="catalogSearching()"
                >
                  <mat-icon aria-hidden="true">search</mat-icon>
                  {{ catalogSearching() ? 'Searching…' : 'Find scheme' }}
                </button>
                @if (npsResults().length) {
                  <div
                    class="catalog-results instrument-results"
                    aria-label="NPS scheme search results"
                  >
                    @for (result of npsResults(); track result.schemeCode) {
                      <button
                        type="button"
                        (click)="selectNpsScheme(result)"
                        [disabled]="hasNpsHolding(result.schemeCode)"
                      >
                        <strong>{{ result.schemeName }}</strong>
                        <span>
                          {{ result.pfmName }} • {{ result.schemeCode }} • {{ result.channel }}
                          @if (result.tier) {
                            • Tier {{ result.tier }}
                          }
                        </span>
                      </button>
                    }
                  </div>
                }
              </div>

              @if (!npsHoldings().length) {
                <p class="selection-note">Find and select every scheme shown on your statement.</p>
              } @else {
                <div class="nps-holdings" aria-label="Selected NPS scheme holdings">
                  @for (holding of npsHoldings(); track holding.schemeCode) {
                    <article class="nps-holding">
                      <header>
                        <div>
                          <strong>{{ holding.schemeName }}</strong>
                          <span>
                            {{ holding.pfmName }} • {{ holding.schemeCode }} •
                            {{ holding.channel }}
                          </span>
                        </div>
                        <button
                          mat-icon-button
                          type="button"
                          (click)="removeNpsHolding(holding.schemeCode)"
                          [attr.aria-label]="'Remove ' + holding.schemeName"
                        >
                          <mat-icon aria-hidden="true">close</mat-icon>
                        </button>
                      </header>
                      <div class="nps-holding-values">
                        <div class="nps-input-fields">
                          <mat-form-field appearance="outline">
                            <mat-label>Total units</mat-label>
                            <input
                              matInput
                              type="number"
                              min="0"
                              step="any"
                              required
                              [value]="holding.units"
                              [attr.aria-label]="'Total units for ' + holding.schemeName"
                              (input)="updateNpsUnits(holding.schemeCode, $event)"
                            />
                          </mat-form-field>
                          <mat-form-field appearance="outline">
                            <mat-label>Contribution percentage</mat-label>
                            <input
                              matInput
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              required
                              [value]="holding.allocationPercentage"
                              [attr.aria-label]="
                                'Contribution percentage for ' + holding.schemeName
                              "
                              (input)="updateNpsAllocationPercentage(holding.schemeCode, $event)"
                            />
                            <span matTextSuffix>%</span>
                            <!-- <mat-hint>Used only to split recurring investments.</mat-hint> -->
                          </mat-form-field>
                        </div>
                        <dl class="nps-holding-metrics">
                          <div>
                            <dt>Latest NAV</dt>
                            <dd>
                              @if (npsNav(holding); as nav) {
                                {{ nav | currency: 'INR' : 'symbol' : '1.2-4' : 'en-IN' }}
                              } @else {
                                Not available
                              }
                            </dd>
                          </div>
                          <div>
                            <dt>Current value (units &times; NAV)</dt>
                            <dd>
                              {{
                                npsHoldingValue(holding)
                                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                              }}
                            </dd>
                          </div>
                          <div>
                            <dt>NAV date</dt>
                            <dd>
                              @if (npsNavDate(holding); as navDate) {
                                {{ navDate | date: 'mediumDate' }}
                              } @else {
                                Not available
                              }
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </article>
                  }
                  <p
                    class="nps-allocation-total"
                    [class.complete]="npsAllocationComplete()"
                    role="status"
                  >
                    Allocation total: {{ npsAllocationTotal() | number: '1.0-4' }}% of 100%
                  </p>
                  <p class="nps-allocation-hint">
                    This split does not affect current scheme values. Values always use total units
                    &times; latest NAV.
                  </p>
                </div>
              }
            </section>
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
              <input
                matInput
                type="number"
                min="0"
                formControlName="currentValue"
                [readonly]="form.controls.type.value === 'NPS'"
              />
              @if (form.controls.type.value === 'NPS') {
                <mat-hint>Calculated from selected units and latest NPS Trust NAVs.</mat-hint>
              }
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
      .instrument-search-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: 12px;
      }
      .instrument-search-row > button {
        min-height: 56px;
        white-space: nowrap;
      }
      .instrument-results {
        grid-column: 1;
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
      .selection-note {
        margin: -6px 0 0;
        color: #667085;
        font-size: 0.82rem;
      }
      .nps-scheme-section,
      .nps-holdings {
        display: grid;
        gap: 12px;
      }
      .nps-scheme-section {
        padding: 16px;
        border: 1px solid #e1e7ef;
        border-radius: 16px;
      }
      .nps-scheme-section h3,
      .nps-scheme-section p,
      .nps-holding dl,
      .nps-holding dd {
        margin: 0;
      }
      .nps-scheme-section > div:first-child p,
      .nps-holding span,
      .nps-holding dt {
        color: #667085;
        font-size: 0.76rem;
      }
      .nps-holding {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid #dfe5ee;
        border-radius: 12px;
        background: #fbfcfe;
      }
      .nps-holding header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        justify-content: space-between;
      }
      .nps-holding header > div {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .nps-holding-values {
        display: grid;
        gap: 10px;
      }
      .nps-input-fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 240px));
        gap: 10px;
      }
      .nps-holding-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .nps-holding-metrics div {
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 10px;
        border: 1px solid #e4e9f1;
        border-radius: 10px;
        background: #fff;
      }
      .nps-holding dd {
        color: #344054;
        font-size: 0.84rem;
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .nps-allocation-total {
        margin: 0;
        padding: 10px 12px;
        border: 1px solid #f5c2c7;
        border-radius: 10px;
        background: #fff5f5;
        color: #b42318;
        font-size: 0.82rem;
        font-weight: 700;
      }
      .nps-allocation-total.complete {
        border-color: #a7e2c3;
        background: #effbf4;
        color: #047857;
      }
      .nps-allocation-hint {
        margin: -4px 0 0 !important;
        color: #667085;
        font-size: 0.76rem;
      }
      @media (max-width: 700px) {
        .type-picker {
          grid-template-columns: repeat(2, 1fr);
        }
        .form-grid {
          grid-template-columns: 1fr;
        }
        .nps-input-fields {
          grid-template-columns: 1fr;
        }
        .wide {
          grid-column: auto;
        }
      }
      @media (max-width: 480px) {
        .nps-holding-metrics {
          grid-template-columns: 1fr;
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
  readonly npsResults = signal<NpsSearchResult[]>([]);
  readonly npsHoldings = signal<NpsHoldingDraft[]>([]);
  readonly npsAllocationTotal = computed(() =>
    this.npsHoldings()
      .reduce(
        (total, holding) => total.plus(holding.allocationPercentage || 0),
        investmentDecimal(0),
      )
      .toDecimalPlaces(4)
      .toNumber(),
  );
  readonly npsAllocationComplete = computed(() => {
    const holdings = this.npsHoldings();
    return (
      holdings.length > 0 &&
      holdings.every((holding) => Number(holding.allocationPercentage) > 0) &&
      investmentDecimal(this.npsAllocationTotal()).eq(100)
    );
  });
  private catalogRequestId = 0;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;
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
    plan: [''],
    option: [''],
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
  readonly institutionInput = this.fb.control('');
  readonly npsSearchInput = this.fb.control('');
  private readonly selectedType = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  private readonly institutionQuery = toSignal(this.institutionInput.valueChanges, {
    initialValue: this.institutionInput.value,
  });
  readonly institutionOptions = computed(() => {
    const type = this.selectedType();
    if (type !== 'STOCK' && type !== 'MUTUAL_FUND') return [];

    const query = this.institutionQuery().trim().toLocaleLowerCase();
    const uniqueTags = new Map<string, string>();
    for (const account of this.investments.accounts()) {
      const tag = account.institution?.trim();
      if (account.type === type && tag) uniqueTags.set(tag.toLocaleLowerCase(), tag);
    }
    return [...uniqueTags.values()]
      .filter((tag) => !query || tag.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b));
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

  institutionFieldLabel(): string {
    return this.form.controls.type.value === 'STOCK'
      ? 'Broker or demat account'
      : 'AMC or investment platform';
  }

  addInstitution(event: MatChipInputEvent): void {
    this.selectInstitution(event.value);
    event.chipInput.clear();
  }

  selectInstitution(value: string): void {
    const tag = value.trim();
    if (!tag) return;
    this.form.controls.institution.setValue(tag);
    this.institutionInput.setValue('');
  }

  removeInstitution(): void {
    this.form.controls.institution.setValue('');
    this.institutionInput.setValue('');
  }

  private commitPendingInstitution(): void {
    this.selectInstitution(this.institutionInput.value);
  }

  selectType(type: InvestmentType): void {
    if (this.form.controls.type.value === type) return;

    this.catalogRequestId += 1;
    this.form.reset({ type });
    this.institutionInput.reset();
    this.stockResults.set([]);
    this.fundResults.set([]);
    this.npsResults.set([]);
    this.npsHoldings.set([]);
    this.npsSearchInput.reset();
    this.catalogSearching.set(false);
    this.error.set('');
  }

  async searchCatalog(): Promise<void> {
    const query = this.form.controls.name.value.trim();
    if (query.length < 2) {
      this.error.set('Enter at least two characters in the investment name.');
      return;
    }
    const type = this.form.controls.type.value;
    const requestId = ++this.catalogRequestId;
    this.catalogSearching.set(true);
    this.error.set('');
    try {
      if (type === 'STOCK') {
        const results = await this.investments.searchStocks(query);
        if (requestId === this.catalogRequestId && this.form.controls.type.value === type)
          this.stockResults.set(results);
      }
      if (type === 'MUTUAL_FUND') {
        const results = await this.investments.searchMutualFunds(query);
        if (requestId === this.catalogRequestId && this.form.controls.type.value === type)
          this.fundResults.set(results);
      }
    } catch {
      if (requestId === this.catalogRequestId)
        this.error.set(
          type === 'STOCK'
            ? 'Stock search is temporarily unavailable. Try again.'
            : 'Mutual fund search is temporarily unavailable. Try again.',
        );
    } finally {
      if (requestId === this.catalogRequestId) this.catalogSearching.set(false);
    }
  }

  async searchNpsCatalog(): Promise<void> {
    const query = this.npsSearchInput.value.trim();
    if (query.length < 2) {
      this.error.set('Enter at least two characters from the NPS scheme name or ID.');
      return;
    }
    const requestId = ++this.catalogRequestId;
    this.catalogSearching.set(true);
    this.error.set('');
    try {
      const results = await this.investments.searchNps(query);
      if (requestId === this.catalogRequestId && this.form.controls.type.value === 'NPS')
        this.npsResults.set(results);
    } catch {
      if (requestId === this.catalogRequestId)
        this.error.set('NPS scheme search is temporarily unavailable. Try again.');
    } finally {
      if (requestId === this.catalogRequestId) this.catalogSearching.set(false);
    }
  }

  hasNpsHolding(schemeCode: string): boolean {
    return this.npsHoldings().some((holding) => holding.schemeCode === schemeCode);
  }

  selectNpsScheme(result: NpsSearchResult): void {
    if (this.hasNpsHolding(result.schemeCode)) return;
    const selectedTier = this.npsHoldings().find((holding) => holding.tier)?.tier;
    if (selectedTier && result.tier && result.tier !== selectedTier) {
      this.error.set(
        `This is a Tier ${result.tier} scheme. This account already contains Tier ${selectedTier} schemes.`,
      );
      return;
    }
    this.npsHoldings.update((holdings) => [
      ...holdings,
      {
        ...result,
        allocationPercentage: holdings.length ? '' : '100',
        units: '',
      },
    ]);
    this.npsResults.set([]);
    this.npsSearchInput.reset();
    this.error.set('');
    this.syncNpsSnapshot();
  }

  updateNpsUnits(schemeCode: string, event: Event): void {
    this.setNpsUnits(schemeCode, (event.target as HTMLInputElement).value);
  }

  updateNpsAllocationPercentage(schemeCode: string, event: Event): void {
    this.setNpsAllocationPercentage(schemeCode, (event.target as HTMLInputElement).value);
  }

  setNpsAllocationPercentage(schemeCode: string, allocationPercentage: string): void {
    this.npsHoldings.update((holdings) =>
      holdings.map((holding) =>
        holding.schemeCode === schemeCode ? { ...holding, allocationPercentage } : holding,
      ),
    );
  }

  setNpsUnits(schemeCode: string, units: string): void {
    this.npsHoldings.update((holdings) =>
      holdings.map((holding) =>
        holding.schemeCode === schemeCode ? { ...holding, units } : holding,
      ),
    );
    this.syncNpsSnapshot();
  }

  removeNpsHolding(schemeCode: string): void {
    this.npsHoldings.update((holdings) =>
      holdings.filter((holding) => holding.schemeCode !== schemeCode),
    );
    this.syncNpsSnapshot();
  }

  npsHoldingValue(holding: NpsHoldingDraft): number {
    const nav = this.npsNav(holding);
    const units = Number(holding.units);
    if (nav === null || !Number.isFinite(units) || units <= 0) return 0;
    return investmentDecimal(holding.units).mul(nav).toNumber();
  }

  npsNav(holding: NpsHoldingDraft): number | null {
    const nav = Number(holding.nav);
    return Number.isFinite(nav) && nav > 0 ? nav : null;
  }

  npsNavDate(holding: NpsHoldingDraft): string | null {
    return /^\d{4}-\d{2}-\d{2}$/.test(holding.navDate) ? holding.navDate : null;
  }

  private syncNpsSnapshot(): void {
    const holdings = this.npsHoldings();
    const value = holdings.reduce(
      (total, holding) => total.plus(this.npsHoldingValue(holding)),
      investmentDecimal(0),
    );
    this.form.controls.currentValue.setValue(value.toDecimalPlaces(2).toString());
    const latestNavDate = holdings
      .map((holding) => holding.navDate)
      .sort()
      .at(-1);
    if (latestNavDate && latestNavDate <= this.today)
      this.form.controls.asOfDate.setValue(latestNavDate);
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

  onStockNameInput(): void {
    this.stockResults.set([]);
    this.form.patchValue(
      {
        tradingSymbol: '',
        exchange: 'NSE',
        providerKey: '',
        isin: '',
      },
      { emitEvent: false },
    );
  }

  onFundNameInput(): void {
    this.fundResults.set([]);
    this.form.patchValue(
      {
        schemeCode: '',
        plan: '',
        option: '',
      },
      { emitEvent: false },
    );
  }

  selectFund(result: MutualFundSearchResult): void {
    const schemeName = result.schemeName;
    this.form.patchValue({
      name: schemeName,
      schemeCode: result.schemeCode,
      plan: /\bdirect\b/i.test(schemeName) ? 'Direct' : 'Regular',
      option: /\b(?:idcw|dividend)\b/i.test(schemeName) ? 'IDCW' : 'Growth',
    });
    this.fundResults.set([]);
  }

  async save(): Promise<void> {
    this.commitPendingInstitution();
    if (this.form.invalid || !this.form.controls.name.value.trim()) {
      this.form.markAllAsTouched();
      this.error.set('Enter a name for this investment.');
      return;
    }
    if (this.form.controls.type.value === 'STOCK' && !this.form.controls.providerKey.value.trim()) {
      this.error.set('Find and select a stock before adding the investment.');
      return;
    }
    if (
      this.form.controls.type.value === 'MUTUAL_FUND' &&
      !this.form.controls.schemeCode.value.trim()
    ) {
      this.error.set('Find and select a mutual fund scheme before adding the investment.');
      return;
    }
    if (this.form.controls.type.value === 'NPS') {
      if (!this.npsHoldings().length) {
        this.error.set('Find and select at least one NPS scheme before adding the investment.');
        return;
      }
      if (this.npsHoldings().some((holding) => Number(holding.units) <= 0)) {
        this.error.set('Enter total units greater than zero for every selected NPS scheme.');
        return;
      }
      if (!this.npsAllocationComplete()) {
        this.error.set(
          'Enter an allocation greater than zero for every NPS scheme. The total must be exactly 100%.',
        );
        return;
      }
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
      if (v.type === 'NPS') {
        instrument = {
          kind: 'NPS',
          provider: 'NPS_TRUST',
          schemeHoldings: this.npsHoldings().map((holding) => ({
            schemeCode: holding.schemeCode,
            schemeName: holding.schemeName,
            pfmName: holding.pfmName,
            assetClass: holding.assetClass,
            tier: holding.tier,
            channel: holding.channel,
            allocationPercentage: holding.allocationPercentage,
            units: holding.units,
            nav: holding.nav,
            navDate: holding.navDate,
          })),
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
                      investments.display(investments.recurringPlanDisplayAmount(account))
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
