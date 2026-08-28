import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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

import { investmentDecimal, moneyString } from '../domain/investments/investment-decimal';
import type {
  InvestmentAccount,
  InvestmentFrequencyV2,
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

@Component({
  selector: 'app-investment-edit-dialog',
  imports: [
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
          <mat-form-field appearance="outline"
            ><mat-label>Scheme holdings</mat-label
            ><textarea
              matInput
              rows="4"
              formControlName="npsHoldings"
              placeholder="SM001, 125.5, PFM name"
            ></textarea
            ><mat-hint>One per line: scheme code, units, optional PFM.</mat-hint></mat-form-field
          >
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
      .form-error {
        color: #b42318;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentEditDialog {
  readonly data = inject<InvestmentAccount>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<InvestmentEditDialog>>(MatDialogRef);
  private readonly investments = inject(InvestmentStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly stock =
    this.data.instrument?.kind === 'STOCK' ? this.data.instrument : undefined;
  private readonly fund =
    this.data.instrument?.kind === 'MUTUAL_FUND' ? this.data.instrument : undefined;
  private readonly nps = this.data.instrument?.kind === 'NPS' ? this.data.instrument : undefined;
  readonly error = signal('');
  readonly form = this.fb.group({
    name: [this.data.name, Validators.required],
    institution: [this.data.institution ?? ''],
    tradingSymbol: [this.stock?.tradingSymbol ?? ''],
    exchange: this.fb.control<'NSE' | 'BSE'>(this.stock?.exchange ?? 'NSE'),
    providerKey: [this.stock?.upstoxInstrumentKey ?? ''],
    isin: [this.stock?.isin ?? ''],
    schemeCode: [this.fund?.schemeCode ?? ''],
    plan: [this.fund?.plan ?? 'Direct'],
    option: [this.fund?.option ?? 'Growth'],
    npsHoldings: [
      this.nps?.schemeHoldings
        .map((item) => `${item.schemeCode}, ${item.units}, ${item.pfmName ?? ''}`)
        .join('\n') ?? '',
    ],
  });
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
        const schemeHoldings = value.npsHoldings.split(/\r?\n/).flatMap((line) => {
          const [schemeCode, units, pfmName] = line.split(',').map((part) => part.trim());
          return schemeCode && Number(units) >= 0
            ? [{ schemeCode, units, pfmName: pfmName || undefined }]
            : [];
        });
        if (schemeHoldings.length)
          instrument = { kind: 'NPS', provider: 'NPS_TRUST', schemeHoldings };
      }
      await this.investments.updateAccount({
        ...this.data,
        name: value.name.trim(),
        institution: value.institution.trim() || undefined,
        instrument,
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
            ><input matInput type="number" min="0" step="any" formControlName="amount" required
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
            <mat-form-field appearance="outline"
              ><mat-label>Scheme allocations (optional)</mat-label
              ><textarea
                matInput
                rows="3"
                formControlName="schemeAllocations"
                placeholder="SM001, 25.5&#10;SM002, 12.75"
              ></textarea
              ><mat-hint>One scheme per line: scheme code, units.</mat-hint></mat-form-field
            >
          }
        }
        @if (!data.liquidation && data.account.type !== 'STOCK') {
          <mat-form-field appearance="outline"
            ><mat-label>Source</mat-label
            ><mat-select formControlName="source"
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
      ><button mat-flat-button type="button" (click)="save()" [disabled]="saving()">
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentTransactionDialog {
  readonly data = inject<TransactionDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<InvestmentTransactionDialog>>(MatDialogRef);
  private readonly investments = inject(InvestmentStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly labels = transactionLabels(this.data.account, this.data.liquidation);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = this.fb.group({
    date: [this.today, Validators.required],
    amount: [this.data.liquidation ? '' : this.investments.effectiveRecurring(this.data.account)],
    quantity: [''],
    units: [''],
    unitPrice: [''],
    schemeAllocations: [''],
    source: this.fb.control<InvestmentTransactionSource>('ADHOC'),
    notes: [''],
  });

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const value = this.form.getRawValue();
      const amount =
        this.data.account.type === 'STOCK'
          ? moneyString(investmentDecimal(value.quantity).mul(value.unitPrice))
          : value.amount;
      const schemeAllocations = value.schemeAllocations.split(/\r?\n/).flatMap((line) => {
        const [schemeCode, units] = line.split(',').map((part) => part.trim());
        return schemeCode && Number(units) > 0 ? [{ schemeCode, units }] : [];
      });
      await this.investments.addTransaction(this.data.account, {
        type: this.labels.type,
        date: value.date,
        amount,
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
        max-width: 1050px;
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
