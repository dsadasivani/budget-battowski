import { CommonModule, NgOptimizedImage } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
  MatBottomSheetModule,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';

import { BudgetStore } from '../budget.store';
import {
  PAYMENT_BANK_OPTIONS,
  type PaymentAccount,
  type PaymentBankName,
  type PaymentCardType,
  type PaymentMode,
  type PaymentModeProvider,
  type PaymentModeType,
} from '../budget.models';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';
import { MonthMemberControls } from '../shared/month-member-controls';
import { InvestmentStore } from '../stores/investment.store';

type PaymentModeFilter = PaymentModeType | 'all';

type PaymentModeOption = {
  value: PaymentModeType;
  label: string;
  icon: string;
};

type PaymentProviderOption = {
  value: PaymentModeProvider;
  label: string;
  iconSrc: string;
};

type PaymentCardTypeOption = {
  value: PaymentCardType;
  label: string;
  iconSrc: string;
};

type PaymentModeFormData = {
  paymentMode?: PaymentMode;
};

type PaymentAccountFormData = {
  paymentAccount?: PaymentAccount;
};

type PaymentAccountModesData = {
  detail: string;
  iconSrc: string;
  mappedModes: PaymentMode[];
  paymentAccount: PaymentAccount;
  usageAmount: number;
};

const MODE_OPTIONS: PaymentModeOption[] = [
  { value: 'upi', label: 'UPI', icon: 'qr_code_2' },
  { value: 'credit-card', label: 'Credit Card', icon: 'credit_card' },
  { value: 'debit-card', label: 'Debit Card', icon: 'credit_card' },
  { value: 'internet-banking', label: 'Internet Banking', icon: 'account_balance' },
];

const PROVIDER_OPTIONS: PaymentProviderOption[] = [
  { value: 'PhonePe', label: 'PhonePe', iconSrc: '/payment-icons/phonepe.svg' },
  { value: 'Apple Pay', label: 'Apple Pay', iconSrc: '/payment-icons/apple-pay.svg' },
  { value: 'Samsung Pay', label: 'Samsung Pay', iconSrc: '/payment-icons/samsung-pay.svg' },
  { value: 'Google Pay', label: 'Google Pay', iconSrc: '/payment-icons/google-pay.svg' },
  { value: 'Paytm', label: 'Paytm', iconSrc: '/payment-icons/paytm.svg' },
  { value: 'BHIM', label: 'BHIM', iconSrc: '/payment-icons/bhim.svg' },
];

const CARD_TYPE_OPTIONS: PaymentCardTypeOption[] = [
  { value: 'rupay', label: 'Rupay', iconSrc: '/payment-icons/cards_rupay.svg' },
  { value: 'maestro', label: 'Maestro', iconSrc: '/payment-icons/cards_maestro.svg' },
  {
    value: 'diners-club',
    label: 'Diners Club',
    iconSrc: '/payment-icons/cards_diners-club.svg',
  },
  { value: 'master-card', label: 'Master Card', iconSrc: '/payment-icons/cards_master-card.svg' },
  {
    value: 'american-express',
    label: 'American Express',
    iconSrc: '/payment-icons/cards_american-express.svg',
  },
  { value: 'visa', label: 'VISA', iconSrc: '/payment-icons/cards_visa.svg' },
];

const BANK_OPTIONS = PAYMENT_BANK_OPTIONS;
const DEFAULT_PROVIDER: PaymentModeProvider = 'PhonePe';
const DEFAULT_BANK_NAME: PaymentBankName = 'Default';
const DEFAULT_CARD_ICON = '/payment-icons/cards_default.svg';
const DEFAULT_CASH_PAYMENT_MODE_ID = 'payment-mode-cash';

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function paymentProviderValue(
  provider: PaymentMode['provider'] | string | undefined,
): PaymentModeProvider {
  if (provider === 'GPay') {
    return 'Google Pay';
  }

  if (provider === 'SamsungPay') {
    return 'Samsung Pay';
  }

  const option = PROVIDER_OPTIONS.find((item) => item.value === provider);
  return option?.value ?? DEFAULT_PROVIDER;
}

function paymentCardTypeValue(
  cardType: PaymentMode['cardType'] | string | undefined,
): PaymentCardType | '' {
  const option = CARD_TYPE_OPTIONS.find((item) => item.value === cardType);
  return option?.value ?? '';
}

function paymentBankNameValue(bankName: PaymentBankName | string | undefined): PaymentBankName {
  const option = BANK_OPTIONS.find((item) => item.name === bankName);
  return option?.name ?? DEFAULT_BANK_NAME;
}

function isProviderType(type: PaymentModeType): boolean {
  return type === 'upi';
}

function isCardType(type: PaymentModeType): boolean {
  return type === 'credit-card' || type === 'debit-card';
}

function isAccountBackedType(type: PaymentModeType): boolean {
  return type === 'upi' || type === 'debit-card' || type === 'internet-banking';
}

function buildPaymentModeFromForm(
  type: PaymentModeType,
  provider: PaymentModeProvider,
  cardType: PaymentCardType | '',
  bankName: PaymentBankName,
  rawLastFour: string,
  rawPaymentAccountId: string,
  existing: PaymentMode | undefined,
  editingId: string | null,
): { ok: true; value: PaymentMode } | { ok: false; error: string } {
  const lastFour = rawLastFour.replace(/\D/g, '').slice(0, 4);
  const selectedCardType = cardType || undefined;
  const paymentAccountId = rawPaymentAccountId || undefined;

  if (isProviderType(type) && !provider) {
    return { ok: false, error: 'Choose a provider for UPI modes.' };
  }

  if (isCardType(type) && !/^\d{4}$/.test(lastFour)) {
    return { ok: false, error: 'Card modes need exactly 4 digits.' };
  }

  if (type === 'internet-banking' && !paymentAccountId) {
    return { ok: false, error: 'Choose a linked payment account for internet banking.' };
  }

  const now = new Date().toISOString();
  const modeLabel = MODE_OPTIONS.find((option) => option.value === type)?.label ?? 'Payment mode';

  return {
    ok: true,
    value: {
      id: existing?.id ?? editingId ?? id('payment-mode'),
      type,
      name: existing?.name ?? modeLabel,
      provider: isProviderType(type) ? provider : undefined,
      cardType: isCardType(type) ? selectedCardType : undefined,
      lastFour: isCardType(type) ? lastFour : undefined,
      bankName: type === 'credit-card' ? paymentBankNameValue(bankName) : undefined,
      paymentAccountId: isAccountBackedType(type) ? paymentAccountId : undefined,
      memberEmail: existing?.memberEmail,
      workspaceGlobal: existing?.workspaceGlobal,
      createdDate: existing?.createdDate ?? now,
      updatedDate: now,
      archivedDate: existing?.archivedDate,
    },
  };
}

function buildPaymentAccountFromForm(
  bankName: PaymentBankName,
  rawLastFour: string,
  existing: PaymentAccount | undefined,
  editingId: string | null,
): { ok: true; value: PaymentAccount } | { ok: false; error: string } {
  const lastFour = rawLastFour.replace(/\D/g, '').slice(0, 4);

  if (!/^\d{4}$/.test(lastFour)) {
    return { ok: false, error: 'Account needs exactly 4 digits.' };
  }

  const now = new Date().toISOString();

  return {
    ok: true,
    value: {
      id: existing?.id ?? editingId ?? id('payment-account'),
      name: existing?.name ?? 'Bank account',
      bankName: paymentBankNameValue(bankName),
      lastFour,
      memberEmail: existing?.memberEmail,
      createdDate: existing?.createdDate ?? now,
      updatedDate: now,
      archivedDate: existing?.archivedDate,
    },
  };
}

@Component({
  selector: 'app-payment-mode-form-sheet',
  imports: [
    CommonModule,
    NgOptimizedImage,
    ReactiveFormsModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <section class="payment-mode-sheet" aria-labelledby="payment-mode-sheet-title">
      <header>
        <div>
          <h2 id="payment-mode-sheet-title">
            {{ editingId() ? 'Edit Payment Mode' : 'Add Payment Mode' }}
          </h2>
          <p>{{ formSubtitle() }}</p>
        </div>
        <button
          mat-icon-button
          type="button"
          aria-label="Close payment mode form"
          (click)="close()"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <form [formGroup]="form" (ngSubmit)="savePaymentMode()">
        <div class="mode-button-grid" aria-label="Payment mode type">
          @for (option of modeOptions; track option.value) {
            <button
              type="button"
              [class.active]="formType() === option.value"
              [attr.aria-pressed]="formType() === option.value"
              (click)="setFormType(option.value)"
            >
              <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
              <span>{{ option.label }}</span>
            </button>
          }
        </div>

        @if (isProviderType(formType())) {
          <mat-form-field appearance="outline">
            <mat-label>Provider</mat-label>
            <mat-select formControlName="provider">
              @for (provider of providerOptions; track provider.value) {
                <mat-option [value]="provider.value">
                  <span class="select-option-with-icon">
                    <img [ngSrc]="provider.iconSrc" width="28" height="28" alt="" />
                    <span>{{ provider.label }}</span>
                  </span>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else if (isCardType(formType())) {
          @if (formType() === 'credit-card') {
            <mat-form-field appearance="outline">
              <mat-label>Bank</mat-label>
              <mat-select formControlName="bankName">
                @for (bank of bankOptions; track bank.name) {
                  <mat-option [value]="bank.name">
                    <span class="select-option-with-icon">
                      <img [ngSrc]="bank.iconSrc" width="28" height="28" alt="" />
                      <span>{{ bank.name }}</span>
                    </span>
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
          }

          <mat-form-field appearance="outline">
            <mat-label>Card type</mat-label>
            <mat-select formControlName="cardType">
              <mat-option value="">
                <span class="select-option-with-icon">
                  <img [ngSrc]="defaultCardIcon" width="28" height="28" alt="" />
                  <span>Default card</span>
                </span>
              </mat-option>
              @for (cardType of cardTypeOptions; track cardType.value) {
                <mat-option [value]="cardType.value">
                  <span class="select-option-with-icon">
                    <img [ngSrc]="cardType.iconSrc" width="28" height="28" alt="" />
                    <span>{{ cardType.label }}</span>
                  </span>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Last 4 digits</mat-label>
            <input
              matInput
              formControlName="lastFour"
              autocomplete="cc-number"
              inputmode="numeric"
              maxlength="4"
              pattern="[0-9]*"
            />
          </mat-form-field>
        }

        @if (isAccountBackedType(formType())) {
          <mat-form-field appearance="outline">
            <mat-label>Payment account</mat-label>
            <mat-select formControlName="paymentAccountId">
              @if (formType() !== 'internet-banking') {
                <mat-option value="">No linked account</mat-option>
              }
              @for (account of paymentAccountOptions(); track account.id) {
                <mat-option [value]="account.id">
                  <span class="select-option-with-icon">
                    <img
                      [ngSrc]="store.paymentAccountIconSrc(account)"
                      width="28"
                      height="28"
                      alt=""
                    />
                    <span>
                      {{ store.paymentAccountLabel(account) }} ·
                      {{ store.paymentAccountDetail(account) }}
                    </span>
                  </span>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        @if (validationError()) {
          <p class="form-error" role="alert">
            <mat-icon aria-hidden="true">error_outline</mat-icon>
            {{ validationError() }}
          </p>
        }

        <div class="form-actions">
          <button mat-stroked-button type="button" (click)="close()">Cancel</button>
          <button mat-flat-button type="submit" [disabled]="!store.canWrite()">
            <mat-icon aria-hidden="true">{{ editingId() ? 'save' : 'add' }}</mat-icon>
            {{ editingId() ? 'Save Changes' : 'Save Mode' }}
          </button>
        </div>
      </form>
    </section>
  `,
  styles: [
    `
      .payment-mode-sheet {
        display: grid;
        gap: 16px;
        padding: 8px 2px 14px;
      }

      header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }

      h2,
      p {
        margin: 0;
      }

      h2 {
        color: #10213f;
        font-size: 1.15rem;
        font-weight: 800;
      }

      p {
        margin-top: 4px;
        color: #60708a;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      form {
        display: grid;
        gap: 14px;
      }

      .mode-button-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .mode-button-grid button {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 10px;
        border: 1px solid #d9e3f0;
        border-radius: 8px;
        background: #fff;
        color: #34445b;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 700;
      }

      .mode-button-grid button.active {
        border-color: #2f80ed;
        background: #eaf4ff;
        color: #135ab8;
      }

      .form-error {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: #be123c;
        font-weight: 700;
      }

      .select-option-with-icon {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .select-option-with-icon img {
        display: block;
        width: 28px;
        height: 28px;
        object-fit: contain;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentModeFormSheet {
  private readonly bottomSheetRef =
    inject<MatBottomSheetRef<PaymentModeFormSheet>>(MatBottomSheetRef);
  private readonly data = inject<PaymentModeFormData>(MAT_BOTTOM_SHEET_DATA, { optional: true });
  protected readonly store = inject(BudgetStore);
  private readonly formBuilder = inject(FormBuilder);

  protected paymentAccountOptions(): PaymentAccount[] {
    return this.store.paymentAccountsForPaymentMode(this.data?.paymentMode);
  }

  readonly modeOptions = MODE_OPTIONS;
  readonly providerOptions = PROVIDER_OPTIONS;
  readonly cardTypeOptions = CARD_TYPE_OPTIONS;
  readonly bankOptions = BANK_OPTIONS;
  readonly defaultCardIcon = DEFAULT_CARD_ICON;
  readonly editingId = signal<string | null>(this.data?.paymentMode?.id ?? null);
  readonly formType = signal<PaymentModeType>(this.data?.paymentMode?.type ?? 'upi');
  readonly validationError = signal('');
  readonly form = this.formBuilder.group({
    type: this.formBuilder.nonNullable.control<PaymentModeType>(
      this.data?.paymentMode?.type ?? 'upi',
    ),
    provider: this.formBuilder.nonNullable.control<PaymentModeProvider>(
      paymentProviderValue(this.data?.paymentMode?.provider),
    ),
    cardType: this.formBuilder.nonNullable.control<PaymentCardType | ''>(
      paymentCardTypeValue(this.data?.paymentMode?.cardType),
    ),
    bankName: this.formBuilder.nonNullable.control<PaymentBankName>(
      paymentBankNameValue(this.data?.paymentMode?.bankName),
    ),
    paymentAccountId: this.formBuilder.nonNullable.control(
      this.data?.paymentMode?.paymentAccountId ?? '',
    ),
    lastFour: this.formBuilder.nonNullable.control(this.data?.paymentMode?.lastFour ?? ''),
  });
  readonly formSubtitle = computed(() =>
    this.isProviderType(this.formType())
      ? 'Choose the provider; the owner tag is added automatically.'
      : this.isCardType(this.formType())
        ? 'Save the bank, card type, and last four digits for quick identification.'
        : this.formType() === 'internet-banking'
          ? 'Link a payment account to identify the bank and account ending.'
          : 'Keep cash transactions available as a saved payment mode.',
  );

  setFormType(type: PaymentModeType): void {
    this.formType.set(type);
    this.form.controls.type.setValue(type);
    this.validationError.set('');

    if (this.isProviderType(type) && !this.form.controls.provider.value) {
      this.form.controls.provider.setValue(DEFAULT_PROVIDER);
    }

    if (!this.isAccountBackedType(type)) {
      this.form.controls.paymentAccountId.setValue('');
    }
  }

  close(): void {
    this.bottomSheetRef.dismiss();
  }

  savePaymentMode(): void {
    const paymentMode = buildPaymentModeFromForm(
      this.form.controls.type.value,
      this.form.controls.provider.value,
      this.form.controls.cardType.value,
      this.form.controls.bankName.value,
      this.form.controls.lastFour.value,
      this.form.controls.paymentAccountId.value,
      this.data?.paymentMode,
      this.editingId(),
    );

    if (!paymentMode.ok) {
      this.validationError.set(paymentMode.error);
      return;
    }

    void this.store.savePaymentMode(paymentMode.value).then((saved) => {
      if (saved) {
        this.bottomSheetRef.dismiss(paymentMode.value);
      }
    });
  }

  isProviderType(type: PaymentModeType): boolean {
    return isProviderType(type);
  }

  isCardType(type: PaymentModeType): boolean {
    return isCardType(type);
  }

  isAccountBackedType(type: PaymentModeType): boolean {
    return isAccountBackedType(type);
  }
}

@Component({
  selector: 'app-payment-account-form-sheet',
  imports: [
    CommonModule,
    NgOptimizedImage,
    ReactiveFormsModule,
    MatBottomSheetModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <section class="payment-mode-sheet" aria-labelledby="payment-account-sheet-title">
      <header>
        <div>
          <h2 id="payment-account-sheet-title">
            {{ editingId() ? 'Edit Payment Account' : 'Add Payment Account' }}
          </h2>
          <p>Save the bank and last four digits for account-level totals.</p>
        </div>
        <button
          mat-icon-button
          type="button"
          aria-label="Close payment account form"
          (click)="close()"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <form [formGroup]="form" (ngSubmit)="savePaymentAccount()">
        <mat-form-field appearance="outline">
          <mat-label>Bank</mat-label>
          <mat-select formControlName="bankName">
            @for (bank of bankOptions; track bank.name) {
              <mat-option [value]="bank.name">
                <span class="select-option-with-icon">
                  <img [ngSrc]="bank.iconSrc" width="28" height="28" alt="" />
                  <span>{{ bank.name }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Last 4 account digits</mat-label>
          <input
            matInput
            formControlName="lastFour"
            autocomplete="off"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]*"
          />
        </mat-form-field>

        @if (validationError()) {
          <p class="form-error" role="alert">
            <mat-icon aria-hidden="true">error_outline</mat-icon>
            {{ validationError() }}
          </p>
        }

        <div class="form-actions">
          <button mat-stroked-button type="button" (click)="close()">Cancel</button>
          <button mat-flat-button type="submit" [disabled]="!store.canWrite()">
            <mat-icon aria-hidden="true">{{ editingId() ? 'save' : 'add' }}</mat-icon>
            {{ editingId() ? 'Save Changes' : 'Save Account' }}
          </button>
        </div>
      </form>
    </section>
  `,
  styles: [
    `
      .payment-mode-sheet {
        display: grid;
        gap: 16px;
        padding: 8px 2px 14px;
      }

      header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
      }

      h2,
      p {
        margin: 0;
      }

      h2 {
        color: #10213f;
        font-size: 1.15rem;
        font-weight: 800;
      }

      p {
        margin-top: 4px;
        color: #60708a;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      form {
        display: grid;
        gap: 14px;
      }

      .form-error {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: #be123c;
        font-weight: 700;
      }

      .select-option-with-icon {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .select-option-with-icon img {
        display: block;
        width: 28px;
        height: 28px;
        object-fit: contain;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentAccountFormSheet {
  private readonly bottomSheetRef =
    inject<MatBottomSheetRef<PaymentAccountFormSheet>>(MatBottomSheetRef);
  private readonly data = inject<PaymentAccountFormData>(MAT_BOTTOM_SHEET_DATA, {
    optional: true,
  });
  protected readonly store = inject(BudgetStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly bankOptions = BANK_OPTIONS;
  readonly editingId = signal<string | null>(this.data?.paymentAccount?.id ?? null);
  readonly validationError = signal('');
  readonly form = this.formBuilder.group({
    bankName: this.formBuilder.nonNullable.control<PaymentBankName>(
      paymentBankNameValue(this.data?.paymentAccount?.bankName),
    ),
    lastFour: this.formBuilder.nonNullable.control(this.data?.paymentAccount?.lastFour ?? ''),
  });

  close(): void {
    this.bottomSheetRef.dismiss();
  }

  savePaymentAccount(): void {
    const paymentAccount = buildPaymentAccountFromForm(
      this.form.controls.bankName.value,
      this.form.controls.lastFour.value,
      this.data?.paymentAccount,
      this.editingId(),
    );

    if (!paymentAccount.ok) {
      this.validationError.set(paymentAccount.error);
      return;
    }

    void this.store.savePaymentAccount(paymentAccount.value).then((saved) => {
      if (saved) {
        this.bottomSheetRef.dismiss(paymentAccount.value);
      }
    });
  }
}

@Component({
  selector: 'app-payment-account-modes-sheet',
  imports: [CommonModule, NgOptimizedImage, MatBottomSheetModule, MatButtonModule, MatIconModule],
  template: `
    <section class="payment-mode-sheet" aria-labelledby="payment-account-modes-title">
      <header>
        <span class="category-icon payment-provider-mark bank" aria-hidden="true">
          <img [ngSrc]="data.iconSrc" width="40" height="40" alt="" />
        </span>
        <div>
          <h2 id="payment-account-modes-title">
            {{ store.paymentAccountLabel(data.paymentAccount) }}
          </h2>
          <p>{{ data.detail }}</p>
        </div>
        <button
          mat-icon-button
          type="button"
          aria-label="Close mapped payment modes"
          (click)="close()"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </header>

      <div class="sheet-summary">
        <span>
          <strong>{{ data.mappedModes.length }}</strong>
          {{ data.mappedModes.length === 1 ? 'mode' : 'modes' }}
        </span>
        <span>
          <strong>{{ data.usageAmount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
          used
        </span>
      </div>

      <div class="mapped-mode-list" aria-label="Mapped payment modes">
        @for (paymentMode of data.mappedModes; track paymentMode.id) {
          @if (paymentModeUsage(paymentMode.id); as usage) {
            <article class="mapped-mode-card">
              <span
                class="category-icon payment-provider-mark {{
                  store.paymentModeTone(paymentMode.id)
                }}"
                aria-hidden="true"
              >
                <img
                  [ngSrc]="store.paymentModeIconSrc(paymentMode)"
                  width="34"
                  height="34"
                  alt=""
                />
              </span>
              <div class="mapped-mode-copy">
                <strong>{{ store.paymentModeDisplayLabel(paymentMode) }}</strong>
                <small>
                  {{ store.paymentModeTypeLabel(paymentMode.type) }} ·
                  {{ store.paymentModeDetail(paymentMode) }}
                </small>
              </div>
              <div class="mapped-mode-meta">
                <span class="badge neutral">{{ store.paymentModeOwnerTag(paymentMode) }}</span>
                <span class="badge neutral">
                  {{ usage.count }} {{ usage.count === 1 ? 'record' : 'records' }}
                </span>
                <strong>{{ usage.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}</strong>
              </div>
            </article>
          }
        } @empty {
          <span class="empty-inline">No mapped payment modes</span>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .payment-mode-sheet {
        display: grid;
        gap: 16px;
        padding: 8px 2px 14px;
      }

      header {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: start;
        gap: 12px;
      }

      h2,
      p {
        margin: 0;
      }

      h2 {
        color: #10213f;
        font-size: 1.15rem;
        font-weight: 800;
      }

      p {
        margin-top: 4px;
        color: #60708a;
        font-size: 0.88rem;
        line-height: 1.35;
      }

      .payment-provider-mark {
        display: inline-grid;
        width: 44px;
        height: 44px;
        place-items: center;
        border-radius: 12px;
        background: #edf6ff;
      }

      .payment-provider-mark img {
        display: block;
        width: 40px;
        height: 40px;
        object-fit: contain;
      }

      .sheet-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .mapped-mode-list {
        display: grid;
        gap: 10px;
      }

      .mapped-mode-card {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr);
        gap: 10px;
        padding: 10px;
        border: 1px solid #e3ebf6;
        border-radius: 8px;
        background: #f8fbff;
      }

      .mapped-mode-card .payment-provider-mark {
        width: 40px;
        height: 40px;
        border-radius: 10px;
      }

      .mapped-mode-copy {
        min-width: 0;
      }

      .mapped-mode-copy strong,
      .mapped-mode-copy small {
        display: block;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .mapped-mode-copy strong {
        color: #10213f;
        font-size: 0.98rem;
        font-weight: 800;
        line-height: 1.2;
      }

      .mapped-mode-copy small {
        margin-top: 3px;
        color: #60708a;
        font-size: 0.82rem;
        font-weight: 600;
      }

      .mapped-mode-meta {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }

      .mapped-mode-meta strong {
        color: #10213f;
        font-size: 0.95rem;
        font-weight: 800;
      }

      .sheet-summary span {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        border: 1px solid #d9e3f0;
        border-radius: 999px;
        background: #fff;
        color: #60708a;
        font-size: 0.78rem;
        font-weight: 800;
      }

      .sheet-summary strong {
        color: #10213f;
      }

      .payment-mode-badge {
        display: inline-flex;
        min-height: 30px;
        max-width: 100%;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        border: 1px solid #d9e3f0;
        border-radius: 999px;
        background: #eef2f7;
        color: #34445b;
        font-size: 0.78rem;
        font-weight: 700;
        line-height: 1;
      }

      .payment-mode-badge img {
        display: block;
        width: 18px;
        height: 18px;
        margin-right: 7px;
        border-radius: 4px;
        object-fit: contain;
      }

      .empty-inline {
        color: #60708a;
        font-size: 0.9rem;
        font-weight: 700;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentAccountModesSheet {
  private readonly bottomSheetRef =
    inject<MatBottomSheetRef<PaymentAccountModesSheet>>(MatBottomSheetRef);
  protected readonly data = inject<PaymentAccountModesData>(MAT_BOTTOM_SHEET_DATA);
  protected readonly store = inject(BudgetStore);
  private readonly investments = inject(InvestmentStore);

  protected paymentModeUsage(paymentModeId: string): { amount: number; count: number } {
    const legacy = this.store.paymentModeUsage(paymentModeId);
    const current = this.investments.paymentModeUsage(paymentModeId);
    return { amount: legacy.amount + current.amount, count: legacy.count + current.count };
  }

  close(): void {
    this.bottomSheetRef.dismiss();
  }
}

@Component({
  selector: 'app-payment-modes-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgOptimizedImage,
    MatBottomSheetModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    MonthMemberControls,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="paymentModes" />
    } @else {
      <section class="page mobile-payment-modes-page">
        <header class="page-header desktop-page-header">
          <div>
            <h1>Payment Modes</h1>
            <p>Save payment modes, connect bank accounts, and review selected-month usage.</p>
          </div>
          <div class="header-actions"><app-month-member-controls /></div>
        </header>

        <div class="mobile-page-controls mobile-filter-strip">
          <app-month-member-controls />
        </div>

        <mat-tab-group
          class="payment-tabs"
          [selectedIndex]="selectedTabIndex()"
          (selectedIndexChange)="selectTab($event)"
          animationDuration="160ms"
          mat-stretch-tabs="false"
        >
          <mat-tab label="Payment Modes">
            <section class="payment-tab-panel" aria-label="Payment modes">
              <aside class="payment-stat-tags" aria-label="Payment mode summary">
                <span class="payment-stat-tag blue">
                  <span class="payment-stat-icon" aria-hidden="true">
                    <mat-icon>payments</mat-icon>
                  </span>
                  <span class="payment-stat-copy">
                    <span>Saved Modes</span>
                    <strong>{{ store.activePaymentModes().length }}</strong>
                  </span>
                </span>
                <span class="payment-stat-tag teal">
                  <span class="payment-stat-icon" aria-hidden="true">
                    <mat-icon>account_balance</mat-icon>
                  </span>
                  <span class="payment-stat-copy">
                    <span>Linked</span>
                    <strong>{{ mappedPaymentModeCount() }}</strong>
                  </span>
                </span>
                <span class="payment-stat-tag orange">
                  <span class="payment-stat-icon" aria-hidden="true">
                    <mat-icon>credit_card</mat-icon>
                  </span>
                  <span class="payment-stat-copy">
                    <span>Cards</span>
                    <strong>{{ store.cardPaymentModeCount() }}</strong>
                  </span>
                </span>
              </aside>

              <section class="payment-mode-layout">
                <section class="payment-list-panel" aria-label="Saved payment modes">
                  <div class="mobile-payment-panel-actions">
                    <button
                      class="mobile-panel-add-button"
                      mat-icon-button
                      type="button"
                      aria-label="Add payment mode"
                      matTooltip="Add payment mode"
                      (click)="openPaymentModeForm()"
                      [disabled]="!store.canWrite()"
                    >
                      <mat-icon aria-hidden="true">add_card</mat-icon>
                    </button>
                  </div>
                  <div class="payment-filter-row" aria-label="Filter payment modes">
                    @for (filter of filterOptions; track filter.value) {
                      <button
                        type="button"
                        [class.active]="selectedFilter() === filter.value"
                        [attr.aria-pressed]="selectedFilter() === filter.value"
                        (click)="selectedFilter.set(filter.value)"
                      >
                        {{ filter.label }}
                      </button>
                    }
                  </div>

                  <div class="payment-mode-grid">
                    @for (paymentMode of filteredPaymentModes(); track paymentMode.id) {
                      <article
                        class="category-card payment-mode-card {{ paymentMode.type }} {{
                          paymentMode.providerTone
                        }}"
                      >
                        <header>
                          <span
                            class="category-icon payment-provider-mark {{
                              paymentMode.providerTone
                            }}"
                            aria-hidden="true"
                          >
                            <img [ngSrc]="paymentMode.iconSrc" width="40" height="40" alt="" />
                          </span>
                          <div>
                            <h2>{{ paymentMode.displayName }}</h2>
                            @if (isCardType(paymentMode.type)) {
                              <p>{{ paymentMode.typeLabel }}</p>
                            } @else {
                              <p>{{ paymentMode.typeLabel }} &middot; {{ paymentMode.detail }}</p>
                            }
                            @if (paymentMode.paymentAccountName) {
                              <span class="payment-account-chip">
                                @if (paymentMode.bankIconSrc) {
                                  <img
                                    [ngSrc]="paymentMode.bankIconSrc"
                                    width="18"
                                    height="18"
                                    alt=""
                                  />
                                }
                                {{ paymentMode.paymentAccountName }} ·
                                {{ paymentMode.paymentAccountDetail }}
                              </span>
                            } @else if (
                              paymentMode.type === 'credit-card' && paymentMode.bankName
                            ) {
                              <span class="payment-account-chip">
                                @if (paymentMode.bankIconSrc) {
                                  <img
                                    [ngSrc]="paymentMode.bankIconSrc"
                                    width="18"
                                    height="18"
                                    alt=""
                                  />
                                }
                                {{ paymentMode.bankName }}
                              </span>
                            }
                          </div>
                          <div class="payment-card-actions">
                            <button
                              mat-icon-button
                              type="button"
                              aria-label="Edit payment mode"
                              matTooltip="Edit payment mode"
                              (click)="openPaymentModeForm(paymentMode)"
                              [disabled]="!store.canWrite()"
                            >
                              <mat-icon aria-hidden="true">edit</mat-icon>
                            </button>
                            <button
                              mat-icon-button
                              type="button"
                              aria-label="Archive payment mode"
                              matTooltip="Archive payment mode"
                              (click)="archivePaymentMode(paymentMode.id)"
                              [disabled]="!store.canWrite() || !canArchivePaymentMode(paymentMode)"
                            >
                              <mat-icon aria-hidden="true">archive</mat-icon>
                            </button>
                          </div>
                        </header>

                        @if (isCardType(paymentMode.type)) {
                          <p
                            class="payment-card-number"
                            role="img"
                            [attr.aria-label]="
                              paymentMode.typeLabel + ' ending ' + paymentMode.lastFour
                            "
                          >
                            <span aria-hidden="true">{{ paymentMode.detail }}</span>
                          </p>
                        }

                        <div class="category-card-body">
                          <span>
                            Used
                            {{
                              paymentMode.usageAmount
                                | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                            }}
                          </span>
                          <span class="payment-card-badges">
                            <span class="badge neutral">
                              {{ paymentMode.recordCount }}
                              {{ paymentMode.recordCount === 1 ? 'record' : 'records' }}
                            </span>
                            <span class="badge neutral">{{ paymentMode.ownerTag }}</span>
                          </span>
                        </div>
                      </article>
                    } @empty {
                      <div class="empty-state">No payment modes match this view</div>
                    }
                  </div>
                </section>

                <article class="panel-card payment-form-card">
                  <header class="panel-heading">
                    <h2>{{ editingId() ? 'Edit Payment Mode' : 'Add Payment Mode' }}</h2>
                    <p>{{ formSubtitle() }}</p>
                  </header>

                  <form [formGroup]="form" (ngSubmit)="savePaymentMode()">
                    <div class="mode-button-grid" aria-label="Payment mode type">
                      @for (option of modeOptions; track option.value) {
                        <button
                          type="button"
                          [class.active]="formType() === option.value"
                          [attr.aria-pressed]="formType() === option.value"
                          (click)="setFormType(option.value)"
                        >
                          <mat-icon aria-hidden="true">{{ option.icon }}</mat-icon>
                          <span>{{ option.label }}</span>
                        </button>
                      }
                    </div>

                    @if (isProviderType(formType())) {
                      <mat-form-field appearance="outline">
                        <mat-label>Provider</mat-label>
                        <mat-select formControlName="provider">
                          @for (provider of providerOptions; track provider.value) {
                            <mat-option [value]="provider.value">
                              <span class="select-option-with-icon">
                                <img [ngSrc]="provider.iconSrc" width="28" height="28" alt="" />
                                <span>{{ provider.label }}</span>
                              </span>
                            </mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                    } @else if (isCardType(formType())) {
                      @if (formType() === 'credit-card') {
                        <mat-form-field appearance="outline">
                          <mat-label>Bank</mat-label>
                          <mat-select formControlName="bankName">
                            @for (bank of bankOptions; track bank.name) {
                              <mat-option [value]="bank.name">
                                <span class="select-option-with-icon">
                                  <img [ngSrc]="bank.iconSrc" width="28" height="28" alt="" />
                                  <span>{{ bank.name }}</span>
                                </span>
                              </mat-option>
                            }
                          </mat-select>
                        </mat-form-field>
                      }

                      <mat-form-field appearance="outline">
                        <mat-label>Card type</mat-label>
                        <mat-select formControlName="cardType">
                          <mat-option value="">
                            <span class="select-option-with-icon">
                              <img [ngSrc]="defaultCardIcon" width="28" height="28" alt="" />
                              <span>Default card</span>
                            </span>
                          </mat-option>
                          @for (cardType of cardTypeOptions; track cardType.value) {
                            <mat-option [value]="cardType.value">
                              <span class="select-option-with-icon">
                                <img [ngSrc]="cardType.iconSrc" width="28" height="28" alt="" />
                                <span>{{ cardType.label }}</span>
                              </span>
                            </mat-option>
                          }
                        </mat-select>
                      </mat-form-field>

                      <mat-form-field appearance="outline">
                        <mat-label>Last 4 digits</mat-label>
                        <input
                          matInput
                          formControlName="lastFour"
                          autocomplete="cc-number"
                          inputmode="numeric"
                          maxlength="4"
                          pattern="[0-9]*"
                        />
                      </mat-form-field>
                    }

                    @if (isAccountBackedType(formType())) {
                      <mat-form-field appearance="outline">
                        <mat-label>Payment account</mat-label>
                        <mat-select formControlName="paymentAccountId">
                          @if (formType() !== 'internet-banking') {
                            <mat-option value="">No linked account</mat-option>
                          }
                          @for (account of paymentAccountOptions(); track account.id) {
                            <mat-option [value]="account.id">
                              <span class="select-option-with-icon">
                                <img
                                  [ngSrc]="store.paymentAccountIconSrc(account)"
                                  width="28"
                                  height="28"
                                  alt=""
                                />
                                <span>
                                  {{ store.paymentAccountLabel(account) }} ·
                                  {{ store.paymentAccountDetail(account) }}
                                </span>
                              </span>
                            </mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                    }

                    @if (validationError()) {
                      <p class="form-error" role="alert">
                        <mat-icon aria-hidden="true">error_outline</mat-icon>
                        {{ validationError() }}
                      </p>
                    }

                    <div class="form-actions">
                      @if (editingId()) {
                        <button mat-stroked-button type="button" (click)="resetForm()">
                          Cancel
                        </button>
                      }
                      <button mat-flat-button type="submit" [disabled]="!store.canWrite()">
                        <mat-icon aria-hidden="true">{{ editingId() ? 'save' : 'add' }}</mat-icon>
                        {{ editingId() ? 'Save Changes' : 'Save Mode' }}
                      </button>
                    </div>
                  </form>
                </article>
              </section>
            </section>
          </mat-tab>

          <mat-tab label="Payment Accounts">
            <section class="payment-tab-panel" aria-label="Payment accounts">
              <aside class="payment-stat-tags" aria-label="Payment account summary">
                <span class="payment-stat-tag blue">
                  <span class="payment-stat-icon" aria-hidden="true">
                    <mat-icon>account_balance</mat-icon>
                  </span>
                  <span class="payment-stat-copy">
                    <span>Accounts</span>
                    <strong>{{ store.activePaymentAccounts().length }}</strong>
                  </span>
                </span>
                <span class="payment-stat-tag teal">
                  <span class="payment-stat-icon" aria-hidden="true">
                    <mat-icon>link</mat-icon>
                  </span>
                  <span class="payment-stat-copy">
                    <span>Mapped Modes</span>
                    <strong>{{ mappedPaymentModeCount() }}</strong>
                  </span>
                </span>
                <span class="payment-stat-tag orange">
                  <span class="payment-stat-icon" aria-hidden="true">
                    <mat-icon>receipt_long</mat-icon>
                  </span>
                  <span class="payment-stat-copy">
                    <span>Account Usage</span>
                    <strong>{{
                      paymentAccountUsageTotal() | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                    }}</strong>
                  </span>
                </span>
              </aside>

              <section class="payment-mode-layout">
                <section class="payment-list-panel" aria-label="Saved payment accounts">
                  <div class="mobile-payment-panel-actions">
                    <button
                      class="mobile-panel-add-button"
                      mat-icon-button
                      type="button"
                      aria-label="Add payment account"
                      matTooltip="Add payment account"
                      (click)="openPaymentAccountForm()"
                      [disabled]="!store.canWrite()"
                    >
                      <mat-icon aria-hidden="true">add</mat-icon>
                    </button>
                  </div>
                  <div class="payment-mode-grid">
                    @for (account of paymentAccountCards(); track account.id) {
                      <article
                        class="category-card payment-mode-card payment-account-card"
                        [class.selected]="isSelectedAccount(account.id)"
                        (click)="selectPaymentAccount(account.id)"
                      >
                        <header class="payment-account-header">
                          <button
                            class="account-card-trigger"
                            type="button"
                            [attr.aria-pressed]="isSelectedAccount(account.id)"
                            (click)="$event.stopPropagation(); selectPaymentAccount(account.id)"
                          >
                            <span
                              class="category-icon payment-provider-mark bank"
                              aria-hidden="true"
                            >
                              <img [ngSrc]="account.iconSrc" width="40" height="40" alt="" />
                            </span>
                            <span>
                              <span class="account-card-title">{{ account.displayName }}</span>
                              <span class="account-card-detail">
                                {{ account.detail }}
                              </span>
                            </span>
                          </button>
                          <div class="payment-card-actions">
                            <button
                              mat-icon-button
                              type="button"
                              aria-label="Edit payment account"
                              matTooltip="Edit payment account"
                              (click)="$event.stopPropagation(); openPaymentAccountForm(account)"
                              [disabled]="!store.canWrite()"
                            >
                              <mat-icon aria-hidden="true">edit</mat-icon>
                            </button>
                            <button
                              mat-icon-button
                              type="button"
                              aria-label="Archive payment account"
                              matTooltip="Archive payment account"
                              (click)="$event.stopPropagation(); archivePaymentAccount(account.id)"
                              [disabled]="
                                !store.canWrite() || !store.canArchivePaymentAccount(account.id)
                              "
                            >
                              <mat-icon aria-hidden="true">archive</mat-icon>
                            </button>
                          </div>
                        </header>

                        <div class="category-card-body">
                          <span>
                            Used
                            {{
                              account.usageAmount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                            }}
                          </span>
                          <span class="payment-card-badges">
                            <span class="badge neutral">
                              {{ account.mappedModeCount }}
                              {{ account.mappedModeCount === 1 ? 'mode' : 'modes' }}
                            </span>
                            <span class="badge neutral">{{ account.ownerTag }}</span>
                          </span>
                        </div>
                      </article>
                    } @empty {
                      <div class="empty-state">No payment accounts saved yet</div>
                    }
                  </div>

                  @if (selectedPaymentAccountCard(); as account) {
                    <article class="panel-card account-detail-panel">
                      <header class="panel-heading">
                        <h2>{{ account.displayName }}</h2>
                        <p>{{ account.detail }}</p>
                      </header>

                      <div class="mapped-mode-list" aria-label="Mapped payment modes">
                        @for (paymentMode of account.mappedModes; track paymentMode.id) {
                          @if (paymentModeUsage(paymentMode.id); as usage) {
                            <article class="mapped-mode-card">
                              <span
                                class="category-icon payment-provider-mark {{
                                  store.paymentModeTone(paymentMode.id)
                                }}"
                                aria-hidden="true"
                              >
                                <img
                                  [ngSrc]="store.paymentModeIconSrc(paymentMode)"
                                  width="34"
                                  height="34"
                                  alt=""
                                />
                              </span>
                              <div class="mapped-mode-copy">
                                <strong>{{ store.paymentModeDisplayLabel(paymentMode) }}</strong>
                                <small>
                                  {{ store.paymentModeTypeLabel(paymentMode.type) }} ·
                                  {{ store.paymentModeDetail(paymentMode) }}
                                </small>
                              </div>
                              <div class="mapped-mode-meta">
                                <span class="badge neutral">{{
                                  store.paymentModeOwnerTag(paymentMode)
                                }}</span>
                                <span class="badge neutral">
                                  {{ usage.count }}
                                  {{ usage.count === 1 ? 'record' : 'records' }}
                                </span>
                                <strong>{{
                                  usage.amount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN'
                                }}</strong>
                              </div>
                            </article>
                          }
                        } @empty {
                          <span class="empty-inline">No mapped payment modes</span>
                        }
                      </div>
                    </article>
                  }
                </section>

                <article class="panel-card payment-form-card">
                  <header class="panel-heading">
                    <h2>
                      {{
                        editingPaymentAccountId() ? 'Edit Payment Account' : 'Add Payment Account'
                      }}
                    </h2>
                    <p>Save the bank and last four digits for account-level totals.</p>
                  </header>

                  <form [formGroup]="accountForm" (ngSubmit)="savePaymentAccount()">
                    <mat-form-field appearance="outline">
                      <mat-label>Bank</mat-label>
                      <mat-select formControlName="bankName">
                        @for (bank of bankOptions; track bank.name) {
                          <mat-option [value]="bank.name">
                            <span class="select-option-with-icon">
                              <img [ngSrc]="bank.iconSrc" width="28" height="28" alt="" />
                              <span>{{ bank.name }}</span>
                            </span>
                          </mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Last 4 account digits</mat-label>
                      <input
                        matInput
                        formControlName="lastFour"
                        autocomplete="off"
                        inputmode="numeric"
                        maxlength="4"
                        pattern="[0-9]*"
                      />
                    </mat-form-field>

                    @if (accountValidationError()) {
                      <p class="form-error" role="alert">
                        <mat-icon aria-hidden="true">error_outline</mat-icon>
                        {{ accountValidationError() }}
                      </p>
                    }

                    <div class="form-actions">
                      @if (editingPaymentAccountId()) {
                        <button mat-stroked-button type="button" (click)="resetAccountForm()">
                          Cancel
                        </button>
                      }
                      <button mat-flat-button type="submit" [disabled]="!store.canWrite()">
                        <mat-icon aria-hidden="true">
                          {{ editingPaymentAccountId() ? 'save' : 'add' }}
                        </mat-icon>
                        {{ editingPaymentAccountId() ? 'Save Changes' : 'Save Account' }}
                      </button>
                    </div>
                  </form>
                </article>
              </section>
            </section>
          </mat-tab>
        </mat-tab-group>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      :host ::ng-deep .payment-tabs > .mat-mdc-tab-header {
        margin-bottom: 16px;
        border-bottom: 1px solid #d9e3f0;
      }

      :host ::ng-deep .payment-tabs .mat-mdc-tab-labels {
        gap: 18px;
      }

      :host ::ng-deep .payment-tabs .mat-mdc-tab {
        flex: 0 0 auto;
        min-width: 0;
        height: 48px;
        padding: 0 4px;
      }

      :host ::ng-deep .payment-tabs .mdc-tab__text-label {
        color: #60708a;
        font-weight: 750;
        letter-spacing: 0;
      }

      :host ::ng-deep .payment-tabs .mat-mdc-tab.mdc-tab--active .mdc-tab__text-label {
        color: #10213f;
      }

      :host
        ::ng-deep
        .payment-tabs.mat-primary
        .mat-mdc-tab-header
        .mdc-tab-indicator__content--underline {
        border-color: #2f80ed;
        border-width: 3px;
      }

      .payment-tab-panel {
        display: grid;
        gap: 16px;
      }

      .payment-mode-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 35%);
        gap: 18px;
        align-items: start;
      }

      .payment-form-card {
        min-width: 0;
      }

      .payment-form-card form {
        display: grid;
        gap: 16px;
      }

      .mode-button-grid,
      .payment-filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .mode-button-grid button,
      .payment-filter-row button {
        display: inline-flex;
        min-height: 42px;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        border: 1px solid #d9e3f0;
        border-radius: 8px;
        background: #fff;
        color: #34445b;
        font: inherit;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer;
      }

      .mode-button-grid button.active,
      .payment-filter-row button.active {
        border-color: #2f80ed;
        background: #eaf4ff;
        color: #135ab8;
      }

      .mode-button-grid mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }

      .form-error {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        color: #be123c;
        font-weight: 700;
      }

      .form-error mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }

      .select-option-with-icon {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .select-option-with-icon img {
        display: block;
        width: 28px;
        height: 28px;
        object-fit: contain;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .payment-stat-tags {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-start;
        gap: 12px;
        min-width: 0;
      }

      .payment-stat-tag {
        display: inline-grid;
        min-height: 52px;
        grid-template-columns: 34px auto;
        align-items: center;
        gap: 11px;
        padding: 8px 14px 8px 9px;
        border: 1px solid rgba(151, 164, 184, 0.28);
        border-radius: 8px;
        background: #fff;
        color: #34445b;
        box-shadow: 0 10px 22px rgba(43, 59, 85, 0.07);
      }

      .payment-stat-icon {
        display: inline-grid;
        width: 34px;
        height: 34px;
        place-items: center;
        border-radius: 8px;
      }

      .payment-stat-icon mat-icon {
        width: 19px;
        height: 19px;
        font-size: 19px;
      }

      .payment-stat-copy {
        display: grid;
        gap: 1px;
        min-width: 0;
      }

      .payment-stat-copy span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #60708a;
        font-size: 0.74rem;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .payment-stat-copy strong {
        color: #10213f;
        font-size: 1.18rem;
        font-weight: 800;
        line-height: 1;
      }

      .payment-stat-tag.blue {
        background: linear-gradient(180deg, #f7fbff 0%, #fff 100%);
        border-color: #cfe2ff;
      }

      .payment-stat-tag.teal {
        background: linear-gradient(180deg, #f3fffc 0%, #fff 100%);
        border-color: #bfebe5;
      }

      .payment-stat-tag.orange {
        background: linear-gradient(180deg, #fff9f1 0%, #fff 100%);
        border-color: #fed7aa;
      }

      .payment-stat-tag.blue .payment-stat-icon {
        background: #eaf4ff;
        color: #2563eb;
      }

      .payment-stat-tag.teal .payment-stat-icon {
        background: #dcfbf4;
        color: #0f766e;
      }

      .payment-stat-tag.orange .payment-stat-icon {
        background: #ffedd5;
        color: #c2410c;
      }

      .payment-list-panel {
        display: grid;
        gap: 16px;
        min-width: 0;
      }

      .mobile-payment-panel-actions {
        display: none;
        justify-content: flex-end;
      }

      .payment-mode-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }

      .payment-mode-card {
        position: relative;
        min-width: 0;
        overflow: hidden;
        border-color: rgba(151, 164, 184, 0.32);
        background: linear-gradient(135deg, #fff 0%, #f8fbff 100%);
      }

      .payment-mode-card header {
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: start;
      }

      .payment-mode-card header > div {
        min-width: 0;
      }

      .payment-mode-card h2,
      .payment-mode-card p {
        margin: 0;
      }

      .payment-mode-card h2 {
        color: #10213f;
        font-size: 1.05rem;
        font-weight: 800;
        line-height: 1.15;
      }

      .payment-mode-card p {
        margin-top: 4px;
        color: #60708a;
        font-size: 0.88rem;
        font-weight: 600;
      }

      .payment-mode-card.cash {
        border-color: #b7efd5;
        background: linear-gradient(135deg, #f0fdf7 0%, #ffffff 100%);
      }

      .payment-mode-card.upi {
        border-color: #c9dfff;
        background: linear-gradient(135deg, #f4f8ff 0%, #effdfa 100%);
      }

      .payment-mode-card.internet-banking,
      .payment-mode-card.bank,
      .payment-account-card {
        border-color: #bfdbfe;
        background: linear-gradient(135deg, #f8fbff 0%, #eff6ff 52%, #f7fee7 100%);
      }

      .payment-mode-card.credit-card {
        border-color: #fed7aa;
        background: linear-gradient(135deg, #fff7ed 0%, #fffdf8 45%, #eef6ff 100%);
      }

      .payment-mode-card.debit-card {
        border-color: #99f6e4;
        background: linear-gradient(135deg, #effdfa 0%, #f8fbff 48%, #f5f3ff 100%);
      }

      .payment-mode-card.credit-card,
      .payment-mode-card.debit-card {
        min-height: 184px;
        align-content: space-between;
      }

      .payment-mode-card.credit-card .payment-provider-mark,
      .payment-mode-card.debit-card .payment-provider-mark {
        border: 1px solid rgba(255, 255, 255, 0.78);
        background: rgba(255, 255, 255, 0.68);
        box-shadow: 0 10px 24px rgba(16, 33, 63, 0.1);
      }

      .payment-card-number {
        margin: 6px 0 4px;
        color: #10213f;
        font-size: 1.12rem;
        font-variant-numeric: tabular-nums;
        font-weight: 800;
        letter-spacing: 0;
        line-height: 1.2;
        white-space: nowrap;
      }

      .payment-card-badges {
        display: inline-flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .payment-account-chip {
        display: inline-flex;
        width: max-content;
        // max-width: min(100%, 158px);
        min-height: 24px;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 0 9px;
        border: 1px solid #cfe2ff;
        border-radius: 999px;
        background: #fff;
        color: #135ab8;
        font-size: 0.72rem;
        font-weight: 800;
        line-height: 1.1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .payment-account-chip img {
        flex: 0 0 auto;
        display: block;
        width: 16px;
        height: 16px;
        object-fit: contain;
      }

      .payment-provider-mark {
        background: #eef2f7;
        color: #34445b;
      }

      .payment-provider-mark img {
        display: block;
        width: 40px;
        height: 40px;
        object-fit: contain;
      }

      .payment-provider-mark.phonepe,
      .provider-chip.phonepe {
        background: #f0eaff;
        color: #5f259f;
      }

      .payment-provider-mark.applepay,
      .provider-chip.applepay {
        background: #f1f5f9;
        color: #111827;
      }

      .payment-provider-mark.gpay,
      .payment-provider-mark.googlepay,
      .provider-chip.gpay {
        background: #eaf4ff;
        color: #1558b0;
      }

      .provider-chip.googlepay {
        background: #eaf4ff;
        color: #1558b0;
      }

      .payment-provider-mark.paytm,
      .provider-chip.paytm {
        background: #e7fbff;
        color: #0a6ea8;
      }

      .payment-provider-mark.bhim,
      .provider-chip.bhim {
        background: #e9fbf4;
        color: #0f6b4f;
      }

      .payment-provider-mark.samsungpay,
      .provider-chip.samsungpay {
        background: #eef0ff;
        color: #1428a0;
      }

      .payment-provider-mark.cash,
      .provider-chip.cash {
        background: #e6fbf2;
        color: #047857;
      }

      .payment-provider-mark.bank,
      .provider-chip.bank {
        background: #edf6ff;
        color: #135ab8;
      }

      .payment-provider-mark.card,
      .payment-provider-mark.credit-card,
      .payment-provider-mark.debit-card {
        background: #fff5e8;
        color: #c2410c;
      }

      .payment-card-actions {
        display: flex;
        gap: 4px;
      }

      .payment-card-actions button {
        --mat-icon-button-state-layer-size: 36px;
        width: 36px;
        height: 36px;
        padding: 0;
        color: #40516a;
      }

      .payment-card-actions mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }

      .payment-mode-card.credit-card .payment-card-actions button,
      .payment-mode-card.debit-card .payment-card-actions button {
        border: 1px solid rgba(151, 164, 184, 0.24);
        background: rgba(255, 255, 255, 0.58);
      }

      .payment-account-card {
        cursor: pointer;
      }

      .payment-account-card .payment-card-actions,
      .payment-account-card .payment-card-actions button {
        cursor: default;
      }

      .payment-account-card.selected {
        border-color: #2f80ed;
        box-shadow: 0 18px 34px rgba(47, 128, 237, 0.14);
      }

      .payment-account-header {
        grid-template-columns: minmax(0, 1fr) auto !important;
      }

      .account-card-trigger {
        display: grid;
        min-width: 0;
        grid-template-columns: 48px minmax(0, 1fr);
        align-items: start;
        gap: 14px;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .account-card-trigger:focus-visible {
        outline: 3px solid rgba(47, 128, 237, 0.32);
        outline-offset: 3px;
        border-radius: 8px;
      }

      .account-card-title,
      .account-card-detail {
        display: block;
        min-width: 0;
      }

      .account-card-title {
        color: #10213f;
        font-size: 1.05rem;
        font-weight: 800;
        line-height: 1.15;
      }

      .account-card-detail {
        margin-top: 4px;
        color: #60708a;
        font-size: 0.88rem;
        font-weight: 600;
      }

      .account-detail-panel {
        display: grid;
        gap: 14px;
      }

      .mapped-mode-list {
        display: grid;
        gap: 10px;
      }

      .mapped-mode-card {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr);
        gap: 10px;
        padding: 10px;
        border: 1px solid #e3ebf6;
        border-radius: 8px;
        background: #f8fbff;
      }

      .mapped-mode-card .payment-provider-mark {
        width: 40px;
        height: 40px;
        border-radius: 10px;
      }

      .mapped-mode-copy {
        min-width: 0;
      }

      .mapped-mode-copy strong,
      .mapped-mode-copy small {
        display: block;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .mapped-mode-copy strong {
        color: #10213f;
        font-size: 0.98rem;
        font-weight: 800;
        line-height: 1.2;
      }

      .mapped-mode-copy small {
        margin-top: 3px;
        color: #60708a;
        font-size: 0.82rem;
        font-weight: 600;
      }

      .mapped-mode-meta {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }

      .mapped-mode-meta strong {
        color: #10213f;
        font-size: 0.95rem;
        font-weight: 800;
      }

      .empty-inline {
        color: #60708a;
        font-size: 0.9rem;
        font-weight: 700;
      }

      @media (max-width: 1180px) {
        .payment-mode-layout {
          grid-template-columns: minmax(0, 1fr) minmax(300px, 36%);
        }
      }

      @media (max-width: 780px) {
        .mobile-payment-modes-page {
          gap: 10px;
        }

        :host ::ng-deep .payment-tabs > .mat-mdc-tab-header {
          overflow-x: auto;
          margin-bottom: 10px;
          scrollbar-width: none;
        }

        :host ::ng-deep .payment-tabs > .mat-mdc-tab-header::-webkit-scrollbar {
          display: none;
        }

        .payment-mode-layout {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .payment-list-panel {
          gap: 8px;
        }

        .mobile-payment-panel-actions {
          display: flex;
        }

        .payment-form-card {
          display: none;
          padding: 14px;
        }

        .payment-stat-tags {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .payment-stat-tag {
          min-height: 56px;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 6px;
          padding: 8px;
          box-shadow: none;
        }

        .payment-stat-icon {
          width: 24px;
          height: 24px;
          border-radius: 7px;
        }

        .payment-stat-icon mat-icon {
          width: 16px;
          height: 16px;
          font-size: 16px;
        }

        .payment-stat-copy {
          gap: 0;
        }

        .payment-stat-copy span {
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
          font-size: 0.64rem;
          line-height: 1.05;
          text-transform: none;
        }

        .payment-stat-copy strong {
          font-size: 0.92rem;
        }

        .payment-mode-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .payment-mode-card {
          gap: 12px;
          padding: 14px;
        }

        .payment-card-number {
          font-size: 1rem;
        }

        .payment-filter-row {
          overflow-x: auto;
          flex-wrap: nowrap;
          padding-bottom: 2px;
          scrollbar-width: none;
        }

        .payment-filter-row::-webkit-scrollbar {
          display: none;
        }

        .payment-filter-row button {
          flex: 0 0 auto;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentModesPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  readonly store = inject(BudgetStore);
  readonly investments = inject(InvestmentStore);

  readonly modeOptions = MODE_OPTIONS;
  readonly providerOptions = PROVIDER_OPTIONS;
  readonly cardTypeOptions = CARD_TYPE_OPTIONS;
  readonly bankOptions = BANK_OPTIONS;
  readonly defaultCardIcon = DEFAULT_CARD_ICON;
  readonly filterOptions: Array<{ value: PaymentModeFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'credit-card', label: 'Credit Cards' },
    { value: 'debit-card', label: 'Debit Cards' },
    { value: 'internet-banking', label: 'Internet Banking' },
  ];
  readonly selectedTabIndex = signal(0);
  readonly selectedFilter = signal<PaymentModeFilter>('all');
  readonly selectedPaymentAccountId = signal('');
  readonly editingId = signal<string | null>(null);
  readonly editingPaymentAccountId = signal<string | null>(null);
  readonly formType = signal<PaymentModeType>('upi');
  readonly validationError = signal('');
  readonly accountValidationError = signal('');
  readonly form = this.formBuilder.group({
    type: this.formBuilder.nonNullable.control<PaymentModeType>('upi'),
    provider: this.formBuilder.nonNullable.control<PaymentModeProvider>(DEFAULT_PROVIDER),
    cardType: this.formBuilder.nonNullable.control<PaymentCardType | ''>(''),
    bankName: this.formBuilder.nonNullable.control<PaymentBankName>(DEFAULT_BANK_NAME),
    paymentAccountId: this.formBuilder.nonNullable.control(''),
    lastFour: this.formBuilder.nonNullable.control(''),
  });
  readonly accountForm = this.formBuilder.group({
    bankName: this.formBuilder.nonNullable.control<PaymentBankName>(DEFAULT_BANK_NAME),
    lastFour: this.formBuilder.nonNullable.control(''),
  });
  readonly filteredPaymentModes = computed(() => {
    const filter = this.selectedFilter();
    const rows = this.store.paymentModeCards().map((paymentMode) => {
      const usage = this.investments.paymentModeUsage(paymentMode.id);
      return {
        ...paymentMode,
        usageAmount: paymentMode.usageAmount + usage.amount,
        recordCount: paymentMode.recordCount + usage.count,
      };
    });

    return filter === 'all' ? rows : rows.filter((paymentMode) => paymentMode.type === filter);
  });
  readonly paymentAccountCards = computed(() =>
    this.store.paymentAccountCards().map((paymentAccount) => ({
      ...paymentAccount,
      usageAmount: paymentAccount.mappedModes.reduce(
        (total, paymentMode) => total + this.paymentModeUsage(paymentMode.id).amount,
        0,
      ),
    })),
  );
  readonly mappedPaymentModeCount = computed(
    () =>
      this.store.activePaymentModes().filter((paymentMode) => !!paymentMode.paymentAccountId)
        .length,
  );
  readonly paymentAccountUsageTotal = computed(() =>
    this.paymentAccountCards().reduce(
      (total, paymentAccount) => total + paymentAccount.usageAmount,
      0,
    ),
  );
  readonly selectedPaymentAccountCard = computed(() => {
    const selectedId = this.selectedPaymentAccountId();
    return selectedId
      ? (this.paymentAccountCards().find((paymentAccount) => paymentAccount.id === selectedId) ??
          null)
      : null;
  });
  readonly formSubtitle = computed(() =>
    this.isProviderType(this.formType())
      ? 'Choose the provider; the owner tag is added automatically.'
      : this.isCardType(this.formType())
        ? 'Save the bank, card type, and last four digits for quick identification.'
        : this.formType() === 'internet-banking'
          ? 'Link a payment account to identify the bank and account ending.'
          : 'Keep cash transactions available as a saved payment mode.',
  );

  constructor() {
    this.route?.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.selectedTabIndex.set(params.get('tab') === 'accounts' ? 1 : 0);
    });
  }

  paymentAccountOptions(): PaymentAccount[] {
    const existing = this.store
      .paymentModes()
      .find((paymentMode) => paymentMode.id === this.editingId());
    return this.store.paymentAccountsForPaymentMode(existing);
  }

  paymentModeUsage(paymentModeId: string): { amount: number; count: number } {
    const legacy = this.store.paymentModeUsage(paymentModeId);
    const current = this.investments.paymentModeUsage(paymentModeId);
    return { amount: legacy.amount + current.amount, count: legacy.count + current.count };
  }

  selectTab(index: number): void {
    this.selectedTabIndex.set(index);
    if (!this.router || !this.route) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index === 1 ? 'accounts' : 'modes' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setFormType(type: PaymentModeType): void {
    this.formType.set(type);
    this.form.controls.type.setValue(type);
    this.validationError.set('');

    if (this.isProviderType(type) && !this.form.controls.provider.value) {
      this.form.controls.provider.setValue(DEFAULT_PROVIDER);
    }

    if (!this.isAccountBackedType(type)) {
      this.form.controls.paymentAccountId.setValue('');
    }
  }

  startNewPaymentMode(): void {
    this.resetForm();
  }

  startNewPaymentAccount(): void {
    this.resetAccountForm();
  }

  openPrimaryForm(): void {
    if (this.selectedTabIndex() === 0) {
      this.openPaymentModeForm();
      return;
    }

    this.openPaymentAccountForm();
  }

  openMobilePaymentModeForm(paymentMode?: PaymentMode): void {
    this.bottomSheet.open(PaymentModeFormSheet, {
      data: { paymentMode },
      ariaLabel: paymentMode ? 'Edit payment mode' : 'Add payment mode',
      panelClass: 'payment-mode-form-sheet-panel',
      viewContainerRef: this.viewContainerRef,
    });
  }

  openMobilePaymentAccountForm(paymentAccount?: PaymentAccount): void {
    this.bottomSheet.open(PaymentAccountFormSheet, {
      data: { paymentAccount },
      ariaLabel: paymentAccount ? 'Edit payment account' : 'Add payment account',
      panelClass: 'payment-mode-form-sheet-panel',
      viewContainerRef: this.viewContainerRef,
    });
  }

  openPaymentModeForm(paymentMode?: PaymentMode): void {
    if (!this.breakpointObserver.isMatched('(max-width: 780px)')) {
      if (paymentMode) {
        this.editPaymentMode(paymentMode);
        return;
      }

      this.startNewPaymentMode();
      return;
    }

    this.openMobilePaymentModeForm(paymentMode);
  }

  openPaymentAccountForm(paymentAccount?: PaymentAccount): void {
    if (!this.breakpointObserver.isMatched('(max-width: 780px)')) {
      if (paymentAccount) {
        this.editPaymentAccount(paymentAccount);
        return;
      }

      this.startNewPaymentAccount();
      return;
    }

    this.openMobilePaymentAccountForm(paymentAccount);
  }

  editPaymentMode(paymentMode: PaymentMode): void {
    this.editingId.set(paymentMode.id);
    this.setFormType(paymentMode.type);
    this.form.patchValue({
      type: paymentMode.type,
      provider: paymentProviderValue(paymentMode.provider),
      cardType: paymentCardTypeValue(paymentMode.cardType),
      bankName: paymentBankNameValue(paymentMode.bankName),
      paymentAccountId: paymentMode.paymentAccountId ?? '',
      lastFour: paymentMode.lastFour ?? '',
    });
    this.validationError.set('');
  }

  editPaymentAccount(paymentAccount: PaymentAccount): void {
    this.editingPaymentAccountId.set(paymentAccount.id);
    this.accountForm.patchValue({
      bankName: paymentBankNameValue(paymentAccount.bankName),
      lastFour: paymentAccount.lastFour,
    });
    this.accountValidationError.set('');
  }

  archivePaymentMode(paymentModeId: string): void {
    void this.store.archivePaymentMode(paymentModeId);
    if (this.editingId() === paymentModeId) {
      this.resetForm();
    }
  }

  archivePaymentAccount(paymentAccountId: string): void {
    void this.store.archivePaymentAccount(paymentAccountId);
    if (this.editingPaymentAccountId() === paymentAccountId) {
      this.resetAccountForm();
    }
    if (this.selectedPaymentAccountId() === paymentAccountId) {
      this.selectedPaymentAccountId.set('');
    }
  }

  canArchivePaymentMode(paymentMode: PaymentMode): boolean {
    return paymentMode.id !== DEFAULT_CASH_PAYMENT_MODE_ID;
  }

  selectPaymentAccount(paymentAccountId: string): void {
    const paymentAccount = this.paymentAccountCards().find(
      (account) => account.id === paymentAccountId,
    );
    if (!paymentAccount) {
      return;
    }

    if (this.breakpointObserver.isMatched('(max-width: 780px)')) {
      this.openMappedPaymentModes(paymentAccount);
      return;
    }

    this.selectedPaymentAccountId.set(paymentAccountId);
  }

  isSelectedAccount(paymentAccountId: string): boolean {
    return this.selectedPaymentAccountCard()?.id === paymentAccountId;
  }

  savePaymentMode(): void {
    const existing = this.store
      .paymentModes()
      .find((paymentMode) => paymentMode.id === this.editingId());
    const paymentMode = buildPaymentModeFromForm(
      this.form.controls.type.value,
      this.form.controls.provider.value,
      this.form.controls.cardType.value,
      this.form.controls.bankName.value,
      this.form.controls.lastFour.value,
      this.form.controls.paymentAccountId.value,
      existing,
      this.editingId(),
    );

    if (!paymentMode.ok) {
      this.validationError.set(paymentMode.error);
      return;
    }

    void this.store.savePaymentMode(paymentMode.value).then((saved) => {
      if (saved) {
        this.resetForm(paymentMode.value.type);
      }
    });
  }

  savePaymentAccount(): void {
    const existing = this.store
      .paymentAccounts()
      .find((paymentAccount) => paymentAccount.id === this.editingPaymentAccountId());
    const paymentAccount = buildPaymentAccountFromForm(
      this.accountForm.controls.bankName.value,
      this.accountForm.controls.lastFour.value,
      existing,
      this.editingPaymentAccountId(),
    );

    if (!paymentAccount.ok) {
      this.accountValidationError.set(paymentAccount.error);
      return;
    }

    void this.store.savePaymentAccount(paymentAccount.value).then((saved) => {
      if (saved) {
        this.resetAccountForm();
      }
    });
  }

  private openMappedPaymentModes(
    paymentAccount: ReturnType<BudgetStore['paymentAccountCards']>[number],
  ): void {
    this.bottomSheet.open(PaymentAccountModesSheet, {
      ariaLabel: `${paymentAccount.displayName} mapped payment modes`,
      data: {
        detail: paymentAccount.detail,
        iconSrc: paymentAccount.iconSrc,
        mappedModes: paymentAccount.mappedModes,
        paymentAccount,
        usageAmount: paymentAccount.usageAmount,
      },
      panelClass: 'payment-mode-form-sheet-panel',
      viewContainerRef: this.viewContainerRef,
    });
  }

  resetForm(type: PaymentModeType = this.formType()): void {
    this.editingId.set(null);
    this.formType.set(type);
    this.validationError.set('');
    this.form.reset({
      type,
      provider: DEFAULT_PROVIDER,
      cardType: '',
      bankName: DEFAULT_BANK_NAME,
      paymentAccountId: '',
      lastFour: '',
    });
  }

  resetAccountForm(): void {
    this.editingPaymentAccountId.set(null);
    this.accountValidationError.set('');
    this.accountForm.reset({
      bankName: DEFAULT_BANK_NAME,
      lastFour: '',
    });
  }

  isProviderType(type: PaymentModeType): boolean {
    return isProviderType(type);
  }

  isCardType(type: PaymentModeType): boolean {
    return isCardType(type);
  }

  isAccountBackedType(type: PaymentModeType): boolean {
    return isAccountBackedType(type);
  }
}
