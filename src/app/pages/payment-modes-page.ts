import { CommonModule, NgOptimizedImage } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  ViewContainerRef,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { MatTooltipModule } from '@angular/material/tooltip';

import { BudgetStore } from '../budget.store';
import type {
  PaymentCardType,
  PaymentMode,
  PaymentModeProvider,
  PaymentModeType,
} from '../budget.models';
import { AppPageSkeletonComponent } from '../shared/page-skeleton';

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

const MODE_OPTIONS: PaymentModeOption[] = [
  { value: 'cash', label: 'Cash', icon: 'payments' },
  { value: 'upi', label: 'UPI', icon: 'qr_code_2' },
  { value: 'wallet', label: 'Wallet', icon: 'account_balance_wallet' },
  { value: 'credit-card', label: 'Credit Card', icon: 'credit_card' },
  { value: 'debit-card', label: 'Debit Card', icon: 'credit_card' },
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

const DEFAULT_PROVIDER: PaymentModeProvider = 'PhonePe';
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

        <mat-form-field appearance="outline">
          <mat-label>Display name</mat-label>
          <input matInput formControlName="name" autocomplete="off" />
        </mat-form-field>

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

  readonly modeOptions = MODE_OPTIONS;
  readonly providerOptions = PROVIDER_OPTIONS;
  readonly cardTypeOptions = CARD_TYPE_OPTIONS;
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
    name: this.formBuilder.nonNullable.control(this.data?.paymentMode?.name ?? ''),
    lastFour: this.formBuilder.nonNullable.control(this.data?.paymentMode?.lastFour ?? ''),
  });
  readonly formSubtitle = computed(() =>
    this.isProviderType(this.formType())
      ? 'Choose a provider and give it a label you will recognize later.'
      : this.isCardType(this.formType())
        ? 'Save the card name and last four digits for quick identification.'
        : 'Keep cash transactions available as a saved payment mode.',
  );

  setFormType(type: PaymentModeType): void {
    this.formType.set(type);
    this.form.controls.type.setValue(type);
    this.validationError.set('');

    if (this.isProviderType(type) && !this.form.controls.provider.value) {
      this.form.controls.provider.setValue(DEFAULT_PROVIDER);
    }
  }

  close(): void {
    this.bottomSheetRef.dismiss();
  }

  savePaymentMode(): void {
    const paymentMode = buildPaymentModeFromForm(
      this.form.controls.type.value,
      this.form.controls.name.value,
      this.form.controls.provider.value,
      this.form.controls.cardType.value,
      this.form.controls.lastFour.value,
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
    return type === 'upi' || type === 'wallet';
  }

  isCardType(type: PaymentModeType): boolean {
    return type === 'credit-card' || type === 'debit-card';
  }
}

function buildPaymentModeFromForm(
  type: PaymentModeType,
  rawName: string,
  provider: PaymentModeProvider,
  cardType: PaymentCardType | '',
  rawLastFour: string,
  existing: PaymentMode | undefined,
  editingId: string | null,
): { ok: true; value: PaymentMode } | { ok: false; error: string } {
  const name = rawName.trim();
  const lastFour = rawLastFour.replace(/\D/g, '').slice(0, 4);
  const selectedCardType = cardType || undefined;

  if (!name) {
    return { ok: false, error: 'Display name is required.' };
  }

  if ((type === 'upi' || type === 'wallet') && !provider) {
    return { ok: false, error: 'Choose a provider for UPI and wallet modes.' };
  }

  if ((type === 'credit-card' || type === 'debit-card') && !/^\d{4}$/.test(lastFour)) {
    return { ok: false, error: 'Card modes need exactly 4 digits.' };
  }

  const now = new Date().toISOString();

  return {
    ok: true,
    value: {
      id: existing?.id ?? editingId ?? id('payment-mode'),
      type,
      name,
      provider: type === 'upi' || type === 'wallet' ? provider : undefined,
      cardType: type === 'credit-card' || type === 'debit-card' ? selectedCardType : undefined,
      lastFour: type === 'credit-card' || type === 'debit-card' ? lastFour : undefined,
      createdDate: existing?.createdDate ?? now,
      updatedDate: now,
      archivedDate: existing?.archivedDate,
    },
  };
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
    MatTooltipModule,
    AppPageSkeletonComponent,
  ],
  template: `
    @if (store.showPageSkeleton()) {
      <app-page-skeleton variant="paymentModes" />
    } @else {
      <section class="page mobile-payment-modes-page">
        <header class="mobile-page-hero compact-hero">
          <div class="mobile-title-row">
            <h1>Payment Modes</h1>
            <button
              mat-flat-button
              type="button"
              (click)="openMobilePaymentModeForm()"
              [disabled]="!store.canWrite()"
            >
              <mat-icon aria-hidden="true">add_card</mat-icon>
              Add Mode
            </button>
          </div>
        </header>

        <header class="page-header desktop-page-header">
          <div>
            <h1>Payment Modes</h1>
            <p>
              Save the UPI, wallet, and card options you use across spending, investments, and EMIs.
            </p>
          </div>
        </header>

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
              <mat-icon>qr_code_2</mat-icon>
            </span>
            <span class="payment-stat-copy">
              <span>UPI & Wallets</span>
              <strong>{{ store.upiWalletPaymentModeCount() }}</strong>
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
                <article class="category-card payment-mode-card {{ paymentMode.type }}">
                  <header>
                    <span
                      class="category-icon payment-provider-mark {{ paymentMode.providerTone }}"
                      aria-hidden="true"
                    >
                      <img [ngSrc]="paymentMode.iconSrc" width="40" height="40" alt="" />
                    </span>
                    <div>
                      <h2>{{ paymentMode.name }}</h2>
                      <p>{{ paymentMode.typeLabel }} &middot; {{ paymentMode.detail }}</p>
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

                  <div class="category-card-body">
                    <span>
                      Used
                      {{ paymentMode.usageAmount | currency: 'INR' : 'symbol' : '1.0-0' : 'en-IN' }}
                    </span>
                    <span class="badge neutral">
                      {{ paymentMode.recordCount }}
                      {{ paymentMode.recordCount === 1 ? 'record' : 'records' }}
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

              <mat-form-field appearance="outline">
                <mat-label>Display name</mat-label>
                <input matInput formControlName="name" autocomplete="off" />
              </mat-form-field>

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

              @if (validationError()) {
                <p class="form-error" role="alert">
                  <mat-icon aria-hidden="true">error_outline</mat-icon>
                  {{ validationError() }}
                </p>
              }

              <div class="form-actions">
                @if (editingId()) {
                  <button mat-stroked-button type="button" (click)="resetForm()">Cancel</button>
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
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
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

      .payment-mode-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }

      .payment-mode-card {
        min-width: 0;
      }

      .payment-mode-card header {
        display: grid;
        grid-template-columns: 48px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: start;
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

      .payment-provider-mark {
        background: #eef2f7;
        color: #34445b;
      }

      .payment-provider-mark img {
        display: block;
        width: 40px;
        height: 40px;
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
        color: #1a73e8;
      }

      .provider-chip.googlepay {
        background: #eaf4ff;
        color: #1a73e8;
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

      @media (max-width: 1180px) {
        .payment-mode-layout {
          grid-template-columns: minmax(0, 1fr) minmax(300px, 36%);
        }
      }

      @media (max-width: 780px) {
        .mobile-payment-modes-page {
          gap: 10px;
        }

        .payment-mode-layout {
          grid-template-columns: 1fr;
          gap: 10px;
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
  readonly store = inject(BudgetStore);

  readonly modeOptions = MODE_OPTIONS;
  readonly providerOptions = PROVIDER_OPTIONS;
  readonly cardTypeOptions = CARD_TYPE_OPTIONS;
  readonly defaultCardIcon = DEFAULT_CARD_ICON;
  readonly filterOptions: Array<{ value: PaymentModeFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'wallet', label: 'Wallets' },
    { value: 'credit-card', label: 'Credit Cards' },
    { value: 'debit-card', label: 'Debit Cards' },
  ];
  readonly selectedFilter = signal<PaymentModeFilter>('all');
  readonly editingId = signal<string | null>(null);
  readonly formType = signal<PaymentModeType>('upi');
  readonly validationError = signal('');
  readonly form = this.formBuilder.group({
    type: this.formBuilder.nonNullable.control<PaymentModeType>('upi'),
    provider: this.formBuilder.nonNullable.control<PaymentModeProvider>(DEFAULT_PROVIDER),
    cardType: this.formBuilder.nonNullable.control<PaymentCardType | ''>(''),
    name: this.formBuilder.nonNullable.control(''),
    lastFour: this.formBuilder.nonNullable.control(''),
  });
  readonly filteredPaymentModes = computed(() => {
    const filter = this.selectedFilter();
    const rows = this.store.paymentModeCards();

    return filter === 'all' ? rows : rows.filter((paymentMode) => paymentMode.type === filter);
  });
  readonly formSubtitle = computed(() =>
    this.isProviderType(this.formType())
      ? 'Choose a provider and give it a label you will recognize later.'
      : this.isCardType(this.formType())
        ? 'Save the card name and last four digits for quick identification.'
        : 'Keep cash transactions available as a saved payment mode.',
  );

  setFormType(type: PaymentModeType): void {
    this.formType.set(type);
    this.form.controls.type.setValue(type);
    this.validationError.set('');

    if (this.isProviderType(type) && !this.form.controls.provider.value) {
      this.form.controls.provider.setValue(DEFAULT_PROVIDER);
    }
  }

  startNewPaymentMode(): void {
    this.resetForm();
  }

  openMobilePaymentModeForm(paymentMode?: PaymentMode): void {
    this.bottomSheet.open(PaymentModeFormSheet, {
      data: { paymentMode },
      ariaLabel: paymentMode ? 'Edit payment mode' : 'Add payment mode',
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

  editPaymentMode(paymentMode: PaymentMode): void {
    this.editingId.set(paymentMode.id);
    this.setFormType(paymentMode.type);
    this.form.patchValue({
      type: paymentMode.type,
      provider: paymentProviderValue(paymentMode.provider),
      cardType: paymentCardTypeValue(paymentMode.cardType),
      name: paymentMode.name,
      lastFour: paymentMode.lastFour ?? '',
    });
    this.validationError.set('');
  }

  archivePaymentMode(paymentModeId: string): void {
    void this.store.archivePaymentMode(paymentModeId);
    if (this.editingId() === paymentModeId) {
      this.resetForm();
    }
  }

  canArchivePaymentMode(paymentMode: PaymentMode): boolean {
    return paymentMode.id !== DEFAULT_CASH_PAYMENT_MODE_ID;
  }

  savePaymentMode(): void {
    const existing = this.store
      .paymentModes()
      .find((paymentMode) => paymentMode.id === this.editingId());
    const paymentMode = buildPaymentModeFromForm(
      this.form.controls.type.value,
      this.form.controls.name.value,
      this.form.controls.provider.value,
      this.form.controls.cardType.value,
      this.form.controls.lastFour.value,
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

  resetForm(type: PaymentModeType = this.formType()): void {
    this.editingId.set(null);
    this.formType.set(type);
    this.validationError.set('');
    this.form.reset({
      type,
      provider: DEFAULT_PROVIDER,
      cardType: '',
      name: '',
      lastFour: '',
    });
  }

  isProviderType(type: PaymentModeType): boolean {
    return type === 'upi' || type === 'wallet';
  }

  isCardType(type: PaymentModeType): boolean {
    return type === 'credit-card' || type === 'debit-card';
  }
}
