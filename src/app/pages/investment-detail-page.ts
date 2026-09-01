import { CommonModule, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { BudgetStore } from '../budget.store';
import { CASH_PAYMENT_MODE_ID } from '../budget.models';
import {
  decimalString,
  investmentDecimal,
  moneyString,
} from '../domain/investments/investment-decimal';
import type {
  InvestmentAccount,
  InvestmentFrequencyV2,
  NpsSchemeHolding,
  InvestmentTransactionSource,
  InvestmentTransactionType,
  MutualFundSipType,
} from '../domain/investments/investment.models';
import { InvestmentStore } from '../stores/investment.store';
import type { WorkspaceConfirmData, WorkspaceConfirmDialog } from '../workspace-form-dialog';

interface TransactionDialogData {
  account: InvestmentAccount;
  liquidation: boolean;
}

interface NpsTransactionAllocationDraft {
  schemeCode: string;
  schemeName: string;
  allocationPercentage?: string;
  amount: string;
  units: string;
  nav?: string;
  navDate?: string;
}

interface NpsHoldingEditDraft extends NpsSchemeHolding {
  allocationPercentage: string;
}

@Component({
  selector: 'app-investment-edit-dialog',
  imports: [
    CommonModule,
    NgOptimizedImage,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit investment</h2>
    <mat-dialog-content
      ><form class="transaction-form" [formGroup]="form">
        <mat-form-field appearance="outline"
          ><mat-label>Name</mat-label><input matInput formControlName="name" required
        /></mat-form-field>
        <mat-form-field appearance="outline"
          ><mat-label>Institution</mat-label><input matInput formControlName="institution"
        /></mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Paid via</mat-label>
          <mat-select formControlName="paymentModeId" aria-label="Investment payment mode">
            @for (mode of paymentModes(); track mode.id) {
              <mat-option [value]="mode.id">
                <span class="payment-mode-option">
                  <img [ngSrc]="budget.paymentModeIconSrc(mode)" width="24" height="24" alt="" />
                  <span>{{ budget.paymentModeShortLabel(mode) }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
          <mat-hint>New transactions use this mode unless you choose another.</mat-hint>
        </mat-form-field>
        @if (data.type === 'STOCK') {
          <mat-form-field appearance="outline"
            ><mat-label>Trading symbol</mat-label><input matInput formControlName="tradingSymbol"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>Exchange</mat-label
            ><mat-select formControlName="exchange"
              ><mat-option value="NSE">NSE</mat-option
              ><mat-option value="BSE">BSE</mat-option></mat-select
            ></mat-form-field
          >
          <mat-form-field appearance="outline"
            ><mat-label>Market instrument key</mat-label
            ><input matInput formControlName="providerKey"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>ISIN</mat-label><input matInput formControlName="isin"
          /></mat-form-field>
        }
        @if (data.type === 'MUTUAL_FUND') {
          <mat-form-field appearance="outline"
            ><mat-label>AMFI scheme code</mat-label><input matInput formControlName="schemeCode"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>Plan</mat-label
            ><mat-select formControlName="plan"
              ><mat-option value="Direct">Direct</mat-option
              ><mat-option value="Regular">Regular</mat-option></mat-select
            ></mat-form-field
          >
          <mat-form-field appearance="outline"
            ><mat-label>Option</mat-label
            ><mat-select formControlName="option"
              ><mat-option value="Growth">Growth</mat-option
              ><mat-option value="IDCW">IDCW</mat-option></mat-select
            ></mat-form-field
          >
        }
        @if (data.type === 'NPS') {
          <section class="nps-edit-holdings" aria-labelledby="nps-edit-holdings-heading">
            <div>
              <h3 id="nps-edit-holdings-heading">Opening scheme holdings</h3>
              <p>Allocation percentages must be greater than zero and total exactly 100%.</p>
            </div>
            @for (holding of npsHoldings(); track holding.schemeCode) {
              <article>
                <header>
                  <strong>{{ holding.schemeName || holding.schemeCode }}</strong>
                  <span>{{ holding.schemeCode }}</span>
                </header>
                <div>
                  <mat-form-field appearance="outline">
                    <mat-label>Opening units</mat-label>
                    <input
                      matInput
                      type="number"
                      min="0"
                      step="any"
                      [value]="holding.units"
                      [attr.aria-label]="
                        'Opening units for ' + (holding.schemeName || holding.schemeCode)
                      "
                      (input)="updateNpsHolding(holding.schemeCode, 'units', $event)"
                    />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Recurring contribution split</mat-label>
                    <input
                      matInput
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      [value]="holding.allocationPercentage"
                      [attr.aria-label]="
                        'Recurring contribution split percentage for ' +
                        (holding.schemeName || holding.schemeCode)
                      "
                      (input)="updateNpsHolding(holding.schemeCode, 'allocationPercentage', $event)"
                    />
                    <span matTextSuffix>%</span>
                  </mat-form-field>
                </div>
              </article>
            }
            <p class="allocation-total" [class.complete]="npsAllocationComplete()" role="status">
              Allocation total: {{ npsAllocationTotal() | number: '1.0-4' }}% of 100%
            </p>
          </section>
        }
        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
      </form></mat-dialog-content
    >
    <mat-dialog-actions align="end"
      ><button mat-button type="button" (click)="dialogRef.close()">Cancel</button
      ><button mat-flat-button type="button" (click)="save()">Save</button></mat-dialog-actions
    >
  `,
  styles: [
    `
      .transaction-form {
        display: grid;
        gap: 12px;
        padding-top: 8px;
      }
      .payment-mode-option {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 10px;
      }
      .payment-mode-option img {
        flex: 0 0 auto;
      }
      .form-error {
        color: #b42318;
      }
      .nps-edit-holdings {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid #dfe5ee;
        border-radius: 12px;
      }
      .nps-edit-holdings h3,
      .nps-edit-holdings p {
        margin: 0;
      }
      .nps-edit-holdings p,
      .nps-edit-holdings header span {
        color: #667085;
        font-size: 0.76rem;
      }
      .nps-edit-holdings article {
        display: grid;
        gap: 10px;
        padding: 12px;
        border-radius: 10px;
        background: #f8fafc;
      }
      .nps-edit-holdings article header {
        display: grid;
        gap: 3px;
      }
      .nps-edit-holdings article > div {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .allocation-total {
        padding: 9px 11px;
        border: 1px solid #f5c2c7;
        border-radius: 9px;
        background: #fff5f5;
        color: #b42318 !important;
        font-weight: 700;
      }
      .allocation-total.complete {
        border-color: #a7e2c3;
        background: #effbf4;
        color: #047857 !important;
      }
      @media (max-width: 480px) {
        .nps-edit-holdings article > div {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentEditDialog {
  readonly data = inject<InvestmentAccount>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<InvestmentEditDialog>>(MatDialogRef);
  private readonly investments = inject(InvestmentStore);
  readonly budget = inject(BudgetStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly stock =
    this.data.instrument?.kind === 'STOCK' ? this.data.instrument : undefined;
  private readonly fund =
    this.data.instrument?.kind === 'MUTUAL_FUND' ? this.data.instrument : undefined;
  private readonly nps = this.data.instrument?.kind === 'NPS' ? this.data.instrument : undefined;
  private readonly npsOpeningHoldings = (
    this.data.openingSnapshot?.schemeHoldings ??
    this.nps?.schemeHoldings ??
    []
  ).map((openingHolding) => {
    const currentHolding = this.nps?.schemeHoldings.find(
      (holding) => holding.schemeCode === openingHolding.schemeCode,
    );
    return {
      ...currentHolding,
      ...openingHolding,
      allocationPercentage:
        openingHolding.allocationPercentage ?? currentHolding?.allocationPercentage,
      units: openingHolding.units,
    };
  });
  readonly error = signal('');
  readonly paymentModes = computed(() => {
    const active = [
      ...new Map(
        [...this.budget.activePaymentModes(), ...this.budget.paymentModes()].map((mode) => [
          mode.id,
          mode,
        ]),
      ).values(),
    ].filter(
      (mode) =>
        !mode.archivedDate &&
        ((mode.id === 'payment-mode-cash' && mode.type === 'cash') ||
          mode.ownerUid === this.data.ownerUid),
    );
    const current = this.budget.paymentModes().find((mode) => mode.id === this.data.paymentModeId);
    return current && !active.some((mode) => mode.id === current.id)
      ? [current, ...active]
      : active;
  });
  readonly npsHoldings = signal<NpsHoldingEditDraft[]>(
    this.npsOpeningHoldings.map((holding) => ({
      ...holding,
      allocationPercentage: holding.allocationPercentage ?? '',
    })),
  );
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
      holdings.every(
        (holding) => Number(holding.units) >= 0 && Number(holding.allocationPercentage) > 0,
      ) &&
      investmentDecimal(this.npsAllocationTotal()).eq(100)
    );
  });
  readonly form = this.fb.group({
    name: [this.data.name, Validators.required],
    institution: [this.data.institution ?? ''],
    paymentModeId: [this.data.paymentModeId ?? CASH_PAYMENT_MODE_ID],
    tradingSymbol: [this.stock?.tradingSymbol ?? ''],
    exchange: this.fb.control<'NSE' | 'BSE'>(this.stock?.exchange ?? 'NSE'),
    providerKey: [this.stock?.upstoxInstrumentKey ?? ''],
    isin: [this.stock?.isin ?? ''],
    schemeCode: [this.fund?.schemeCode ?? ''],
    plan: [this.fund?.plan ?? 'Direct'],
    option: [this.fund?.option ?? 'Growth'],
  });

  updateNpsHolding(
    schemeCode: string,
    field: 'units' | 'allocationPercentage',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    this.npsHoldings.update((holdings) =>
      holdings.map((holding) =>
        holding.schemeCode === schemeCode ? { ...holding, [field]: value } : holding,
      ),
    );
  }

  async save(): Promise<void> {
    try {
      const value = this.form.getRawValue();
      if (!value.name.trim()) throw new Error('Name is required.');
      let instrument = this.data.instrument;
      if (this.data.type === 'STOCK' && value.providerKey.trim())
        instrument = {
          kind: 'STOCK',
          provider: 'UPSTOX',
          companyName: value.name.trim(),
          tradingSymbol: value.tradingSymbol.trim(),
          exchange: value.exchange,
          upstoxInstrumentKey: value.providerKey.trim(),
          isin: value.isin.trim() || undefined,
        };
      if (this.data.type === 'MUTUAL_FUND' && value.schemeCode.trim())
        instrument = {
          kind: 'MUTUAL_FUND',
          provider: 'AMFI',
          schemeCode: value.schemeCode.trim(),
          schemeName: value.name.trim(),
          plan: value.plan,
          option: value.option,
        };
      if (this.data.type === 'NPS') {
        const schemeHoldings = this.npsHoldings();
        if (!this.npsAllocationComplete()) {
          throw new Error('NPS scheme allocations must be greater than zero and total 100%.');
        }
        if (schemeHoldings.length)
          instrument = { kind: 'NPS', provider: 'NPS_TRUST', schemeHoldings };
      }
      const openingSnapshot =
        this.data.type === 'NPS' && instrument?.kind === 'NPS' && this.data.openingSnapshot
          ? { ...this.data.openingSnapshot, schemeHoldings: instrument.schemeHoldings }
          : this.data.openingSnapshot;
      await this.investments.updateAccount({
        ...this.data,
        name: value.name.trim(),
        institution: value.institution.trim() || undefined,
        paymentModeId: value.paymentModeId,
        instrument,
        openingSnapshot,
        needsInstrumentMapping: !instrument,
      });
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Investment could not be updated.');
    }
  }
}

@Component({
  selector: 'app-recurring-plan-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Recurring plan</h2>
    <mat-dialog-content
      ><form class="transaction-form" [formGroup]="form">
        <label class="enabled-row"
          ><input type="checkbox" formControlName="enabled" /> Plan enabled</label
        >
        @if (form.controls.enabled.value) {
          <p class="plan-hint">This plan never creates transactions automatically.</p>
          <mat-form-field appearance="outline"
            ><mat-label>Amount</mat-label
            ><input matInput type="number" min="0" formControlName="amount"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>Frequency</mat-label
            ><mat-select formControlName="frequency"
              ><mat-option value="MONTHLY">Monthly</mat-option
              ><mat-option value="QUARTERLY">Quarterly</mat-option
              ><mat-option value="HALF_YEARLY">Half-yearly</mat-option
              ><mat-option value="YEARLY">Annual</mat-option></mat-select
            ></mat-form-field
          >
          <mat-form-field appearance="outline"
            ><mat-label>Start date</mat-label
            ><input matInput type="date" formControlName="startDate"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>End date (optional)</mat-label
            ><input matInput type="date" formControlName="endDate"
          /></mat-form-field>
          @if (data.type === 'MUTUAL_FUND') {
            <mat-form-field appearance="outline"
              ><mat-label>SIP type</mat-label
              ><mat-select formControlName="sipType"
                ><mat-option value="FIXED">Fixed SIP</mat-option
                ><mat-option value="STEP_UP">Step-up SIP</mat-option></mat-select
              ></mat-form-field
            >
            @if (form.controls.sipType.value === 'STEP_UP') {
              @if (legacyPercentageStepUp) {
                <p class="plan-hint">
                  This saved plan uses the earlier percentage format. It will remain
                  percentage-based when saved.
                </p>
              }
              <mat-form-field appearance="outline"
                ><mat-label>{{
                  legacyPercentageStepUp ? 'SIP increase percentage' : 'SIP increase amount'
                }}</mat-label
                ><input
                  matInput
                  type="number"
                  min="0"
                  formControlName="stepUpValue"
                  required /></mat-form-field
              ><mat-form-field appearance="outline"
                ><mat-label>Step-up frequency</mat-label
                ><mat-select formControlName="stepUpFrequency"
                  ><mat-option value="MONTHLY">Monthly</mat-option
                  ><mat-option value="QUARTERLY">Quarterly</mat-option
                  ><mat-option value="HALF_YEARLY">Half-yearly</mat-option
                  ><mat-option value="YEARLY">Annual</mat-option></mat-select
                ></mat-form-field
              ><mat-form-field appearance="outline"
                ><mat-label>Upcoming step-up month</mat-label
                ><input matInput type="month" formControlName="stepUpMonth" required /><mat-hint
                  >The SIP increases at the start of this month.</mat-hint
                ></mat-form-field
              >
            }
          }
        }
        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
      </form></mat-dialog-content
    >
    <mat-dialog-actions align="end"
      ><button mat-button type="button" (click)="dialogRef.close()">Cancel</button
      ><button mat-flat-button type="button" (click)="save()">Save plan</button></mat-dialog-actions
    >
  `,
  styles: [
    `
      .transaction-form {
        display: grid;
        gap: 12px;
        padding-top: 8px;
      }
      .enabled-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 650;
      }
      .plan-hint {
        margin: 0;
        padding: 10px;
        border-radius: 10px;
        background: #f4f7ff;
        color: #475467;
      }
      .form-error {
        color: #b42318;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringPlanDialog {
  readonly data = inject<InvestmentAccount>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<RecurringPlanDialog>>(MatDialogRef);
  private readonly investments = inject(InvestmentStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly error = signal('');
  private readonly plan = this.data.recurringPlan;
  readonly legacyPercentageStepUp = this.plan?.stepUp?.type === 'PERCENTAGE';
  readonly form = this.fb.group({
    enabled: [this.plan?.enabled ?? true],
    amount: [this.plan?.amount ?? ''],
    frequency: this.fb.control<InvestmentFrequencyV2>(this.plan?.frequency ?? 'MONTHLY'),
    startDate: [this.plan?.startDate ?? new Date().toISOString().slice(0, 10)],
    endDate: [this.plan?.endDate ?? ''],
    sipType: this.fb.control<MutualFundSipType>(
      this.plan?.sipType ?? (this.plan?.stepUp?.enabled ? 'STEP_UP' : 'FIXED'),
    ),
    stepUpValue: [this.plan?.stepUp?.value ?? ''],
    stepUpFrequency: this.fb.control<InvestmentFrequencyV2>(
      this.plan?.stepUp?.frequency ?? 'HALF_YEARLY',
    ),
    stepUpMonth: [
      this.plan?.stepUp?.effectiveFrom.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
    ],
  });
  async save(): Promise<void> {
    try {
      if (this.data.type === 'STOCK') {
        throw new Error('Recurring plans are not available for stocks.');
      }
      const value = this.form.getRawValue();
      if (value.enabled && Number(value.amount) <= 0)
        throw new Error('Recurring amount must be greater than zero.');
      if (value.enabled && this.data.type === 'NPS') {
        const holdings = this.investments.npsHoldingsFor(this.data);
        const allocationTotal = holdings.reduce(
          (total, holding) => total.plus(holding.allocationPercentage ?? 0),
          investmentDecimal(0),
        );
        if (
          !holdings.length ||
          holdings.some((holding) => Number(holding.allocationPercentage) <= 0) ||
          !allocationTotal.eq(100)
        ) {
          throw new Error(
            'Set a recurring contribution split for every NPS scheme in Edit investment before enabling this plan.',
          );
        }
      }
      if (value.enabled && this.data.type === 'MUTUAL_FUND' && value.sipType === 'STEP_UP') {
        if (Number(value.stepUpValue) <= 0)
          throw new Error('SIP increase amount must be greater than zero.');
        if (!/^\d{4}-\d{2}$/.test(value.stepUpMonth))
          throw new Error('Choose the upcoming step-up month.');
        if (value.stepUpMonth < value.startDate.slice(0, 7))
          throw new Error('Upcoming step-up month cannot be before the SIP start month.');
      }
      const recurringPlan = value.enabled
        ? {
            enabled: true,
            amount: value.amount,
            frequency: value.frequency,
            startDate: value.startDate,
            endDate: value.endDate || undefined,
            sipType: this.data.type === 'MUTUAL_FUND' ? value.sipType : undefined,
            stepUp:
              this.data.type === 'MUTUAL_FUND' && value.sipType === 'STEP_UP'
                ? {
                    enabled: true,
                    type: this.legacyPercentageStepUp
                      ? ('PERCENTAGE' as const)
                      : ('FIXED_AMOUNT' as const),
                    value: value.stepUpValue,
                    frequency: value.stepUpFrequency,
                    effectiveFrom: `${value.stepUpMonth}-01`,
                  }
                : undefined,
          }
        : undefined;
      await this.investments.updateAccount({ ...this.data, recurringPlan });
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Plan could not be saved.');
    }
  }
}

function transactionLabels(
  account: InvestmentAccount,
  liquidation: boolean,
): { title: string; type: InvestmentTransactionType } {
  if (liquidation) {
    if (account.type === 'STOCK') return { title: 'Sell shares', type: 'SELL' };
    if (account.type === 'MUTUAL_FUND') return { title: 'Redeem units', type: 'REDEMPTION' };
    return { title: 'Record withdrawal', type: 'WITHDRAWAL' };
  }
  if (account.type === 'STOCK') return { title: 'Add purchase', type: 'BUY' };
  if (account.type === 'MUTUAL_FUND') return { title: 'Add investment', type: 'SIP' };
  return { title: 'Add contribution', type: 'CONTRIBUTION' };
}

@Component({
  selector: 'app-investment-transaction-dialog',
  imports: [
    CommonModule,
    NgOptimizedImage,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ labels.title }}</h2>
    <mat-dialog-content>
      <form class="transaction-form" [formGroup]="form" (ngSubmit)="save()">
        @if (
          data.liquidation && data.account.type !== 'STOCK' && data.account.type !== 'MUTUAL_FUND'
        ) {
          <p class="regulated-note">
            <mat-icon aria-hidden="true">info</mat-icon>This records a withdrawal that already
            happened. Budget Buttowski does not execute or certify eligibility for it.
          </p>
        }
        <mat-form-field appearance="outline"
          ><mat-label>Date</mat-label
          ><input matInput type="date" formControlName="date" [max]="today" required
        /></mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Paid via</mat-label>
          <mat-select formControlName="paymentModeId" aria-label="Transaction payment mode">
            @for (mode of paymentModes(); track mode.id) {
              <mat-option [value]="mode.id">
                <span class="payment-mode-option">
                  <img [ngSrc]="budget.paymentModeIconSrc(mode)" width="24" height="24" alt="" />
                  <span>{{ budget.paymentModeShortLabel(mode) }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
          <mat-hint>
            {{
              data.liquidation
                ? 'Where the proceeds were received.'
                : 'How this investment was funded.'
            }}
          </mat-hint>
        </mat-form-field>
        @if (data.account.type === 'STOCK') {
          <mat-form-field appearance="outline"
            ><mat-label>Quantity</mat-label
            ><input matInput type="number" min="0" step="any" formControlName="quantity" required
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>{{ data.liquidation ? 'Sale price' : 'Purchase price' }}</mat-label
            ><input matInput type="number" min="0" step="any" formControlName="unitPrice" required
          /></mat-form-field>
        } @else {
          <mat-form-field appearance="outline"
            ><mat-label>Amount</mat-label
            ><input
              matInput
              type="number"
              min="0"
              step="any"
              formControlName="amount"
              required
              (input)="updateNpsTransactionTotal($event)"
          /></mat-form-field>
          @if (data.account.type === 'MUTUAL_FUND') {
            <mat-form-field appearance="outline"
              ><mat-label>Units (optional)</mat-label
              ><input matInput type="number" min="0" step="any" formControlName="units"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>NAV (optional)</mat-label
              ><input matInput type="number" min="0" step="any" formControlName="unitPrice"
            /></mat-form-field>
          }
          @if (data.account.type === 'NPS') {
            <section class="nps-transaction-allocations" aria-labelledby="nps-allocation-heading">
              <header class="nps-allocation-heading">
                <div>
                  <h3 id="nps-allocation-heading">Scheme allocations</h3>
                  @if (data.liquidation) {
                    <p>Enter the amount and actual units withdrawn from each scheme.</p>
                  } @else {
                    <p>
                      Amounts follow the recurring split. Units are calculated using each scheme's
                      latest NAV.
                    </p>
                  }
                </div>
                @if (!data.liquidation && form.controls.source.value === 'ADHOC') {
                  <button
                    mat-stroked-button
                    type="button"
                    aria-label="Fetch latest NAVs for all NPS schemes"
                    (click)="refreshNpsNavs()"
                    [disabled]="npsNavRefreshing()"
                  >
                    <mat-icon aria-hidden="true">refresh</mat-icon>
                    {{ npsNavRefreshing() ? 'Fetchingâ€¦' : 'Fetch latest NAVs' }}
                  </button>
                }
              </header>
              @if (!data.liquidation && form.controls.source.value === 'RECURRING') {
                <p class="automatic-nav-note">
                  <mat-icon aria-hidden="true">autorenew</mat-icon>
                  Latest NAVs are fetched automatically for recurring contributions.
                </p>
              }
              @if (npsNavMessage()) {
                <p class="nav-refresh-message" role="status">{{ npsNavMessage() }}</p>
              }
              @if (npsNavError()) {
                <p class="nav-refresh-error" role="alert">{{ npsNavError() }}</p>
              }
              @for (allocation of npsSchemeAllocations(); track allocation.schemeCode) {
                <article class="nps-transaction-allocation">
                  <header>
                    <div>
                      <strong>{{ allocation.schemeName }}</strong>
                      <span>{{ allocation.schemeCode }}</span>
                    </div>
                    @if (allocation.allocationPercentage) {
                      <span class="allocation-badge"
                        >{{ allocation.allocationPercentage }}% recurring split</span
                      >
                    }
                  </header>
                  @if (data.liquidation) {
                    <div class="nps-allocation-inputs">
                      <mat-form-field appearance="outline">
                        <mat-label>Withdrawn amount</mat-label>
                        <input
                          matInput
                          type="number"
                          min="0"
                          step="any"
                          [value]="allocation.amount"
                          [attr.aria-label]="'Withdrawn amount for ' + allocation.schemeName"
                          (input)="updateNpsAllocationAmount(allocation.schemeCode, $event)"
                        />
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Withdrawn units</mat-label>
                        <input
                          matInput
                          type="number"
                          min="0"
                          step="any"
                          [value]="allocation.units"
                          [attr.aria-label]="'Withdrawn units for ' + allocation.schemeName"
                          (input)="updateNpsAllocationUnits(allocation.schemeCode, $event)"
                        />
                      </mat-form-field>
                    </div>
                    @if (npsAllocationNav(allocation); as nav) {
                      <small>
                        Implied NAV:
                        {{ nav | currency: 'INR' : 'symbol' : '1.2-4' : 'en-IN' }}
                      </small>
                    }
                  } @else {
                    <dl class="nps-calculated-allocation">
                      <div>
                        <dt>Allocated amount</dt>
                        <dd>
                          @if (allocation.amount) {
                            {{
                              investments.display(allocation.amount)
                                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                            }}
                          } @else {
                            Not allocated
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Latest NAV</dt>
                        <dd>
                          @if (allocation.nav) {
                            {{
                              investments.display(allocation.nav)
                                | currency: 'INR' : 'symbol' : '1.2-4' : 'en-IN'
                            }}
                          } @else {
                            Not available
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Calculated units</dt>
                        <dd>{{ allocation.units || 'Not available' }}</dd>
                      </div>
                    </dl>
                    <small>
                      @if (allocation.navDate) {
                        Using NAV dated {{ allocation.navDate | date: 'mediumDate' }}.
                      }
                      CRA allotment may differ if another NAV is applied.
                    </small>
                  }
                </article>
              }
            </section>
          }
        }
        @if (!data.liquidation && data.account.type !== 'STOCK') {
          <mat-form-field appearance="outline"
            ><mat-label>Source</mat-label
            ><mat-select formControlName="source" (valueChange)="onTransactionSourceChange($event)"
              ><mat-option value="ADHOC">Ad-hoc</mat-option
              ><mat-option value="RECURRING">Recurring</mat-option></mat-select
            ></mat-form-field
          >
          @if (data.account.recurringPlan?.enabled) {
            <p class="plan-hint">
              The current plan amount is a prefill only. Saving this form creates the actual
              transaction.
            </p>
          }
        }
        <mat-form-field appearance="outline"
          ><mat-label>Notes (optional)</mat-label
          ><textarea matInput formControlName="notes"></textarea>
        </mat-form-field>
        @if (error()) {
          <p class="form-error" role="alert">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button type="button" (click)="dialogRef.close()">Cancel</button
      ><button
        mat-flat-button
        type="button"
        (click)="save()"
        [disabled]="saving() || npsNavRefreshing()"
      >
        {{ saving() ? 'Saving…' : labels.title }}
      </button></mat-dialog-actions
    >
  `,
  styles: [
    `
      .transaction-form {
        display: grid;
        gap: 12px;
        padding-top: 8px;
      }
      .payment-mode-option {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 10px;
      }
      .payment-mode-option img {
        flex: 0 0 auto;
      }
      .regulated-note,
      .plan-hint {
        display: flex;
        align-items: start;
        gap: 8px;
        margin: 0;
        padding: 12px;
        border-radius: 12px;
        background: #f4f7ff;
        color: #475467;
        font-size: 0.82rem;
      }
      .form-error {
        color: #b42318;
      }
      .nps-transaction-allocations {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid #dfe5ee;
        border-radius: 12px;
      }
      .nps-transaction-allocations h3,
      .nps-transaction-allocations p,
      .nps-transaction-allocation small {
        margin: 0;
      }
      .nps-transaction-allocations p,
      .nps-transaction-allocation span,
      .nps-transaction-allocation small {
        color: #667085;
        font-size: 0.76rem;
      }
      .nps-allocation-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .nps-allocation-heading > div {
        display: grid;
        gap: 3px;
      }
      .nps-allocation-heading button {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      .automatic-nav-note,
      .nav-refresh-message,
      .nav-refresh-error {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 8px;
      }
      .automatic-nav-note,
      .nav-refresh-message {
        background: #effbf4;
        color: #047857 !important;
      }
      .nav-refresh-error {
        background: #fff1f0;
        color: #b42318 !important;
      }
      .automatic-nav-note mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .nps-transaction-allocation {
        display: grid;
        gap: 10px;
        padding: 12px;
        border-radius: 10px;
        background: #f8fafc;
      }
      .nps-transaction-allocation header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .nps-transaction-allocation header > div {
        display: grid;
        gap: 3px;
      }
      .allocation-badge {
        padding: 4px 8px;
        border-radius: 999px;
        background: #e6fbf7;
        color: #0f766e !important;
        font-weight: 700;
        white-space: nowrap;
      }
      .nps-allocation-inputs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .nps-calculated-allocation {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 7px;
        margin: 0;
      }
      .nps-calculated-allocation div {
        display: grid;
        gap: 3px;
        padding: 8px;
        border-radius: 8px;
        background: #fff;
      }
      .nps-calculated-allocation dt {
        color: #667085;
        font-size: 0.68rem;
      }
      .nps-calculated-allocation dd {
        margin: 0;
        color: #344054;
        font-size: 0.8rem;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      @media (max-width: 480px) {
        .nps-allocation-heading {
          flex-direction: column;
        }
        .nps-allocation-inputs,
        .nps-calculated-allocation {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentTransactionDialog implements OnInit {
  readonly data = inject<TransactionDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<InvestmentTransactionDialog>>(MatDialogRef);
  readonly investments = inject(InvestmentStore);
  readonly budget = inject(BudgetStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly labels = transactionLabels(this.data.account, this.data.liquidation);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly npsNavRefreshing = signal(false);
  readonly npsNavFetched = signal(false);
  readonly npsNavMessage = signal('');
  readonly npsNavError = signal('');
  readonly paymentModes = computed(() => {
    const active = [
      ...new Map(
        [...this.budget.activePaymentModes(), ...this.budget.paymentModes()].map((mode) => [
          mode.id,
          mode,
        ]),
      ).values(),
    ].filter(
      (mode) =>
        !mode.archivedDate &&
        ((mode.id === 'payment-mode-cash' && mode.type === 'cash') ||
          mode.ownerUid === this.data.account.ownerUid),
    );
    const current = this.budget
      .paymentModes()
      .find((mode) => mode.id === this.data.account.paymentModeId);
    return current && !active.some((mode) => mode.id === current.id)
      ? [current, ...active]
      : active;
  });
  private readonly initialAmount = this.data.liquidation
    ? ''
    : this.investments.effectiveRecurring(this.data.account);
  readonly npsSchemeAllocations = signal<NpsTransactionAllocationDraft[]>(
    this.data.account.type === 'NPS'
      ? this.createNpsAllocationDrafts(
          this.investments.npsHoldingsFor(this.data.account),
          this.initialAmount,
        )
      : [],
  );
  readonly form = this.fb.group({
    date: [this.today, Validators.required],
    paymentModeId: [this.data.account.paymentModeId ?? CASH_PAYMENT_MODE_ID],
    amount: [this.initialAmount],
    quantity: [''],
    units: [''],
    unitPrice: [''],
    source: this.fb.control<InvestmentTransactionSource>(
      this.data.account.recurringPlan?.enabled ? 'RECURRING' : 'ADHOC',
    ),
    notes: [''],
  });

  ngOnInit(): void {
    if (
      this.data.account.type === 'NPS' &&
      !this.data.liquidation &&
      this.form.controls.source.value === 'RECURRING'
    ) {
      void this.refreshNpsNavs();
    }
  }

  onTransactionSourceChange(source: InvestmentTransactionSource): void {
    if (source === 'RECURRING' && this.data.account.type === 'NPS' && !this.data.liquidation) {
      void this.refreshNpsNavs();
    }
  }

  async refreshNpsNavs(): Promise<boolean> {
    if (this.data.account.type !== 'NPS' || this.data.liquidation) return false;
    if (this.npsNavRefreshing()) return false;
    this.npsNavRefreshing.set(true);
    this.npsNavMessage.set('');
    this.npsNavError.set('');
    try {
      const holdings = await this.investments.fetchLatestNpsHoldings(this.data.account);
      const latestByCode = new Map(holdings.map((holding) => [holding.schemeCode, holding]));
      this.npsSchemeAllocations.update((allocations) =>
        this.withAllocatedAmounts(
          allocations.map((allocation) => {
            const latest = latestByCode.get(allocation.schemeCode);
            return latest
              ? { ...allocation, nav: latest.nav, navDate: latest.navDate }
              : allocation;
          }),
          this.form.controls.amount.value,
        ),
      );
      this.npsNavFetched.set(true);
      this.npsNavMessage.set('Latest NAVs fetched for all schemes.');
      return true;
    } catch (error) {
      this.npsNavFetched.set(false);
      this.npsNavError.set(
        error instanceof Error ? error.message : 'Latest NPS NAVs could not be fetched.',
      );
      return false;
    } finally {
      this.npsNavRefreshing.set(false);
    }
  }

  updateNpsTransactionTotal(event: Event): void {
    if (this.data.account.type !== 'NPS' || this.data.liquidation) return;
    this.setNpsTransactionTotal((event.target as HTMLInputElement).value);
  }

  setNpsTransactionTotal(amount: string): void {
    this.npsSchemeAllocations.update((allocations) =>
      this.withAllocatedAmounts(allocations, amount),
    );
  }

  updateNpsAllocationAmount(schemeCode: string, event: Event): void {
    this.updateNpsAllocation(schemeCode, 'amount', (event.target as HTMLInputElement).value);
  }

  updateNpsAllocationUnits(schemeCode: string, event: Event): void {
    this.updateNpsAllocation(schemeCode, 'units', (event.target as HTMLInputElement).value);
  }

  npsAllocationNav(allocation: NpsTransactionAllocationDraft): number | null {
    if (Number(allocation.amount) <= 0 || Number(allocation.units) <= 0) return null;
    return investmentDecimal(allocation.amount).div(allocation.units).toNumber();
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const value = this.form.getRawValue();
      const amount =
        this.data.account.type === 'STOCK'
          ? moneyString(investmentDecimal(value.quantity).mul(value.unitPrice))
          : value.amount;
      if (
        this.data.account.type === 'NPS' &&
        !this.data.liquidation &&
        value.source === 'RECURRING' &&
        !this.npsNavFetched()
      ) {
        const fetched = await this.refreshNpsNavs();
        if (!fetched) {
          throw new Error('Latest NAVs are required before recording a recurring contribution.');
        }
      }
      const schemeAllocations = this.npsSchemeAllocations()
        .filter((allocation) => Number(allocation.amount) > 0 || Number(allocation.units) > 0)
        .map((allocation) => {
          if (Number(allocation.amount) <= 0 || Number(allocation.units) <= 0) {
            if (!this.data.liquidation && Number(allocation.nav) <= 0) {
              throw new Error(
                `Latest NAV is unavailable for ${allocation.schemeName}. Refresh values before recording this contribution.`,
              );
            }
            throw new Error(
              this.data.liquidation
                ? 'Enter both withdrawn amount and withdrawn units for each selected NPS scheme.'
                : `Units could not be calculated for ${allocation.schemeName}.`,
            );
          }
          const nav = this.data.liquidation
            ? decimalString(investmentDecimal(allocation.amount).div(allocation.units))
            : allocation.nav;
          return {
            schemeCode: allocation.schemeCode,
            schemeName: allocation.schemeName,
            amount: moneyString(allocation.amount),
            units: decimalString(allocation.units),
            nav,
            navDate: this.data.liquidation ? value.date : allocation.navDate,
            unitsSource: this.data.liquidation ? ('STATEMENT' as const) : ('CALCULATED' as const),
          };
        });
      if (this.data.account.type === 'NPS') {
        if (!schemeAllocations.length) {
          throw new Error('Enter at least one NPS scheme allocation.');
        }
        if (
          !this.data.liquidation &&
          schemeAllocations.length !== this.npsSchemeAllocations().length
        ) {
          throw new Error('Distribute this NPS contribution across every scheme.');
        }
        const allocatedTotal = schemeAllocations.reduce(
          (total, allocation) => total.plus(allocation.amount),
          investmentDecimal(0),
        );
        if (!allocatedTotal.eq(moneyString(amount))) {
          throw new Error('Scheme allocation amounts must equal the transaction amount.');
        }
      }
      await this.investments.addTransaction(this.data.account, {
        type: this.labels.type,
        date: value.date,
        amount,
        paymentModeId: value.paymentModeId,
        quantity: this.data.account.type === 'STOCK' ? value.quantity : undefined,
        units: this.data.account.type === 'MUTUAL_FUND' ? value.units || undefined : undefined,
        price: this.data.account.type === 'STOCK' ? value.unitPrice : undefined,
        nav: this.data.account.type === 'MUTUAL_FUND' ? value.unitPrice || undefined : undefined,
        schemeAllocations: this.data.account.type === 'NPS' ? schemeAllocations : undefined,
        source: this.data.liquidation
          ? 'LIQUIDATION'
          : this.data.account.type === 'STOCK'
            ? 'ADHOC'
            : value.source,
        notes: value.notes,
      });
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Transaction could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }

  private createNpsAllocationDrafts(
    holdings: NpsSchemeHolding[],
    amount: string,
  ): NpsTransactionAllocationDraft[] {
    return this.withAllocatedAmounts(
      holdings.map((holding) => ({
        schemeCode: holding.schemeCode,
        schemeName: holding.schemeName ?? holding.schemeCode,
        allocationPercentage: holding.allocationPercentage,
        amount: '',
        units: '',
        nav: holding.nav,
        navDate: holding.navDate,
      })),
      amount,
    );
  }

  private withAllocatedAmounts(
    allocations: NpsTransactionAllocationDraft[],
    amount: string,
  ): NpsTransactionAllocationDraft[] {
    if (
      Number(amount) <= 0 ||
      !allocations.length ||
      allocations.some((allocation) => Number(allocation.allocationPercentage) <= 0) ||
      !allocations
        .reduce(
          (total, allocation) => total.plus(allocation.allocationPercentage ?? 0),
          investmentDecimal(0),
        )
        .eq(100)
    ) {
      return allocations.map((allocation) => ({ ...allocation, amount: '', units: '' }));
    }

    const total = investmentDecimal(amount);
    let assigned = investmentDecimal(0);
    return allocations.map((allocation, index) => {
      const allocatedAmount =
        index === allocations.length - 1
          ? total.minus(assigned)
          : investmentDecimal(
              moneyString(total.mul(allocation.allocationPercentage ?? 0).div(100)),
            );
      assigned = assigned.plus(allocatedAmount);
      const nav = Number(allocation.nav);
      const units =
        Number.isFinite(nav) && nav > 0
          ? decimalString(allocatedAmount.div(allocation.nav ?? 0), 4)
          : '';
      return { ...allocation, amount: moneyString(allocatedAmount), units };
    });
  }

  private updateNpsAllocation(schemeCode: string, field: 'amount' | 'units', value: string): void {
    this.npsSchemeAllocations.update((allocations) =>
      allocations.map((allocation) =>
        allocation.schemeCode === schemeCode ? { ...allocation, [field]: value } : allocation,
      ),
    );
  }
}

@Component({
  selector: 'app-investment-detail-page',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  template: `
    <section class="page investment-detail-page">
      <a routerLink="/investments" class="back-link"
        ><mat-icon aria-hidden="true">arrow_back</mat-icon>Investments</a
      >
      @if (account(); as item) {
        <header class="detail-header">
          <div>
            <span>{{ typeLabel(item) }}</span>
            <h1>{{ item.name }}</h1>
            <p>{{ item.institution || 'Personal investment' }}</p>
          </div>
          <div class="detail-actions">
            <button mat-flat-button type="button" (click)="addTransaction(item, false)">
              <mat-icon aria-hidden="true">add</mat-icon>{{ addLabel(item) }}</button
            ><button mat-stroked-button type="button" (click)="addTransaction(item, true)">
              <mat-icon aria-hidden="true">remove</mat-icon>{{ liquidationLabel(item) }}</button
            ><button mat-stroked-button type="button" (click)="edit(item)">
              <mat-icon aria-hidden="true">edit</mat-icon>Edit</button
            ><button
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
        <section class="detail-summary">
          <div>
            <span>Current value</span
            ><strong>{{
              investments.display(item.summary.currentValue)
                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </div>
          <div>
            <span>Invested</span
            ><strong>{{
              investments.display(
                item.status === 'CLOSED'
                  ? item.summary.totalContributions
                  : item.summary.remainingCostBasis
              ) | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </div>
          <div>
            <span>Realized return</span
            ><strong>{{
              investments.display(item.summary.realizedReturn)
                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </div>
          <div>
            <span>Unrealized return</span
            ><strong>{{
              investments.display(item.summary.unrealizedReturn)
                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
            }}</strong>
          </div>
          <div>
            <span>Overall return</span
            ><strong
              >{{
                investments.display(item.summary.overallReturnAmount)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}
              •
              {{
                investments.display(item.summary.overallReturnPercentage) | number: '1.2-2'
              }}%</strong
            >
          </div>
          <div>
            <span>Status</span><strong>{{ item.status === 'ACTIVE' ? 'Active' : 'Closed' }}</strong>
          </div>
        </section>
        <section class="recurring-plan">
          <div>
            <h2>Recurring plan</h2>
            <p>Commitment only—transactions are recorded separately.</p>
          </div>
          @if (item.recurringPlan?.enabled) {
            <strong
              >{{
                investments.display(investments.effectiveRecurring(item))
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}
              / {{ item.recurringPlan?.frequency?.toLowerCase() }}</strong
            >
          } @else {
            <strong>Not configured</strong>
          }
          <button mat-button type="button" (click)="editPlan(item)">Edit plan</button>
        </section>
        <section class="transaction-ledger">
          <header>
            <div>
              <h2>Transactions</h2>
              <p>The ledger is the source of truth.</p>
            </div>
          </header>
          @for (transaction of transactions(); track transaction.id) {
            <article>
              <span class="transaction-icon" [class.withdrawal]="isWithdrawal(transaction.type)"
                ><mat-icon aria-hidden="true">{{
                  isWithdrawal(transaction.type) ? 'south_west' : 'north_east'
                }}</mat-icon></span
              >
              <div>
                <strong>{{ transactionLabel(transaction.type) }}</strong
                ><small
                  >{{ transaction.date | date: 'mediumDate' }} •
                  {{
                    transaction.source === 'RECURRING'
                      ? 'Recurring'
                      : transaction.source === 'ADHOC'
                        ? 'Ad-hoc'
                        : 'Liquidation'
                  }}</small
                >
              </div>
              <b>{{
                investments.display(transaction.amount)
                  | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
              }}</b>
              @if (transaction.quantity || transaction.units) {
                <small
                  >{{ transaction.quantity || transaction.units }}
                  {{ item.type === 'STOCK' ? 'shares' : 'units' }}</small
                >
              }
            </article>
          } @empty {
            <div class="empty-ledger">No transactions after the opening snapshot.</div>
          }
        </section>
      } @else {
        <div class="empty-ledger">Investment not found.</div>
      }
    </section>
  `,
  styles: [
    `
      .investment-detail-page {
        width: min(1420px, 100%);
        margin: auto;
      }
      .back-link {
        display: flex;
        align-items: center;
        gap: 6px;
        width: max-content;
        color: #344054;
        text-decoration: none;
      }
      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 20px;
      }
      .detail-header h1 {
        margin: 5px 0;
        font-size: 2.2rem;
      }
      .detail-header span,
      .detail-header p {
        margin: 0;
        color: #667085;
      }
      .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .delete-action {
        color: #b42318;
      }
      .delete-error {
        margin: 0;
        padding: 12px 16px;
        border: 1px solid #fda29b;
        border-radius: 12px;
        background: #fff1f0;
        color: #b42318;
      }
      .detail-summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1px;
        overflow: hidden;
        border: 1px solid #e1e7ef;
        border-radius: 20px;
        background: #e1e7ef;
      }
      .detail-summary > div {
        display: grid;
        gap: 8px;
        padding: 20px;
        background: #fff;
      }
      .detail-summary span {
        color: #667085;
        font-size: 0.78rem;
      }
      .detail-summary strong {
        font-size: 1.15rem;
      }
      .recurring-plan {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border: 1px solid #d9e2ff;
        border-radius: 18px;
        background: #f7f8ff;
      }
      .recurring-plan h2,
      .recurring-plan p {
        margin: 0;
      }
      .recurring-plan p {
        margin-top: 4px;
        color: #667085;
        font-size: 0.78rem;
      }
      .transaction-ledger {
        padding: 22px;
        border: 1px solid #e1e7ef;
        border-radius: 20px;
      }
      .transaction-ledger header h2,
      .transaction-ledger header p {
        margin: 0;
      }
      .transaction-ledger header p {
        color: #667085;
      }
      .transaction-ledger article {
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr) auto;
        gap: 4px 12px;
        align-items: center;
        padding: 14px 0;
        border-bottom: 1px solid #eef1f5;
      }
      .transaction-ledger article > small {
        grid-column: 3;
        color: #667085;
      }
      .transaction-ledger article div small {
        display: block;
        margin-top: 4px;
        color: #667085;
      }
      .transaction-icon {
        display: grid;
        grid-row: span 2;
        width: 40px;
        height: 40px;
        place-items: center;
        border-radius: 50%;
        background: #ecfdf3;
        color: #067647;
      }
      .transaction-icon.withdrawal {
        background: #fff4ed;
        color: #b93815;
      }
      .empty-ledger {
        padding: 30px;
        text-align: center;
        color: #667085;
      }
      @media (max-width: 720px) {
        .detail-header {
          align-items: start;
        }
        .detail-actions {
          flex-direction: column;
        }
        .detail-summary {
          grid-template-columns: 1fr 1fr;
        }
        .recurring-plan {
          align-items: start;
          gap: 10px;
          flex-direction: column;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentDetailPage {
  readonly investments = inject(InvestmentStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  readonly deleteError = signal('');
  readonly investmentId = this.route.snapshot.paramMap.get('investmentId') ?? '';
  readonly account = computed(() =>
    this.investments.accounts().find((item) => item.id === this.investmentId),
  );
  readonly transactions = computed(() => this.investments.transactionsFor(this.investmentId));
  typeLabel(account: InvestmentAccount): string {
    return {
      STOCK: 'Stock',
      MUTUAL_FUND: 'Mutual Fund',
      NPS: 'NPS',
      PPF: 'PPF',
      SSY: 'Sukanya Samriddhi',
    }[account.type];
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
