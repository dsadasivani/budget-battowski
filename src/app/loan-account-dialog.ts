import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { merge } from 'rxjs';

import type { PaymentMode } from './budget.models';
import type { ParsedLoanPdf } from './domain/loans/loan-pdf-parser';
import {
  loanPolicyDescription,
  matchLoanCalculationPolicy,
  type LoanPolicyMatchResult,
} from './domain/loans/loan-policy-matcher';
import type { LoanAccount, LoanEvent, LoanRoundingPolicy } from './domain/loans/loan.models';
import { LoanPdfImportPanel } from './loan-pdf-import-panel';

export interface LoanAccountDialogData {
  account?: LoanAccount;
  events?: LoanEvent[];
  memberEmail?: string;
  paymentModes: PaymentMode[];
}

export interface LoanAccountDialogResult {
  account: LoanAccount;
  openingAnchor?: LoanEvent;
  matchingPartPayment?: LoanEvent;
  lenderReconciliations?: Array<{
    asOfDate: string;
    lenderReportedOutstanding: number;
    tolerance: number;
    notes: string;
  }>;
  assumeHistoricalEmisPaid: boolean;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

@Component({
  selector: 'app-loan-account-dialog',
  imports: [
    CurrencyPipe,
    DatePipe,
    LoanPdfImportPanel,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatStepperModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.account ? 'Edit loan account' : 'Accurate loan setup' }}</h2>
    <mat-dialog-content>
      <p class="intro">
        Contract terms and recorded events are the source of truth. Outstanding balance is always
        calculated.
      </p>
      @if (data.account) {
        <p class="edit-notice">
          Contractual cash terms are locked to protect history. Calculation policy remains editable
          so it can be reconciled to a lender statement. Record later rate, EMI, tenure, and balance
          changes from the account's Transactions tab.
        </p>
      }
      <app-loan-pdf-import-panel (parsed)="applyParsedPdf($event)" />
      @if (pdfImportWarnings().length) {
        <div class="import-warnings" role="status" aria-live="polite">
          <strong>Review these items</strong>
          <ul>
            @for (warning of pdfImportWarnings(); track warning) {
              <li>{{ warning }}</li>
            }
          </ul>
        </div>
      }
      <form [formGroup]="form" id="loan-account-form" (ngSubmit)="save()">
        <mat-stepper orientation="vertical" [linear]="true">
          <mat-step [stepControl]="form.controls.lender">
            <ng-template matStepLabel>Account</ng-template>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Lender</mat-label>
                <input matInput formControlName="lender" autocomplete="organization" />
                @if (form.controls.lender.touched && form.controls.lender.invalid) {
                  <mat-error>Lender is required</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Loan type</mat-label>
                <input matInput formControlName="loanType" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Account last four (optional)</mat-label>
                <input matInput formControlName="accountReferenceLastFour" maxlength="4" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Payment mode</mat-label>
                <mat-select formControlName="paymentModeId">
                  <mat-option value="">Not linked</mat-option>
                  @for (mode of data.paymentModes; track mode.id) {
                    <mat-option [value]="mode.id">{{ mode.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <button mat-button matStepperNext type="button">Continue</button>
          </mat-step>

          <mat-step [stepControl]="form.controls.disbursedAmount">
            <ng-template matStepLabel>Contract</ng-template>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Disbursed amount</mat-label>
                <input matInput type="number" min="0.01" formControlName="disbursedAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Sanctioned amount (optional)</mat-label>
                <input matInput type="number" min="0" formControlName="sanctionedAmount" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Disbursement date</mat-label>
                <input matInput type="date" formControlName="disbursementDate" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>First EMI date</mat-label>
                <input matInput type="date" formControlName="firstEmiDate" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Initial EMI</mat-label>
                <input matInput type="number" min="0.01" formControlName="initialEmi" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Initial annual rate (%)</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  step="0.01"
                  formControlName="initialAnnualRate"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Interest type</mat-label>
                <mat-select formControlName="interestType">
                  <mat-option value="fixed">Fixed</mat-option>
                  <mat-option value="floating">Floating</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Interest shown on first EMI (optional)</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  step="0.01"
                  formControlName="firstPeriodInterestAmount"
                />
                <mat-hint>Copy this from installment 1 of the lender schedule.</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Original tenure (months)</mat-label>
                <input matInput type="number" min="1" formControlName="originalTenureMonths" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Contract maturity (optional)</mat-label>
                <input matInput type="date" formControlName="contractualMaturityDate" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>After an extra payment</mat-label>
                <mat-select formControlName="postPrepaymentStrategy">
                  <mat-option value="keep-emi-reduce-tenure">Keep EMI, reduce tenure</mat-option>
                  <mat-option value="keep-tenure-reduce-emi">Keep tenure, reduce EMI</mat-option>
                  <mat-option value="bank-specified">I will enter the lender's changes</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>How should calculations be set up?</mat-label>
                <mat-select
                  formControlName="calculationSetup"
                  (selectionChange)="calculationSetupChanged()"
                >
                  <mat-option value="standard">Standard estimate</mat-option>
                  <mat-option value="lender-match">Match my lender's schedule</mat-option>
                  <mat-option value="advanced">Choose calculation rules manually</mat-option>
                </mat-select>
                <mat-hint>Choose lender matching when a repayment schedule is available.</mat-hint>
              </mat-form-field>
            </div>

            @if (form.controls.calculationSetup.value === 'standard') {
              <section class="setup-card" aria-label="Standard calculation">
                <strong>Standard estimate</strong>
                <p>
                  Uses interest once per EMI cycle and keeps paise during calculations. You can
                  switch to lender matching if the calculated balance differs from a statement.
                </p>
              </section>
            }

            @if (form.controls.calculationSetup.value === 'lender-match') {
              <section class="setup-card match-card" aria-labelledby="lender-match-heading">
                <h3 id="lender-match-heading">Match lender schedule rows</h3>
                <p>
                  Add as many EMI rows as needed. Rows around a part-payment or rate change provide
                  the strongest evidence.
                </p>
                <div formArrayName="matchCheckpoints" class="checkpoint-list">
                  @for (
                    checkpoint of form.controls.matchCheckpoints.controls;
                    track checkpoint;
                    let index = $index
                  ) {
                    <fieldset [formGroupName]="index" class="checkpoint-row">
                      <legend>EMI row {{ index + 1 }}</legend>
                      <div class="form-grid compact-grid">
                        <mat-form-field appearance="outline">
                          <mat-label>EMI date</mat-label>
                          <input matInput type="date" formControlName="dueDate" />
                        </mat-form-field>
                        <mat-form-field appearance="outline">
                          <mat-label>Interest shown</mat-label>
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            formControlName="interestAmount"
                          />
                        </mat-form-field>
                        <mat-form-field appearance="outline">
                          <mat-label>Closing principal</mat-label>
                          <input
                            matInput
                            type="number"
                            min="0"
                            step="0.01"
                            formControlName="closingPrincipal"
                          />
                        </mat-form-field>
                      </div>
                      <button
                        mat-button
                        type="button"
                        (click)="removeMatchCheckpoint(index)"
                        [disabled]="form.controls.matchCheckpoints.length === 1"
                        [attr.aria-label]="'Remove EMI row ' + (index + 1)"
                      >
                        Remove row
                      </button>
                    </fieldset>
                  }
                </div>
                <button mat-button type="button" (click)="addMatchCheckpoint()">
                  Add another EMI row
                </button>
                <div class="form-grid compact-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Part-payment date (optional)</mat-label>
                    <input matInput type="date" formControlName="matchPartPaymentDate" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Part-payment amount (optional)</mat-label>
                    <input
                      matInput
                      type="number"
                      min="0"
                      step="0.01"
                      formControlName="matchPartPaymentAmount"
                    />
                  </mat-form-field>
                </div>
                @if (matchPartPaymentWillBeRecorded()) {
                  <p class="recording-note">
                    This part-payment will also be recorded as a loan transaction when you save.
                  </p>
                }
                <button
                  mat-stroked-button
                  type="button"
                  (click)="findLenderMatch()"
                  [disabled]="!canFindLenderMatch()"
                >
                  Find matching calculation
                </button>
                @if (policyMatch(); as result) {
                  <div
                    class="match-result"
                    [class.exact]="result.status === 'exact' || result.status === 'ambiguous'"
                    role="status"
                    aria-live="polite"
                  >
                    <strong>{{ result.message }}</strong>
                    @if (result.best; as best) {
                      <p>{{ policyDescription(best) }}</p>
                      <p>{{ best.checkpointResults.length }} schedule rows checked.</p>
                      <details class="matched-rows">
                        <summary>Review matched rows</summary>
                        @for (checkpoint of best.checkpointResults; track checkpoint.dueDate) {
                          <dl [attr.aria-label]="'Match for EMI dated ' + checkpoint.dueDate">
                            <div>
                              <dt>EMI date</dt>
                              <dd>{{ checkpoint.dueDate | date: 'mediumDate' }}</dd>
                            </div>
                            <div>
                              <dt>Calculated interest</dt>
                              <dd>
                                {{
                                  checkpoint.calculatedInterest
                                    | currency: 'INR' : 'symbol' : '1.0-2' : 'en-IN'
                                }}
                              </dd>
                            </div>
                            <div>
                              <dt>Calculated closing principal</dt>
                              <dd>
                                {{
                                  checkpoint.calculatedClosingPrincipal
                                    | currency: 'INR' : 'symbol' : '1.0-2' : 'en-IN'
                                }}
                              </dd>
                            </div>
                          </dl>
                        }
                      </details>
                      <p class="difference-total">
                        Total difference:
                        <strong>
                          {{
                            best.totalDifference | currency: 'INR' : 'symbol' : '1.0-2' : 'en-IN'
                          }}
                        </strong>
                      </p>
                      <button mat-flat-button type="button" (click)="applyLenderMatch()">
                        {{ matchApplied() ? 'Recommended rule applied' : 'Apply recommended rule' }}
                      </button>
                    }
                  </div>
                }
              </section>
            }

            @if (form.controls.calculationSetup.value !== 'standard') {
              <details
                class="advanced-settings"
                [open]="form.controls.calculationSetup.value === 'advanced'"
              >
                <summary>Advanced calculation settings</summary>
                <p>These values are normally filled by lender schedule matching.</p>
                <div class="form-grid compact-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>How interest is calculated</mat-label>
                    <mat-select formControlName="interestCalculationMethod">
                      <mat-option value="monthly-reducing">Once per EMI cycle</mat-option>
                      <mat-option value="daily-reducing">Based on daily balance</mat-option>
                    </mat-select>
                    <mat-hint>Daily balance reacts immediately to mid-cycle changes.</mat-hint>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Interest day basis</mat-label>
                    <mat-select formControlName="dayCountConvention">
                      <mat-option value="actual-365">Actual days ÷ 365</mat-option>
                      <mat-option value="actual-360">Actual days ÷ 360</mat-option>
                      <mat-option value="actual-366">Actual days ÷ 366</mat-option>
                      <mat-option value="actual-actual">Leap-year adjusted</mat-option>
                      <mat-option value="30-360">30-day months</mat-option>
                    </mat-select>
                    <mat-hint>Used when interest is based on daily balance.</mat-hint>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Round calculated amounts to</mat-label>
                    <mat-select formControlName="roundingScale">
                      <mat-option [value]="0">Nearest rupee</mat-option>
                      <mat-option [value]="2">Nearest paise</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Advanced rounding rule</mat-label>
                    <mat-select formControlName="roundingMode">
                      <mat-option value="half-up">Round 0.5 up</mat-option>
                      <mat-option value="half-even">Round 0.5 to nearest even</mat-option>
                    </mat-select>
                    <mat-hint>Only affects values that fall exactly halfway.</mat-hint>
                  </mat-form-field>
                </div>
              </details>
            }
            <div class="step-actions">
              <button mat-button matStepperPrevious type="button">Back</button>
              <button mat-button matStepperNext type="button">Continue</button>
            </div>
          </mat-step>

          <mat-step>
            <ng-template matStepLabel>Opening position</ng-template>
            <p>
              If the loan is already running, enter a lender-reported principal balance and its
              exact date. This creates a recorded balance anchor; it does not become an editable
              calculated field.
            </p>
            @if (!data.account) {
              <mat-checkbox formControlName="assumeHistoricalEmisPaid">
                Treat every scheduled EMI due through today as paid and add it to Expenses
              </mat-checkbox>
              <p class="assumption-note">
                Keep this selected for an existing loan with no missed installments. You can clear
                it when importing an overdue or disputed account.
              </p>
            }
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Reported outstanding (optional)</mat-label>
                <input matInput type="number" min="0" formControlName="openingBalance" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Balance as of</mat-label>
                <input matInput type="date" formControlName="balanceAsOfDate" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="wide">
                <mat-label>Notes</mat-label>
                <textarea matInput rows="3" formControlName="notes"></textarea>
              </mat-form-field>
            </div>
            <button mat-button matStepperPrevious type="button">Back</button>
          </mat-step>
        </mat-stepper>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button type="submit" form="loan-account-form">Save loan</button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    .intro {
      color: #475569;
      max-width: 68ch;
    }
    .edit-notice {
      padding: 10px 12px;
      border-radius: 8px;
      color: #1e3a8a;
      background: #eff6ff;
    }
    .assumption-note {
      margin: 6px 0 0 32px;
      color: #64748b;
      font-size: 0.82rem;
    }
    .setup-card,
    .advanced-settings {
      margin-top: 16px;
      padding: 16px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #f8fafc;
    }
    .setup-card h3,
    .setup-card p,
    .advanced-settings p {
      margin-top: 0;
    }
    .setup-card p,
    .advanced-settings p {
      color: #475569;
    }
    .advanced-settings summary {
      cursor: pointer;
      font-weight: 700;
    }
    .checkpoint-list {
      display: grid;
      gap: 10px;
      max-height: 420px;
      overflow: auto;
      margin: 12px 0 4px;
      padding-right: 4px;
    }
    .checkpoint-row {
      margin: 0;
      padding: 4px 12px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
    }
    .checkpoint-row legend {
      padding: 0 6px;
      font-weight: 700;
    }
    .import-warnings {
      padding: 10px 12px;
      border-radius: 8px;
      color: #92400e;
      background: #fffbeb;
    }
    .import-warnings ul {
      margin: 6px 0 0;
      padding-left: 20px;
    }
    .matched-rows {
      max-height: 320px;
      overflow: auto;
    }
    .matched-rows summary {
      cursor: pointer;
      font-weight: 600;
    }
    .compact-grid {
      padding-top: 8px;
    }
    .recording-note {
      padding: 8px 10px;
      border-radius: 8px;
      background: #eff6ff;
      color: #1e3a8a !important;
    }
    .match-result {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid #f59e0b;
      border-radius: 10px;
      background: #fffbeb;
    }
    .match-result.exact {
      border-color: #10b981;
      background: #ecfdf5;
    }
    .match-result dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 12px 0;
    }
    .match-result dl div {
      display: grid;
      gap: 2px;
    }
    .match-result dt {
      color: #64748b;
      font-size: 0.78rem;
    }
    .match-result dd {
      margin: 0;
      font-weight: 700;
    }
    .difference-total {
      margin-bottom: 12px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding-top: 16px;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .step-actions {
      display: flex;
      gap: 8px;
    }
    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
      .wide {
        grid-column: auto;
      }
      .match-result dl {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoanAccountDialog {
  readonly data = inject<LoanAccountDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<LoanAccountDialog, LoanAccountDialogResult>);
  private readonly formBuilder = inject(FormBuilder);
  private readonly account = this.data.account;
  private readonly generatedAccountId = `loan-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  private readonly latestPartPayment = [...(this.data.events ?? [])]
    .filter((event) => event.type === 'part-prepayment')
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0];
  readonly policyMatch = signal<LoanPolicyMatchResult | null>(null);
  readonly matchApplied = signal(false);
  readonly pdfImportWarnings = signal<string[]>([]);
  readonly form = this.formBuilder.nonNullable.group({
    lender: [this.account?.lender ?? '', Validators.required],
    loanType: [this.account?.loanType ?? '', Validators.required],
    accountReferenceLastFour: [
      this.account?.accountReferenceLastFour ?? '',
      Validators.pattern(/^\d{0,4}$/),
    ],
    paymentModeId: [this.account?.paymentModeId ?? ''],
    sanctionedAmount: [this.account?.contract.sanctionedAmount ?? 0, Validators.min(0)],
    disbursedAmount: [
      this.account?.contract.disbursedAmount ?? 0,
      [Validators.required, Validators.min(0.01)],
    ],
    disbursementDate: [this.account?.contract.disbursementDate ?? today(), Validators.required],
    firstEmiDate: [this.account?.contract.firstEmiDate ?? today(), Validators.required],
    originalTenureMonths: [this.account?.contract.originalTenureMonths ?? 12, Validators.min(1)],
    contractualMaturityDate: [this.account?.contract.contractualMaturityDate ?? ''],
    initialEmi: [
      this.account?.contract.initialEmi ?? 0,
      [Validators.required, Validators.min(0.01)],
    ],
    initialAnnualRate: [
      this.account?.contract.initialAnnualRate ?? 0,
      [Validators.required, Validators.min(0)],
    ],
    interestType: [this.account?.contract.interestType ?? ('fixed' as const)],
    interestCalculationMethod: [
      this.account?.contract.interestCalculationMethod ?? ('monthly-reducing' as const),
    ],
    dayCountConvention: [this.account?.contract.dayCountConvention ?? ('actual-365' as const)],
    firstPeriodInterestAmount: [
      this.account?.contract.firstPeriodInterestAmount ?? 0,
      Validators.min(0),
    ],
    roundingScale: [this.account?.contract.roundingPolicy.monetaryScale ?? (2 as 0 | 2)],
    roundingMode: [this.account?.contract.roundingPolicy.interestRounding ?? ('half-up' as const)],
    calculationSetup: [
      (this.account &&
      (this.account.contract.firstPeriodInterestAmount !== undefined ||
        this.account.contract.interestCalculationMethod !== 'monthly-reducing' ||
        this.account.contract.dayCountConvention !== 'actual-365' ||
        this.account.contract.roundingPolicy.monetaryScale !== 2)
        ? 'lender-match'
        : 'standard') as 'standard' | 'lender-match' | 'advanced',
    ],
    matchCheckpoints: this.formBuilder.nonNullable.array([this.createCheckpointForm()]),
    matchPartPaymentDate: [this.latestPartPayment?.effectiveDate ?? ''],
    matchPartPaymentAmount: [
      this.latestPartPayment?.type === 'part-prepayment' ? this.latestPartPayment.amount : 0,
    ],
    postPrepaymentStrategy: [
      this.account?.contract.postPrepaymentStrategy ?? ('keep-emi-reduce-tenure' as const),
    ],
    openingBalance: [0, Validators.min(0)],
    balanceAsOfDate: [today()],
    assumeHistoricalEmisPaid: [!this.account],
    notes: [this.account?.notes ?? ''],
  });

  constructor() {
    merge(
      this.form.controls.disbursedAmount.valueChanges,
      this.form.controls.disbursementDate.valueChanges,
      this.form.controls.firstEmiDate.valueChanges,
      this.form.controls.originalTenureMonths.valueChanges,
      this.form.controls.initialEmi.valueChanges,
      this.form.controls.initialAnnualRate.valueChanges,
      this.form.controls.firstPeriodInterestAmount.valueChanges,
      this.form.controls.matchCheckpoints.valueChanges,
      this.form.controls.matchPartPaymentDate.valueChanges,
      this.form.controls.matchPartPaymentAmount.valueChanges,
    ).subscribe(() => {
      this.policyMatch.set(null);
      this.matchApplied.set(false);
    });
    if (!this.account) return;
    const lockedControls = [
      this.form.controls.disbursedAmount,
      this.form.controls.disbursementDate,
      this.form.controls.firstEmiDate,
      this.form.controls.originalTenureMonths,
      this.form.controls.contractualMaturityDate,
      this.form.controls.initialEmi,
      this.form.controls.initialAnnualRate,
      this.form.controls.interestType,
      this.form.controls.openingBalance,
      this.form.controls.balanceAsOfDate,
    ];
    for (const control of lockedControls) control.disable();
  }

  calculationSetupChanged(): void {
    this.policyMatch.set(null);
    this.matchApplied.set(false);
    if (this.form.controls.calculationSetup.value !== 'standard') return;
    this.form.patchValue({
      interestCalculationMethod: 'monthly-reducing',
      dayCountConvention: 'actual-365',
      firstPeriodInterestAmount: 0,
      roundingScale: 2,
      roundingMode: 'half-up',
    });
  }

  canFindLenderMatch(): boolean {
    const value = this.form.getRawValue();
    const checkpoints = this.matchingCheckpoints();
    const uniqueDates = new Set(checkpoints.map((checkpoint) => checkpoint.dueDate));
    return (
      checkpoints.length > 0 &&
      checkpoints.length === this.form.controls.matchCheckpoints.length &&
      uniqueDates.size === checkpoints.length &&
      value.disbursedAmount > 0 &&
      !!value.disbursementDate &&
      value.firstEmiDate >= value.disbursementDate &&
      value.initialEmi > 0 &&
      value.initialAnnualRate >= 0
    );
  }

  findLenderMatch(): void {
    if (!this.canFindLenderMatch()) return;
    this.policyMatch.set(
      matchLoanCalculationPolicy({
        account: this.accountFromForm(),
        events: this.eventsForMatching(),
        checkpoints: this.matchingCheckpoints(),
      }),
    );
    this.matchApplied.set(false);
  }

  applyLenderMatch(): void {
    const best = this.policyMatch()?.best;
    if (!best) return;
    this.form.patchValue({
      interestCalculationMethod: best.interestCalculationMethod,
      dayCountConvention: best.dayCountConvention,
      roundingScale: best.roundingPolicy.monetaryScale,
      roundingMode: best.roundingPolicy.interestRounding,
    });
    this.matchApplied.set(true);
  }

  policyDescription(candidate: NonNullable<LoanPolicyMatchResult['best']>): string {
    return loanPolicyDescription(candidate);
  }

  addMatchCheckpoint(): void {
    this.form.controls.matchCheckpoints.push(this.createCheckpointForm());
  }

  removeMatchCheckpoint(index: number): void {
    if (this.form.controls.matchCheckpoints.length === 1) return;
    this.form.controls.matchCheckpoints.removeAt(index);
  }

  applyParsedPdf(parsed: ParsedLoanPdf): void {
    const warnings = [...parsed.warnings];
    if (parsed.partPayments.length > 1) {
      warnings.push(
        `The PDF contains ${parsed.partPayments.length} part-payments. The first was filled here; record the others from Transactions before matching.`,
      );
    }
    this.pdfImportWarnings.set(warnings);
    this.form.controls.calculationSetup.setValue('lender-match');

    if (!this.account) {
      if (parsed.lender) this.form.controls.lender.setValue(parsed.lender);
      if (parsed.loanType) this.form.controls.loanType.setValue(parsed.loanType);
      if (parsed.accountReferenceLastFour) {
        this.form.controls.accountReferenceLastFour.setValue(parsed.accountReferenceLastFour);
      }
      if (parsed.sanctionedAmount !== undefined) {
        this.form.controls.sanctionedAmount.setValue(parsed.sanctionedAmount);
      }
      if (parsed.disbursedAmount !== undefined) {
        this.form.controls.disbursedAmount.setValue(parsed.disbursedAmount);
      }
      if (parsed.disbursementDate) {
        this.form.controls.disbursementDate.setValue(parsed.disbursementDate);
      }
      if (parsed.firstEmiDate) this.form.controls.firstEmiDate.setValue(parsed.firstEmiDate);
      if (parsed.contractualMaturityDate) {
        this.form.controls.contractualMaturityDate.setValue(parsed.contractualMaturityDate);
      }
      if (parsed.tenureMonths !== undefined) {
        this.form.controls.originalTenureMonths.setValue(parsed.tenureMonths);
      }
      if (parsed.initialEmi !== undefined) {
        this.form.controls.initialEmi.setValue(parsed.initialEmi);
      }
      if (parsed.initialAnnualRate !== undefined) {
        this.form.controls.initialAnnualRate.setValue(parsed.initialAnnualRate);
      }
      if (parsed.firstPeriodInterestAmount !== undefined) {
        this.form.controls.firstPeriodInterestAmount.setValue(parsed.firstPeriodInterestAmount);
      }
    }

    this.form.controls.matchCheckpoints.clear({ emitEvent: false });
    for (const checkpoint of parsed.checkpoints) {
      this.form.controls.matchCheckpoints.push(this.createCheckpointForm(checkpoint), {
        emitEvent: false,
      });
    }
    this.form.controls.matchCheckpoints.updateValueAndValidity();
    const partPayment = parsed.partPayments[0];
    if (partPayment) {
      this.form.patchValue({
        matchPartPaymentDate: partPayment.effectiveDate,
        matchPartPaymentAmount: partPayment.amount,
      });
    }
  }

  matchPartPaymentWillBeRecorded(): boolean {
    const value = this.form.getRawValue();
    return (
      !!value.matchPartPaymentDate &&
      value.matchPartPaymentAmount > 0 &&
      !this.hasMatchingPartPayment(value.matchPartPaymentDate, value.matchPartPaymentAmount)
    );
  }

  private hasMatchingPartPayment(date: string, amount: number): boolean {
    return (this.data.events ?? []).some(
      (event) =>
        event.type === 'part-prepayment' && event.effectiveDate === date && event.amount === amount,
    );
  }

  private createCheckpointForm(
    checkpoint: { dueDate: string; interestAmount: number; closingPrincipal: number } = {
      dueDate: '',
      interestAmount: 0,
      closingPrincipal: 0,
    },
  ) {
    return this.formBuilder.nonNullable.group({
      dueDate: [checkpoint.dueDate],
      interestAmount: [checkpoint.interestAmount, Validators.min(0)],
      closingPrincipal: [checkpoint.closingPrincipal, Validators.min(0)],
    });
  }

  private matchingCheckpoints() {
    return this.form.controls.matchCheckpoints
      .getRawValue()
      .filter(
        (checkpoint) =>
          !!checkpoint.dueDate &&
          checkpoint.interestAmount >= 0 &&
          checkpoint.closingPrincipal >= 0,
      );
  }

  private eventsForMatching(): LoanEvent[] {
    const value = this.form.getRawValue();
    const events = [...(this.data.events ?? [])];
    if (
      value.matchPartPaymentDate &&
      value.matchPartPaymentAmount > 0 &&
      !this.hasMatchingPartPayment(value.matchPartPaymentDate, value.matchPartPaymentAmount)
    ) {
      events.push({
        id: 'lender-match-part-payment',
        loanId: this.account?.id ?? this.generatedAccountId,
        type: 'part-prepayment',
        effectiveDate: value.matchPartPaymentDate,
        amount: value.matchPartPaymentAmount,
        source: 'manual',
        notes: 'Entered while matching lender schedule',
        createdDate: new Date().toISOString(),
      });
    }
    return events;
  }

  private accountFromForm(): LoanAccount {
    const value = this.form.getRawValue();
    return {
      id: this.account?.id ?? this.generatedAccountId,
      schemaVersion: 2,
      lender: value.lender,
      loanType: value.loanType,
      accountReferenceLastFour: value.accountReferenceLastFour || undefined,
      contract: {
        sanctionedAmount: value.sanctionedAmount || undefined,
        disbursedAmount: value.disbursedAmount,
        disbursementDate: value.disbursementDate,
        firstEmiDate: value.firstEmiDate,
        originalTenureMonths: value.originalTenureMonths || undefined,
        contractualMaturityDate: value.contractualMaturityDate || undefined,
        initialEmi: value.initialEmi,
        initialAnnualRate: value.initialAnnualRate,
        interestType: value.interestType,
        interestCalculationMethod: value.interestCalculationMethod,
        dayCountConvention: value.dayCountConvention,
        firstPeriodInterestAmount: value.firstPeriodInterestAmount || undefined,
        compoundingFrequency: 'monthly',
        postPrepaymentStrategy: value.postPrepaymentStrategy,
        roundingPolicy: {
          monetaryScale: value.roundingScale,
          interestRounding: value.roundingMode,
          installmentRounding: value.roundingMode,
          finalInstallmentAdjustment: true,
        } satisfies LoanRoundingPolicy,
      },
      notes: value.notes,
      paymentModeId: value.paymentModeId || undefined,
      memberEmail: this.account?.memberEmail ?? this.data.memberEmail,
      ownerUid: this.account?.ownerUid,
      historyCoverageStartDate:
        value.openingBalance > 0 ? value.balanceAsOfDate : this.account?.historyCoverageStartDate,
      createdDate: this.account?.createdDate,
      updatedDate: this.account?.updatedDate,
      archivedDate: this.account?.archivedDate,
      version: this.account?.version,
    };
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.firstEmiDate < value.disbursementDate) {
      this.form.controls.firstEmiDate.setErrors({ beforeDisbursement: true });
      return;
    }
    const account = this.accountFromForm();
    const accountId = account.id;
    const openingAnchor =
      value.openingBalance > 0
        ? ({
            id: `balance-anchor-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
            loanId: accountId,
            type: 'balance-anchor',
            effectiveDate: value.balanceAsOfDate,
            amount: value.openingBalance,
            source: 'manual',
            notes: 'Opening lender-reported principal balance',
            createdDate: new Date().toISOString(),
          } satisfies LoanEvent)
        : undefined;
    const appliedMatch = this.matchApplied() ? this.policyMatch()?.best : undefined;
    const latestMatchedCheckpoint = appliedMatch?.checkpointResults.at(-1);
    const lenderReconciliation =
      appliedMatch && latestMatchedCheckpoint
        ? {
            asOfDate: latestMatchedCheckpoint.dueDate,
            lenderReportedOutstanding: latestMatchedCheckpoint.closingPrincipal,
            tolerance: 0,
            notes: `Matched ${appliedMatch.checkpointResults.length} lender repayment schedule rows using ${loanPolicyDescription(appliedMatch)}. Latest lender interest: ${latestMatchedCheckpoint.interestAmount}.`,
          }
        : undefined;
    this.dialogRef.close({
      account,
      openingAnchor,
      matchingPartPayment: this.matchPartPaymentWillBeRecorded()
        ? this.eventsForMatching().find((event) => event.id === 'lender-match-part-payment')
        : undefined,
      lenderReconciliations: lenderReconciliation ? [lenderReconciliation] : undefined,
      assumeHistoricalEmisPaid: !this.account && value.assumeHistoricalEmisPaid,
    });
  }
}
