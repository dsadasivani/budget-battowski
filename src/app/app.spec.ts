import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { computed, signal } from '@angular/core';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import axe from 'axe-core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { BulkEditorDialog, type BulkEditorData } from './bulk-editor-dialog';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  type BudgetCategory,
  type PaymentAccount,
  type PaymentMode,
} from './budget.models';
import { BudgetStore } from './budget.store';
import { MonthlyReviewSourceConflictError } from './domain/errors';
import {
  buildProcessedImportCsv,
  createBudgetImportTemplateCsv,
  createBudgetImportTemplateWorkbook,
  parseBudgetImportCsv,
  parseBudgetImportFile,
} from './budget-import.service';
import {
  PaymentAccountFormSheet,
  PaymentAccountModesSheet,
  PaymentModeFormSheet,
  PaymentModesPage,
} from './pages/payment-modes-page';
import { WorkspaceFormDialog, type WorkspaceFormData } from './workspace-form-dialog';

function runAxe(element: Element): Promise<axe.AxeResults> {
  return new Promise((resolve, reject) => {
    axe.run(
      element,
      {
        resultTypes: ['violations'],
        rules: {
          'color-contrast': { enabled: false },
        },
      },
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      },
    );
  });
}

function paymentModeTypeLabel(type: PaymentMode['type']): string {
  const labels: Record<PaymentMode['type'], string> = {
    cash: 'Cash',
    upi: 'UPI',
    'credit-card': 'Credit Card',
    'debit-card': 'Debit Card',
    'internet-banking': 'Internet Banking',
  };

  return labels[type];
}

function paymentProviderTone(provider: PaymentMode['provider']): string {
  const tones: Record<NonNullable<PaymentMode['provider']>, string> = {
    PhonePe: 'phonepe',
    'Apple Pay': 'applepay',
    'Samsung Pay': 'samsungpay',
    'Google Pay': 'googlepay',
    Paytm: 'paytm',
    BHIM: 'bhim',
  };

  return provider ? tones[provider] : 'card';
}

function paymentModeIconSrc(paymentMode: PaymentMode): string {
  if (paymentMode.type === 'internet-banking') {
    return '/bank-icons/bank-building-icon.svg';
  }

  if (paymentMode.type === 'cash') {
    return '/payment-icons/cash.svg';
  }

  if (paymentMode.provider) {
    const icons: Record<NonNullable<PaymentMode['provider']>, string> = {
      PhonePe: '/payment-icons/phonepe.svg',
      'Apple Pay': '/payment-icons/apple-pay.svg',
      'Samsung Pay': '/payment-icons/samsung-pay.svg',
      'Google Pay': '/payment-icons/google-pay.svg',
      Paytm: '/payment-icons/paytm.svg',
      BHIM: '/payment-icons/bhim.svg',
    };

    return icons[paymentMode.provider];
  }

  if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
    return paymentMode.cardType
      ? `/payment-icons/cards_${paymentMode.cardType}.svg`
      : '/payment-icons/cards_default.svg';
  }

  return '/payment-icons/cards_default.svg';
}

function paymentAccountDetail(paymentAccount: Pick<PaymentAccount, 'lastFour'>): string {
  return `xxxx ${paymentAccount.lastFour}`;
}

function paymentAccountIconSrc(paymentAccount?: Pick<PaymentAccount, 'bankName'>): string {
  const icons: Partial<Record<PaymentAccount['bankName'], string>> = {
    HDFC: '/bank-icons/HDFC Bank Symbol SVG.svg',
    Axis: '/bank-icons/Axis Bank Symbol SVG.svg',
  };

  return paymentAccount
    ? (icons[paymentAccount.bankName] ?? '/bank-icons/bank-building-icon.svg')
    : '/bank-icons/bank-building-icon.svg';
}

function createPaymentModeStore(
  initialPaymentModes: PaymentMode[] = [],
  initialPaymentAccounts: PaymentAccount[] = [],
) {
  const paymentModes = signal(initialPaymentModes);
  const paymentAccounts = signal(initialPaymentAccounts);
  const activePaymentAccounts = computed(() =>
    paymentAccounts().filter((paymentAccount) => !paymentAccount.archivedDate),
  );
  const activePaymentModes = computed(() =>
    paymentModes().filter((paymentMode) => !paymentMode.archivedDate),
  );
  const memberTag = (memberEmail: string | undefined) => (memberEmail ? 'Test U' : 'Unassigned');
  const paymentModesForAccount = (paymentAccountId: string) =>
    activePaymentModes().filter((paymentMode) => paymentMode.paymentAccountId === paymentAccountId);
  const paymentAccountLabel = (paymentAccount: Pick<PaymentAccount, 'bankName'>) =>
    paymentAccount.bankName;
  const paymentModeDisplayLabel = (paymentMode: PaymentMode) => {
    const paymentAccount = paymentMode.paymentAccountId
      ? activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
      : undefined;

    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    if (paymentMode.type === 'upi') {
      return paymentMode.provider ?? paymentModeTypeLabel(paymentMode.type);
    }

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return paymentModeTypeLabel(paymentMode.type);
    }

    if (paymentMode.type === 'internet-banking') {
      return paymentAccount?.bankName ?? 'Internet Banking';
    }

    return paymentModeTypeLabel(paymentMode.type);
  };
  const paymentModeDetail = (paymentMode: PaymentMode) => {
    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return paymentMode.lastFour
        ? `xxxx xxxx xxxx ${paymentMode.lastFour}`
        : 'xxxx xxxx xxxx ----';
    }

    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    if (paymentMode.type === 'internet-banking') {
      const paymentAccount = paymentMode.paymentAccountId
        ? activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
        : undefined;
      return paymentAccount
        ? paymentAccountDetail(paymentAccount)
        : (paymentMode.bankName ?? 'Default');
    }

    return paymentMode.provider ?? paymentModeTypeLabel(paymentMode.type);
  };
  const paymentAccountsForPaymentMode = (paymentMode?: PaymentMode) => {
    const ownerEmail = paymentMode?.memberEmail ?? 'test@example.com';
    return activePaymentAccounts().filter(
      (account) =>
        account.memberEmail === ownerEmail || account.id === paymentMode?.paymentAccountId,
    );
  };
  const paymentModeShortLabel = (paymentMode: PaymentMode) => {
    const paymentAccount = paymentMode.paymentAccountId
      ? activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
      : undefined;
    const ownerTag = memberTag(paymentMode.memberEmail ?? paymentAccount?.memberEmail);

    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return `${ownerTag} ${paymentMode.lastFour ?? '----'}`;
    }

    if (paymentMode.type === 'internet-banking') {
      return `${ownerTag} ${paymentAccount?.lastFour ?? '----'}`;
    }

    return ownerTag;
  };
  const modeIconSrc = (paymentMode: PaymentMode) => {
    const paymentAccount = paymentMode.paymentAccountId
      ? activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
      : undefined;

    return paymentMode.type === 'internet-banking' && paymentAccount
      ? paymentAccountIconSrc(paymentAccount)
      : paymentModeIconSrc(paymentMode);
  };
  const paymentAccountUsage = (paymentAccountId: string) =>
    paymentModesForAccount(paymentAccountId).reduce(
      (total, paymentMode) => {
        const card = paymentModeCards().find((item) => item.id === paymentMode.id);
        return {
          amount: total.amount + (card?.usageAmount ?? 0),
          count: total.count + (card?.recordCount ?? 0),
        };
      },
      { amount: 0, count: 0 },
    );
  const paymentAccountCards = computed(() =>
    activePaymentAccounts().map((paymentAccount) => {
      const usage = paymentAccountUsage(paymentAccount.id);
      const mappedModes = paymentModesForAccount(paymentAccount.id);
      return {
        ...paymentAccount,
        detail: paymentAccountDetail(paymentAccount),
        displayName: paymentAccountLabel(paymentAccount),
        iconSrc: paymentAccountIconSrc(paymentAccount),
        ownerTag: memberTag(paymentAccount.memberEmail),
        mappedModeCount: mappedModes.length,
        mappedModes,
        recordCount: usage.count,
        usageAmount: usage.amount,
      };
    }),
  );
  const paymentModeCards = computed(() =>
    activePaymentModes().map((paymentMode) => ({
      ...paymentMode,
      detail: paymentModeDetail(paymentMode),
      displayName: paymentModeDisplayLabel(paymentMode),
      icon: paymentMode.type === 'upi' ? 'qr_code_2' : 'credit_card',
      iconSrc: modeIconSrc(paymentMode),
      bankIconSrc: paymentMode.paymentAccountId
        ? paymentAccountIconSrc(
            activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId),
          )
        : undefined,
      paymentAccountName:
        activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
          ?.bankName ?? '',
      paymentAccountDetail:
        paymentAccountDetail(
          activePaymentAccounts().find(
            (account) => account.id === paymentMode.paymentAccountId,
          ) ?? {
            lastFour: '',
          },
        ) ?? '',
      providerTone: paymentMode.provider
        ? paymentProviderTone(paymentMode.provider)
        : paymentMode.type === 'internet-banking'
          ? 'bank'
          : paymentMode.type,
      recordCount: 0,
      shortLabel: paymentModeShortLabel(paymentMode),
      ownerTag: memberTag(
        paymentMode.memberEmail ??
          activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
            ?.memberEmail,
      ),
      typeLabel: paymentModeTypeLabel(paymentMode.type),
      usageAmount: 0,
    })),
  );
  const savePaymentMode = vi.fn(async (paymentMode: PaymentMode) => {
    paymentModes.update((items) => [
      ...items.filter((item) => item.id !== paymentMode.id),
      paymentMode,
    ]);
    return true;
  });
  const archivePaymentMode = vi.fn(async (paymentModeId: string) => {
    paymentModes.update((items) =>
      items.map((item) =>
        item.id === paymentModeId ? { ...item, archivedDate: '2026-06-16T00:00:00.000Z' } : item,
      ),
    );
    return true;
  });
  const savePaymentAccount = vi.fn(async (paymentAccount: PaymentAccount) => {
    paymentAccounts.update((items) => [
      ...items.filter((item) => item.id !== paymentAccount.id),
      paymentAccount,
    ]);
    return true;
  });
  const archivePaymentAccount = vi.fn(async (paymentAccountId: string) => {
    paymentAccounts.update((items) =>
      items.map((item) =>
        item.id === paymentAccountId ? { ...item, archivedDate: '2026-06-16T00:00:00.000Z' } : item,
      ),
    );
    return true;
  });

  return {
    monthLabel: signal('June 2026'),
    moveMonth: vi.fn(),
    openMonthPicker: vi.fn(),
    closeMonthPicker: vi.fn(),
    monthPickerView: signal<'months' | 'years'>('months'),
    pickerYearRangeLabel: signal('2020 - 2035'),
    pickerYear: signal(2026),
    pickerYears: signal([2026]),
    showYearPicker: vi.fn(),
    shiftMonthPicker: vi.fn(),
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June'],
    selectedMonthParts: signal({ year: 2026, monthIndex: 5 }),
    selectPickerYear: vi.fn(),
    selectPickerMonth: vi.fn(),
    selectedMemberEmail: signal('ALL'),
    setSelectedMember: vi.fn(),
    activeMembers: signal([]),
    memberDisplayName: (member: { displayName: string }) => member.displayName,
    paymentAccounts,
    activePaymentAccounts,
    paymentAccountCards,
    paymentModes,
    activePaymentModes,
    paymentModeCards,
    upiPaymentModeCount: computed(
      () => activePaymentModes().filter((paymentMode) => paymentMode.type === 'upi').length,
    ),
    cardPaymentModeCount: computed(
      () =>
        activePaymentModes().filter(
          (paymentMode) => paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card',
        ).length,
    ),
    showPageSkeleton: signal(false),
    canWrite: signal(true),
    paymentAccountDetail,
    paymentAccountIconSrc,
    paymentAccountLabel,
    paymentAccountsForPaymentMode,
    paymentModeDisplayLabel,
    paymentModeDetail,
    paymentModeShortLabel,
    paymentModeTypeLabel,
    paymentModeOwnerTag: (paymentMode: PaymentMode) => {
      const paymentAccount = paymentMode.paymentAccountId
        ? activePaymentAccounts().find((account) => account.id === paymentMode.paymentAccountId)
        : undefined;
      return memberTag(paymentMode.memberEmail ?? paymentAccount?.memberEmail);
    },
    paymentModeUsage: (paymentModeId: string) => {
      const card = paymentModeCards().find((paymentMode) => paymentMode.id === paymentModeId);
      return { amount: card?.usageAmount ?? 0, count: card?.recordCount ?? 0 };
    },
    paymentModesForAccount,
    canArchivePaymentAccount: (paymentAccountId: string) =>
      paymentModesForAccount(paymentAccountId).length === 0,
    paymentModeIconSrc: modeIconSrc,
    paymentModeTone: (paymentModeId: string | undefined) =>
      activePaymentModes().find((paymentMode) => paymentMode.id === paymentModeId)?.provider
        ? 'googlepay'
        : activePaymentModes().find((paymentMode) => paymentMode.id === paymentModeId)?.type ===
            'internet-banking'
          ? 'bank'
          : 'card',
    savePaymentMode,
    archivePaymentMode,
    savePaymentAccount,
    archivePaymentAccount,
  };
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the budget dashboard title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Budget Battowski');
  });

  it("should default the month picker to today's month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      selectedMonth: () => string;
      pickerYear: () => number;
      openMonthPicker: () => void;
    };

    app.openMonthPicker();

    expect(app.selectedMonth()).toBe('2026-06');
    expect(app.pickerYear()).toBe(2026);
  });

  it('should jump directly to a selected month and ignore invalid month input', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      selectedMonth: () => string;
      setSelectedMonth: (month: string) => void;
    };

    app.setSelectedMonth('2027-11');
    expect(app.selectedMonth()).toBe('2027-11');

    app.setSelectedMonth('2027-13');
    expect(app.selectedMonth()).toBe('2027-11');
  });

  it('should expose exactly five primary mobile navigation items', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.primaryMobileNavItems.map((item) => item.shortLabel || item.label)).toEqual([
      'Home',
      'Expenses',
      'Plan',
      'Invest',
      'Loans',
    ]);
  });

  it('should render exactly five primary labels in the mobile bottom nav', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.mobile-bottom-nav a span'),
    ).map((item) => item.textContent?.trim());

    expect(labels).toEqual(['Home', 'Expenses', 'Plan', 'Invest', 'Loans']);
  });

  it('should expose the active navigation destination to assistive technology', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.side-nav a.active')?.getAttribute('aria-current')).toBe('page');
    expect(
      compiled.querySelector('.mobile-bottom-nav a.active')?.getAttribute('aria-current'),
    ).toBe('page');
  });

  it('should expose the selected member filter as a pressed button', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();

    const memberSegments = (fixture.nativeElement as HTMLElement).querySelector('.member-segments');
    const buttons = Array.from(memberSegments?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const allMembers = buttons.find((button) => button.textContent?.trim() === 'All Members');

    expect(allMembers?.getAttribute('aria-pressed')).toBe('true');
    expect(
      buttons
        .filter((button) => button !== allMembers)
        .every((button) => button.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
  });

  it('should close the guided tour when Escape is pressed', async () => {
    globalThis.localStorage?.setItem('budget-battowski-onboarding-v1', 'seen');
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    await router.navigateByUrl('/settings');
    fixture.detectChanges();
    await fixture.whenStable();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.guided-tour-button',
    );
    expect(trigger?.textContent).toContain('Start guided tour');
    trigger?.focus();
    trigger?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.onboarding-backdrop',
    );
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.onboarding-backdrop')).toBeNull();
  });

  it('should expose responsive navigation state and close it with Escape', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const store = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };
    const app = fixture.componentInstance;

    store.firebase.mode = 'local';
    store.isSessionChecking.set(false);
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const trigger = compiled.querySelector<HTMLButtonElement>('.mobile-menu-trigger');
    trigger?.focus();
    trigger?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const navigation = compiled.querySelector<HTMLElement>('#primary-navigation');
    expect(app.navOpen()).toBe(true);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');

    navigation?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(app.navOpen()).toBe(false);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('should render payment modes inside the mobile utility menu', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
      userPhoto: { set: (photo: string | null) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();
    app.userPhoto.set('https://example.com/profile.jpg');
    fixture.detectChanges();
    await fixture.whenStable();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.mobile-utility-trigger',
    );
    expect(trigger).toBeTruthy();
    expect(trigger?.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/profile.jpg',
    );

    trigger?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const menuText = document.body.textContent ?? '';
    expect(menuText).toContain('Payment Modes');
    expect(menuText).not.toContain('Guided tour');
    expect(menuText).toContain('Log out');
  });

  it('should keep the mobile profile trigger available across authenticated routes', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mobile-utility-trigger'),
    ).toBeTruthy();

    await router.navigateByUrl('/expenses');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mobile-utility-trigger'),
    ).toBeTruthy();
  });

  it.each([
    ['/dashboard', 'dashboard', 'Dashboard'],
    ['/expenses', 'credit_card', 'Monthly Expenses'],
    ['/planning', 'calendar_month', 'Planning'],
    ['/investments', 'trending_up', 'Investments'],
    ['/loans', 'account_balance', 'Loans'],
    ['/categories', 'sell', 'Categories'],
    ['/payment-modes', 'payments', 'Payment Modes'],
    ['/import-export', 'upload_file', 'Import & Export'],
    ['/workspace', 'group', 'Workspace Management'],
    ['/settings', 'settings', 'Settings'],
  ])('should render the branded mobile shell for %s', async (path, icon, label) => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    await router.navigateByUrl(path);
    fixture.detectChanges();
    await fixture.whenStable();

    const header = (fixture.nativeElement as HTMLElement).querySelector('.mobile-app-bar');
    const routeHeading = (fixture.nativeElement as HTMLElement).querySelector(
      '.mobile-route-heading',
    );

    expect(header?.querySelector('.mobile-brand')?.textContent?.trim()).toBe('Budget Battowski');
    expect(header?.querySelector('.mobile-menu-trigger mat-icon')?.textContent?.trim()).toBe(
      'apps',
    );
    expect(routeHeading?.querySelector('mat-icon')?.textContent?.trim()).toBe(icon);
    expect(routeHeading?.querySelector('h1')?.textContent?.trim()).toBe(label);
  });

  it('should keep secondary mobile destinations in the utility menu model', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app.utilityMobileNavItems.map((item) => item.label)).toEqual([
      'Income',
      'Categories',
      'Payment Modes',
      'Import & Export',
      'Workspace Management',
      'Settings',
    ]);
  });

  it('should keep the branded loader for explicit login transitions only', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
      loginLoaderActive: { set: (active: boolean) => void };
      showGlobalLoader: () => boolean;
      showPageSkeleton: () => boolean;
      workspaceId: { set: (workspaceId: string | null) => void };
    };

    app.firebase.mode = 'firebase';
    app.workspaceId.set(null);
    app.isSessionChecking.set(true);
    app.loginLoaderActive.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(app.showGlobalLoader()).toBe(false);
    expect(app.showPageSkeleton()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.global-loader-shell')).toBeNull();

    app.loginLoaderActive.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const loader = (fixture.nativeElement as HTMLElement).querySelector('.global-loader-shell');
    expect(app.showGlobalLoader()).toBe(true);
    expect(loader).not.toBeNull();
    expect(loader?.textContent).toContain('Preparing your private budget workspace.');
    expect(loader?.querySelector('.loader-skeleton-card')).toBeNull();
  });

  it('should stop showing page skeletons after workspace data loading completes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
      isWorkspaceDataLoading: { set: (loading: boolean) => void };
      loginLoaderActive: { set: (active: boolean) => void };
      showPageSkeleton: () => boolean;
      workspaceId: { set: (workspaceId: string | null) => void };
    };

    app.firebase.mode = 'firebase';
    app.workspaceId.set('workspace-1');
    app.isSessionChecking.set(false);
    app.loginLoaderActive.set(false);
    app.isWorkspaceDataLoading.set(true);

    expect(app.showPageSkeleton()).toBe(true);

    app.isWorkspaceDataLoading.set(false);

    expect(app.showPageSkeleton()).toBe(false);
  });

  it('should carry the latest monthly income into future months', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      incomes: { set: (records: unknown[]) => void };
      monthlyIncome: () => number;
      selectedMonth: { set: (month: string) => void };
    };

    app.incomes.set([
      {
        id: 'income-salary:2026-05',
        source: 'Salary',
        amount: 120000,
        cadence: 'monthly',
        notes: '',
        month: '2026-05',
      },
    ]);

    app.selectedMonth.set('2026-06');
    expect(app.monthlyIncome()).toBe(120000);
  });

  it('should treat legacy expenses without an explicit type as one-time entries', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      expenses: {
        set: (records: unknown[]) => void;
      };
      oneTimeTotal: () => number;
      selectedEntries: () => Array<{ id: string; name: string }>;
      selectedMonth: { set: (month: string) => void };
    };

    app.selectedMonth.set('2026-06');
    app.expenses.set([
      {
        id: 'expense-legacy',
        month: '2026-06',
        date: '2026-06-04',
        name: 'Groceries',
        categoryId: 'category-food',
        amount: 1200,
        note: '',
      },
    ]);

    expect(app.selectedEntries().map((expense) => expense.id)).toContain('expense-legacy');
    expect(app.oneTimeTotal()).toBe(1200);
  });

  it('should filter financial data by selected workspace member', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      expenses: { set: (records: unknown[]) => void };
      incomes: { set: (records: unknown[]) => void };
      monthlyIncome: () => number;
      outflowTotal: () => number;
      selectedEntries: () => Array<{ id: string }>;
      selectedMemberEmail: { set: (email: string) => void };
      selectedMonth: { set: (month: string) => void };
      workspaceId: { set: (id: string) => void };
      workspaces: { set: (records: unknown[]) => void };
    };

    app.workspaceId.set('workspace-members');
    app.workspaces.set([
      {
        id: 'workspace-members',
        name: 'Members',
        ownerUid: 'uid-a',
        memberUids: ['uid-a', 'uid-b', 'uid-c'],
        members: [
          { uid: 'uid-a', email: 'a@example.com', displayName: 'A', role: 'owner' },
          { uid: 'uid-b', email: 'b@example.com', displayName: 'B', role: 'editor' },
          { uid: 'uid-c', email: 'c@example.com', displayName: 'C', role: 'editor' },
        ],
      },
    ]);
    app.selectedMonth.set('2026-06');
    app.incomes.set([
      {
        id: 'income-a',
        source: 'A Salary',
        amount: 100000,
        cadence: 'monthly',
        notes: '',
        ownerUid: 'uid-a',
        memberEmail: 'a@example.com',
      },
      {
        id: 'income-b',
        source: 'B Salary',
        amount: 80000,
        cadence: 'monthly',
        notes: '',
        ownerUid: 'uid-b',
        memberEmail: 'b@example.com',
      },
      {
        id: 'income-c',
        source: 'C Salary',
        amount: 20000,
        cadence: 'monthly',
        notes: '',
        ownerUid: 'uid-c',
      },
    ]);
    app.expenses.set([
      {
        id: 'expense-a',
        month: '2026-06',
        date: '2026-06-01',
        name: 'A Rent',
        categoryId: 'category-home',
        amount: 30000,
        type: 'one-time',
        note: '',
        ownerUid: 'uid-a',
        memberEmail: 'a@example.com',
      },
      {
        id: 'expense-c',
        month: '2026-06',
        date: '2026-06-02',
        name: 'C Expense',
        categoryId: 'category-home',
        amount: 5000,
        type: 'one-time',
        note: '',
        ownerUid: 'uid-c',
      },
    ]);

    app.selectedMemberEmail.set('ALL');
    expect(app.monthlyIncome()).toBe(200000);
    expect(app.outflowTotal()).toBe(35000);

    app.selectedMemberEmail.set('a@example.com');
    expect(app.monthlyIncome()).toBe(100000);
    expect(app.selectedEntries().map((expense) => expense.id)).toEqual(['expense-a']);
    expect(app.outflowTotal()).toBe(30000);
  });

  it('should filter records by member UID after an email change', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      expenses: { set: (records: unknown[]) => void };
      selectedEntries: () => Array<{ id: string }>;
      selectedMemberEmail: { set: (email: string) => void };
      selectedMonth: { set: (month: string) => void };
      workspaceId: { set: (id: string) => void };
      workspaces: { set: (records: unknown[]) => void };
    };
    app.workspaceId.set('workspace-identity');
    app.workspaces.set([
      {
        id: 'workspace-identity',
        name: 'Identity',
        ownerUid: 'owner-uid',
        memberUids: ['owner-uid', 'member-uid'],
        members: [
          {
            uid: 'member-uid',
            email: 'new@example.com',
            displayName: 'Member',
            role: 'editor',
            createdDate: '2026-01-01',
          },
        ],
        createdDate: '2026-01-01',
        updatedDate: '2026-01-01',
      },
    ]);
    app.selectedMonth.set('2026-08');
    app.selectedMemberEmail.set('new@example.com');
    app.expenses.set([
      {
        id: 'uid-expense',
        name: 'UID expense',
        categoryId: 'food',
        amount: 100,
        month: '2026-08',
        type: 'one-time',
        note: '',
        ownerUid: 'member-uid',
        memberEmail: 'old@example.com',
      },
    ]);

    expect(app.selectedEntries().map((record) => record.id)).toEqual(['uid-expense']);
  });

  it('should administer a workspace exclusively by UID', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      canManageWorkspace: () => boolean;
      userEmail: { set: (email: string) => void };
      userUid: { set: (uid: string) => void };
      workspaceId: { set: (id: string) => void };
      workspaces: { set: (records: unknown[]) => void };
    };
    app.workspaceId.set('workspace-owner-identity');
    app.workspaces.set([
      {
        id: 'workspace-owner-identity',
        name: 'Identity',
        ownerUid: 'owner-uid',
        memberUids: ['owner-uid'],
        members: [],
        createdDate: '2026-01-01',
        updatedDate: '2026-01-01',
      },
    ]);
    app.userUid.set('owner-uid');
    app.userEmail.set('new@example.com');
    expect(app.canManageWorkspace()).toBe(true);

    app.userUid.set('wrong-uid');
    app.userEmail.set('old@example.com');
    expect(app.canManageWorkspace()).toBe(false);
  });

  it('should approve reviewed recurring expenses into the selected month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<{ sourceId: string; sourceType: string }>;
      expenses: {
        (): Array<{ amount: number; month: string; templateId?: string }>;
      };
      firebase: { mode: string };
      hasMonthlyReviewRows: () => boolean;
      selectedEntries: () => Array<{ amount: number; templateId?: string }>;
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-01-01',
      },
    ]);

    expect(app.hasMonthlyReviewRows()).toBe(true);

    await app.applyMonthlyReview({
      rows: [
        {
          id: 'expense:fixed-rent',
          sourceId: 'fixed-rent',
          sourceType: 'expense',
          label: 'Rent',
          categoryName: 'Home',
          amount: 26000,
          originalAmount: 25000,
          amountModified: true,
        },
      ],
    });

    expect(app.expenses()).toHaveLength(1);
    expect(app.selectedEntries()[0]).toMatchObject({
      amount: 26000,
      templateId: 'fixed-rent',
    });
    expect(app.buildMonthlyReviewRows('2026-06')).not.toContainEqual(
      expect.objectContaining({ sourceId: 'fixed-rent', sourceType: 'expense' }),
    );
    expect(app.hasMonthlyReviewRows()).toBe(false);
  });

  it('uses the latest recurring expense amount when the reviewer did not edit the row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<Record<string, unknown>>;
      expenses: { (): Array<{ amount: number; templateId?: string }> };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };
    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'concurrent-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 10000,
        type: 'recurring',
        startDate: '2026-01-01',
        version: 1,
      },
    ]);
    const [row] = app.buildMonthlyReviewRows('2026-06');

    app.templates.set([
      {
        id: 'concurrent-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 12000,
        type: 'recurring',
        startDate: '2026-01-01',
        version: 2,
      },
    ]);
    await app.applyMonthlyReview({ rows: [row] });

    expect(app.expenses().find((expense) => expense.templateId === 'concurrent-rent')?.amount).toBe(
      12000,
    );
  });

  it('preserves an explicit review override when the recurring expense source changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<Record<string, unknown>>;
      expenses: { (): Array<{ amount: number; templateId?: string }> };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };
    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'override-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 10000,
        type: 'recurring',
        startDate: '2026-01-01',
        version: 1,
      },
    ]);
    const [row] = app.buildMonthlyReviewRows('2026-06');
    app.templates.set([
      {
        id: 'override-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 12000,
        type: 'recurring',
        startDate: '2026-01-01',
        version: 2,
      },
    ]);

    await app.applyMonthlyReview({
      rows: [{ ...row, amount: 9500, amountModified: true }],
    });

    expect(app.expenses().find((expense) => expense.templateId === 'override-rent')?.amount).toBe(
      9500,
    );
  });

  it('fails safely when a recurring expense source is removed while review is open', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<Record<string, unknown>>;
      expenses: { (): unknown[] };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };
    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'deleted-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 10000,
        type: 'recurring',
        startDate: '2026-01-01',
        version: 1,
      },
    ]);
    const [row] = app.buildMonthlyReviewRows('2026-06');
    app.templates.set([]);

    await expect(app.applyMonthlyReview({ rows: [row] })).rejects.toBeInstanceOf(
      MonthlyReviewSourceConflictError,
    );
    expect(app.expenses()).toHaveLength(0);
  });

  it('applies the same latest-source and explicit-override semantics to investments', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<Record<string, unknown>>;
      firebase: { mode: string };
      investments: {
        (): Array<{ amount: number; sourceInvestmentId?: string }>;
        set: (records: unknown[]) => void;
      };
      selectedMonth: { set: (month: string) => void };
    };
    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.investments.set([
      {
        id: 'concurrent-sip',
        name: 'Index SIP',
        amount: 10000,
        frequency: 'monthly',
        startDate: '2026-01-01',
        notes: '',
        version: 1,
      },
    ]);
    const [unchangedRow] = app.buildMonthlyReviewRows('2026-06');
    app.investments.set([
      {
        id: 'concurrent-sip',
        name: 'Index SIP',
        amount: 12000,
        frequency: 'monthly',
        startDate: '2026-01-01',
        notes: '',
        version: 2,
      },
    ]);
    await app.applyMonthlyReview({ rows: [unchangedRow] });
    expect(
      app.investments().find((investment) => investment.sourceInvestmentId === 'concurrent-sip')
        ?.amount,
    ).toBe(12000);

    app.investments.set([
      {
        id: 'override-sip',
        name: 'Override SIP',
        amount: 10000,
        frequency: 'monthly',
        startDate: '2026-01-01',
        notes: '',
        version: 1,
      },
    ]);
    const [overrideRow] = app.buildMonthlyReviewRows('2026-06');
    app.investments.set([
      {
        id: 'override-sip',
        name: 'Override SIP',
        amount: 12000,
        frequency: 'monthly',
        startDate: '2026-01-01',
        notes: '',
        version: 2,
      },
    ]);
    await app.applyMonthlyReview({
      rows: [{ ...overrideRow, amount: 9500, amountModified: true }],
    });
    expect(
      app.investments().find((investment) => investment.sourceInvestmentId === 'override-sip')
        ?.amount,
    ).toBe(9500);
  });

  it('should preserve member ownership on generated recurring and loan expenses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildDefaultMonthEntries: (
        month: string,
      ) => Array<{ memberEmail?: string; paymentModeId?: string; templateId?: string }>;
      loans: { set: (records: unknown[]) => void };
      selectedMemberEmail: { set: (email: string) => void };
      templates: { set: (records: unknown[]) => void };
      workspaceId: { set: (id: string) => void };
      workspaces: { set: (records: unknown[]) => void };
    };

    app.workspaceId.set('workspace-owner');
    app.workspaces.set([
      {
        id: 'workspace-owner',
        name: 'Owner workspace',
        ownerUid: 'uid-a',
        memberUids: ['uid-a'],
        members: [{ uid: 'uid-a', email: 'a@example.com', displayName: 'A', role: 'owner' }],
      },
    ]);
    app.selectedMemberEmail.set('a@example.com');
    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-05-01',
        ownerUid: 'uid-a',
        memberEmail: 'a@example.com',
        paymentModeId: 'pm-gpay',
      },
    ]);
    app.loans.set([
      {
        id: 'loan-home',
        lender: 'Bank',
        loanType: 'Home',
        principal: 1000000,
        outstanding: 900000,
        annualRate: 8,
        emi: 30000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        notes: '',
        ownerUid: 'uid-a',
        memberEmail: 'a@example.com',
        paymentModeId: 'pm-card',
      },
    ]);

    expect(app.buildDefaultMonthEntries('2026-05')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateId: 'fixed-rent',
          memberEmail: 'a@example.com',
          paymentModeId: 'pm-gpay',
        }),
        expect.objectContaining({
          templateId: 'loan:loan-home',
          memberEmail: 'a@example.com',
          paymentModeId: 'pm-card',
        }),
      ]),
    );
  });

  it('should require current recurring investments to be reviewed before they count', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<{ sourceId: string; sourceType: string }>;
      firebase: { mode: string };
      investmentTotal: () => number;
      investmentPlans: () => Array<{ id: string; sourceInvestmentId?: string }>;
      investments: {
        set: (records: unknown[]) => void;
        (): Array<{
          id: string;
          frequency: string;
          paymentModeId?: string;
          sourceInvestmentId?: string;
        }>;
      };
      selectedMonth: { set: (month: string) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.investments.set([
      {
        id: 'sip-index',
        name: 'Index SIP',
        amount: 12000,
        categoryId: 'category-invest',
        frequency: 'monthly',
        startDate: '2026-01-01',
        notes: '',
        paymentModeId: 'pm-upi',
      },
    ]);

    expect(app.investmentTotal()).toBe(0);

    await app.applyMonthlyReview({
      rows: [
        {
          id: 'investment:sip-index',
          sourceId: 'sip-index',
          sourceType: 'investment',
          label: 'Index SIP',
          categoryName: 'Investments',
          amount: 15000,
          originalAmount: 12000,
          amountModified: true,
        },
      ],
    });

    expect(app.investmentTotal()).toBe(15000);
    expect(app.investments().some((record) => record.sourceInvestmentId === 'sip-index')).toBe(
      true,
    );
    expect(app.investments().find((record) => record.sourceInvestmentId === 'sip-index')).toEqual(
      expect.objectContaining({ paymentModeId: 'pm-upi' }),
    );
    expect(app.investmentPlans()).toEqual([
      expect.objectContaining({
        id: 'sip-index',
      }),
    ]);
    expect(app.buildMonthlyReviewRows('2026-06')).not.toContainEqual(
      expect.objectContaining({ sourceId: 'sip-index', sourceType: 'investment' }),
    );
  });

  it('should schedule quarterly investments only on due months', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildMonthlyReviewRows: (
        month: string,
      ) => Array<{ amount: number; sourceId: string; sourceType: string }>;
      firebase: { mode: string };
      investments: { set: (records: unknown[]) => void };
      selectedMonth: { set: (month: string) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.investments.set([
      {
        id: 'quarterly-fund',
        name: 'Quarterly Fund',
        amount: 9000,
        categoryId: 'category-invest',
        frequency: 'quarterly',
        startDate: '2026-01-15',
        notes: '',
      },
    ]);

    expect(app.buildMonthlyReviewRows('2026-06')).not.toContainEqual(
      expect.objectContaining({ sourceId: 'quarterly-fund' }),
    );
    expect(app.buildMonthlyReviewRows('2026-07')).toContainEqual(
      expect.objectContaining({
        amount: 9000,
        sourceId: 'quarterly-fund',
        sourceType: 'investment',
      }),
    );
  });

  it('should total weekly investment occurrences in the review month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildMonthlyReviewRows: (
        month: string,
      ) => Array<{ amount: number; sourceId: string; sourceType: string }>;
      firebase: { mode: string };
      investments: { set: (records: unknown[]) => void };
      selectedMonth: { set: (month: string) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.investments.set([
      {
        id: 'weekly-fund',
        name: 'Weekly Fund',
        amount: 500,
        categoryId: 'category-invest',
        frequency: 'weekly',
        startDate: '2026-06-03',
        notes: '',
      },
    ]);

    expect(app.buildMonthlyReviewRows('2026-06')).toContainEqual(
      expect.objectContaining({
        amount: 2000,
        sourceId: 'weekly-fund',
        sourceType: 'investment',
      }),
    );
  });

  it('should schedule quarterly recurring expenses only on due months', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildMonthlyReviewRows: (
        month: string,
      ) => Array<{ amount: number; sourceId: string; sourceType: string }>;
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'insurance',
        name: 'Insurance',
        categoryId: 'category-home',
        amount: 9000,
        type: 'recurring',
        frequency: 'quarterly',
        startDate: '2026-01-15',
      },
    ]);

    expect(app.buildMonthlyReviewRows('2026-06')).not.toContainEqual(
      expect.objectContaining({ sourceId: 'insurance' }),
    );
    expect(app.buildMonthlyReviewRows('2026-07')).toContainEqual(
      expect.objectContaining({
        amount: 9000,
        sourceId: 'insurance',
        sourceType: 'expense',
      }),
    );
  });

  it('should total weekly recurring expense occurrences in the review month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildMonthlyReviewRows: (
        month: string,
      ) => Array<{ amount: number; sourceId: string; sourceType: string }>;
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-06');
    app.templates.set([
      {
        id: 'cleaning',
        name: 'Cleaning',
        categoryId: 'category-home',
        amount: 500,
        type: 'recurring',
        frequency: 'weekly',
        startDate: '2026-06-03',
      },
    ]);

    expect(app.buildMonthlyReviewRows('2026-06')).toContainEqual(
      expect.objectContaining({
        amount: 2000,
        sourceId: 'cleaning',
        sourceType: 'expense',
      }),
    );
  });

  it('should ignore monthly review actions for past months', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      expenses: { (): unknown[] };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      syncStatus: () => string;
      templates: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-05');
    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-01-01',
      },
    ]);

    await app.applyMonthlyReview({
      rows: [
        {
          id: 'expense:fixed-rent',
          sourceId: 'fixed-rent',
          sourceType: 'expense',
          label: 'Rent',
          categoryName: 'Home',
          amount: 26000,
        },
      ],
    });

    expect(app.expenses()).toHaveLength(0);
    expect(app.syncStatus()).toContain('current and future months');
  });

  it('should require review for a future one-time investment and preserve its owner', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyMonthlyReview: (result: unknown) => Promise<void>;
      buildMonthlyReviewRows: (month: string) => Array<{
        sourceId: string;
        sourceType: string;
        memberName: string;
        amount: number;
      }>;
      firebase: { mode: string };
      investmentTotal: () => number;
      investments: {
        set: (records: unknown[]) => void;
        (): Array<{ sourceInvestmentId?: string; memberEmail?: string }>;
      };
      selectedMemberEmail: { set: (email: string) => void };
      selectedMonth: { set: (month: string) => void };
    };
    app.firebase.mode = 'local';
    app.selectedMemberEmail.set('ALL');
    app.selectedMonth.set('2026-08');
    app.investments.set([
      {
        id: 'investment-bonus',
        name: 'Bonus investment',
        amount: 50000,
        frequency: 'one-time',
        date: '2026-08-20',
        notes: '',
        memberEmail: 'owner@example.com',
        paymentModeId: 'pm-bank',
      },
    ]);

    const [row] = app.buildMonthlyReviewRows('2026-08');
    expect(row).toMatchObject({
      sourceId: 'investment-bonus',
      sourceType: 'investment',
      amount: 50000,
    });
    expect(app.investmentTotal()).toBe(0);

    await app.applyMonthlyReview({ rows: [{ ...row, pendingDelete: false }] });

    expect(app.investmentTotal()).toBe(50000);
    expect(
      app.investments().find((investment) => investment.sourceInvestmentId === 'investment-bonus'),
    ).toEqual(expect.objectContaining({ memberEmail: 'owner@example.com' }));
  });

  it('should build monthly review rows for the whole workspace regardless of member filter', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildMonthlyReviewRows: (month: string) => Array<{ sourceId: string }>;
      selectedMemberEmail: { set: (email: string) => void };
      templates: { set: (records: unknown[]) => void };
    };
    app.selectedMemberEmail.set('member-b@example.com');
    app.templates.set([
      {
        id: 'fixed-a',
        name: 'A rent',
        categoryId: 'category-home',
        amount: 10000,
        type: 'recurring',
        frequency: 'monthly',
        startDate: '2026-01-01',
        memberEmail: 'member-a@example.com',
      },
      {
        id: 'fixed-b',
        name: 'B rent',
        categoryId: 'category-home',
        amount: 12000,
        type: 'recurring',
        frequency: 'monthly',
        startDate: '2026-01-01',
        memberEmail: 'member-b@example.com',
      },
    ]);

    expect(app.buildMonthlyReviewRows('2026-08').map((row) => row.sourceId)).toEqual([
      'fixed-a',
      'fixed-b',
    ]);
  });

  it('should retain the prior category budget before an effective-dated change', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      categoryBudgetForMonth: (category: unknown, month: string) => number;
      normalizeCategoryBudget: (category: unknown, previous: unknown, month: string) => unknown;
    };
    const previous = {
      id: 'category-food',
      name: 'Food',
      monthlyBudget: 10000,
      color: '#047857',
      type: 'Expenses',
    };
    const updated = app.normalizeCategoryBudget(
      { ...previous, monthlyBudget: 15000 },
      previous,
      '2026-08',
    );

    expect(app.categoryBudgetForMonth(updated, '2026-07')).toBe(10000);
    expect(app.categoryBudgetForMonth(updated, '2026-08')).toBe(15000);
    expect(app.categoryBudgetForMonth(updated, '2027-01')).toBe(15000);
  });

  it('should version recurring parent updates from the selected month forward', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        amount: number;
        startDate?: string;
        effectiveStartDate?: string;
        auditTrail?: Array<{ amount: number; effectiveEndDate?: string }>;
      };
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
    };

    const next = app.normalizeMonthlyTemplate({ ...previous, amount: 30000 }, previous, '2022-07');

    expect(next.amount).toBe(30000);
    expect(next.startDate).toBe('2021-01-01');
    expect(next.effectiveStartDate).toBe('2022-07-01');
    expect(next.auditTrail?.at(-1)).toMatchObject({
      amount: 25000,
      effectiveEndDate: '2022-06-30',
    });
  });

  it('should keep the old recurring version until a future selected start date', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        startDate?: string;
        auditTrail?: Array<{ effectiveEndDate?: string }>;
      };
      templateVersionForMonth: (template: unknown, month: string) => { amount: number } | null;
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
    };

    const next = app.normalizeMonthlyTemplate(
      { ...previous, amount: 32000, startDate: '2022-09-01' },
      previous,
      '2022-07',
    );

    expect(next.startDate).toBe('2022-09-01');
    expect(next.auditTrail?.at(-1)?.effectiveEndDate).toBe('2022-08-31');
    expect(app.templateVersionForMonth(next, '2022-08')?.amount).toBe(25000);
    expect(app.templateVersionForMonth(next, '2022-09')?.amount).toBe(32000);
  });

  it('should keep recurring parent name and category immutable during updates', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        name: string;
        categoryId: string;
        amount: number;
      };
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
    };

    const next = app.normalizeMonthlyTemplate(
      { ...previous, name: 'Lease', categoryId: 'category-other', amount: 30000 },
      previous,
      '2022-07',
    );

    expect(next.name).toBe('Rent');
    expect(next.categoryId).toBe('category-home');
    expect(next.amount).toBe(30000);
  });

  it('should avoid duplicate recurring update audit rows', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      normalizeMonthlyTemplate: (
        next: unknown,
        previous: unknown,
        month: string,
      ) => {
        auditTrail?: Array<{ operation: string; effectiveEndDate?: string }>;
      };
    };
    const previous = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2021-01-01',
      auditTrail: [
        {
          id: 'audit-existing',
          operation: 'updated',
          recordedDate: '2022-07-01',
          effectiveStartDate: '2021-01-01',
          effectiveEndDate: '2022-06-30',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 25000,
          startDate: '2021-01-01',
        },
      ],
    };

    const next = app.normalizeMonthlyTemplate(
      { ...previous, amount: 30000, auditTrail: previous.auditTrail },
      previous,
      '2022-07',
    );

    expect(next.auditTrail).toHaveLength(1);
    expect(next.auditTrail?.[0].effectiveEndDate).toBe('2022-06-30');
  });

  it('should hard delete recurring parents and remove only future generated expenses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyBulkChanges: (result: unknown) => Promise<void>;
      categories: { set: (records: unknown[]) => void };
      expenses: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; month: string; templateId?: string; type: string }>;
      };
      firebase: { mode: string };
      selectedMonth: { set: (month: string) => void };
      templates: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string }>;
      };
    };
    const category = {
      id: 'category-home',
      name: 'Home',
      monthlyBudget: 35000,
      color: '#1f7a8c',
    };
    const template = {
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 25000,
      type: 'recurring',
      startDate: '2026-01-01',
    };

    app.selectedMonth.set('2026-01');
    app.firebase.mode = 'local';
    app.categories.set([category]);
    app.templates.set([template]);
    app.expenses.set([
      {
        id: 'expense-jun',
        month: '2026-06',
        date: '2026-06-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: '',
        templateId: 'fixed-rent',
      },
      {
        id: 'expense-jul',
        month: '2026-07',
        date: '2026-07-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: '',
        templateId: 'fixed-rent',
      },
    ]);

    await app.applyBulkChanges({
      scope: 'monthly',
      categories: [category],
      incomes: [],
      templates: [],
      expenses: [],
      investments: [],
      loans: [],
      deleted: {
        categories: [],
        incomes: [],
        templates: ['fixed-rent'],
        expenses: [],
        investments: [],
        loans: [],
      },
    });

    const juneExpense = app.expenses().find((expense) => expense.id === 'expense-jun');
    expect(app.templates().some((record) => record.id === 'fixed-rent')).toBe(false);
    expect(app.expenses().map((expense) => expense.id)).toContain('expense-jun');
    expect(app.expenses().map((expense) => expense.id)).not.toContain('expense-jul');
    expect(juneExpense).toMatchObject({ type: 'recurring' });
    expect(juneExpense?.templateId).toBeUndefined();
  });

  it('should close loan deletes on the operation date and remove only future EMI expenses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyBulkChanges: (result: unknown) => Promise<void>;
      expenses: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; month: string; templateId?: string }>;
      };
      firebase: { mode: string };
      loans: {
        set: (records: unknown[]) => void;
        (): Array<{
          id: string;
          endDate: string;
          auditTrail?: Array<{ operation: string; effectiveEndDate?: string }>;
        }>;
      };
    };
    const loan = {
      id: 'loan-home',
      lender: 'Bank',
      loanType: 'Home loan',
      principal: 4000000,
      outstanding: 3200000,
      annualRate: 8.7,
      emi: 38000,
      startDate: '2024-01-01',
      endDate: '2036-12-31',
      notes: '',
    };

    app.firebase.mode = 'local';
    app.loans.set([loan]);
    const expenses = [
      {
        id: 'emi-jun',
        month: '2026-06',
        date: '2026-06-01',
        name: 'Home loan EMI',
        categoryId: '',
        amount: 38000,
        type: 'recurring',
        note: '',
        templateId: 'loan:loan-home',
      },
      {
        id: 'emi-jul',
        month: '2026-07',
        date: '2026-07-01',
        name: 'Home loan EMI',
        categoryId: '',
        amount: 38000,
        type: 'recurring',
        note: '',
        templateId: 'loan:loan-home',
      },
    ];

    app.expenses.set(expenses);

    await app.applyBulkChanges({
      scope: 'loans',
      categories: [],
      incomes: [],
      templates: [],
      expenses,
      investments: [],
      loans: [],
      deleted: {
        categories: [],
        incomes: [],
        templates: [],
        expenses: [],
        investments: [],
        loans: ['loan-home'],
      },
    });

    expect(app.loans()[0].endDate).toBe('2026-06-10');
    expect(app.loans()[0].auditTrail?.at(-1)).toMatchObject({
      operation: 'deleted',
      effectiveEndDate: '2026-06-10',
    });
    expect(app.expenses().map((expense) => expense.id)).toContain('emi-jun');
    expect(app.expenses().map((expense) => expense.id)).not.toContain('emi-jul');
  });

  it('should preserve the selected loan start date during updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      applyBulkChanges: (result: unknown) => Promise<void>;
      firebase: { mode: string };
      loans: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; startDate: string; emi: number }>;
      };
    };
    const loan = {
      id: 'loan-car',
      lender: 'Bank',
      loanType: 'Car loan',
      principal: 800000,
      outstanding: 500000,
      annualRate: 9,
      emi: 18000,
      startDate: '2026-06-01',
      endDate: '2030-05-31',
      notes: '',
    };

    app.firebase.mode = 'local';
    app.loans.set([loan]);

    await app.applyBulkChanges({
      scope: 'loans',
      categories: [],
      incomes: [],
      templates: [],
      expenses: [],
      investments: [],
      loans: [{ ...loan, emi: 19000, startDate: '2025-01-01' }],
      deleted: {
        categories: [],
        incomes: [],
        templates: [],
        expenses: [],
        investments: [],
        loans: [],
      },
    });

    expect(app.loans()[0]).toMatchObject({ startDate: '2025-01-01', emi: 19000 });
  });

  it('should show generated loan EMI expenses with the special display category', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      categoryName: (categoryId: string) => string;
      buildDefaultMonthEntries: (month: string) => Array<{ categoryId: string; name: string }>;
      loans: { set: (records: unknown[]) => void };
    };

    app.loans.set([
      {
        id: 'loan-home',
        lender: 'Bank',
        loanType: 'Home loan',
        principal: 4000000,
        outstanding: 3200000,
        annualRate: 8.7,
        emi: 38000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        notes: '',
      },
    ]);

    const loanExpense = app
      .buildDefaultMonthEntries('2026-06')
      .find((expense) => expense.name.includes('Bank - Home loan'));

    expect(loanExpense).toBeTruthy();
    expect(loanExpense?.name).toBe('Bank - Home loan');
    expect(loanExpense?.categoryId).toBe('category-loan-emi');
    expect(app.categoryName(loanExpense?.categoryId ?? '')).toBe('Loan EMI');
  });

  it('should generate Loan V2 expenses from the engine schedule without snapshot fields', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildDefaultMonthEntries: (month: string) => Array<{
        amount: number;
        date?: string;
        sourceLoanId?: string;
      }>;
      loanAccounts: { set: (records: unknown[]) => void };
      loanEvents: { set: (records: unknown[]) => void };
      selectedMonth: { set: (month: string) => void };
    };
    app.selectedMonth.set('2026-06');
    app.loanAccounts.set([
      {
        id: 'loan-v2-home',
        schemaVersion: 2,
        lender: 'Bank',
        loanType: 'Home loan',
        contract: {
          disbursedAmount: 100000,
          disbursementDate: '2026-01-01',
          firstEmiDate: '2026-02-28',
          initialEmi: 8792,
          initialAnnualRate: 10,
          interestType: 'fixed',
          interestCalculationMethod: 'monthly-reducing',
          dayCountConvention: 'actual-365',
          compoundingFrequency: 'monthly',
          postPrepaymentStrategy: 'keep-emi-reduce-tenure',
          roundingPolicy: {
            monetaryScale: 2,
            interestRounding: 'half-up',
            installmentRounding: 'half-up',
            finalInstallmentAdjustment: true,
          },
        },
        notes: '',
      },
    ]);
    app.loanEvents.set([]);

    const expense = app
      .buildDefaultMonthEntries('2026-06')
      .find((entry) => entry.sourceLoanId === 'loan-v2-home');

    expect(expense).toMatchObject({ amount: 8792, date: '2026-06-28' });
  });

  it('should backfill paid EMI events and expenses when adding an existing loan', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      saveLoanAccount: (
        account: unknown,
        openingAnchor: undefined,
        assumeHistoricalEmisPaid: boolean,
      ) => Promise<boolean>;
      loanCalculation: (
        loanId: string,
        asOfDate: string,
      ) => { position: { outstandingPrincipal: number }; schedule: Array<{ status: string }> };
      loanEvents: () => Array<{ loanId: string; type: string; effectiveDate: string }>;
      expenses: () => Array<{ sourceLoanId?: string; date?: string; amount: number }>;
    };
    app.firebase.mode = 'demo';

    await expect(
      app.saveLoanAccount(
        {
          id: 'loan-existing-history',
          schemaVersion: 2,
          lender: 'Bank',
          loanType: 'Personal loan',
          contract: {
            disbursedAmount: 100000,
            disbursementDate: '2020-01-01',
            firstEmiDate: '2020-02-01',
            originalTenureMonths: 3,
            initialEmi: 34000,
            initialAnnualRate: 10,
            interestType: 'fixed',
            interestCalculationMethod: 'monthly-reducing',
            dayCountConvention: 'actual-365',
            compoundingFrequency: 'monthly',
            postPrepaymentStrategy: 'keep-emi-reduce-tenure',
            roundingPolicy: {
              monetaryScale: 2,
              interestRounding: 'half-up',
              installmentRounding: 'half-up',
              finalInstallmentAdjustment: true,
            },
          },
          notes: '',
        },
        undefined,
        true,
      ),
    ).resolves.toBe(true);

    const events = app.loanEvents().filter((event) => event.loanId === 'loan-existing-history');
    const expenses = app
      .expenses()
      .filter((expense) => expense.sourceLoanId === 'loan-existing-history');
    const calculation = app.loanCalculation('loan-existing-history', '2020-04-01');

    expect(events.map((event) => [event.type, event.effectiveDate])).toEqual([
      ['emi-payment', '2020-02-01'],
      ['emi-payment', '2020-03-01'],
      ['emi-payment', '2020-04-01'],
    ]);
    expect(expenses.map((expense) => expense.date)).toEqual([
      '2020-02-01',
      '2020-03-01',
      '2020-04-01',
    ]);
    expect(expenses.at(-1)?.amount).toBeLessThan(34000);
    expect(calculation.position.outstandingPrincipal).toBe(0);
    expect(calculation.schedule.every((row) => row.status === 'paid')).toBe(true);
  });

  it('should archive and permanently delete Loan V2 dependencies while retaining historical expenses', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      archiveLoanAccount: (loanId: string) => Promise<boolean>;
      permanentlyDeleteLoanAccount: (loanId: string) => Promise<boolean>;
      openWorkspaceConfirm: () => Promise<boolean>;
      firebase: { mode: string };
      expenses: { set: (records: unknown[]) => void; (): Array<{ id: string }> };
      loanAccounts: {
        set: (records: unknown[]) => void;
        (): Array<{ id: string; archivedDate?: string }>;
      };
      loanDocuments: { set: (records: unknown[]) => void; (): unknown[] };
      loanEvents: { set: (records: unknown[]) => void; (): unknown[] };
      loanReconciliations: { set: (records: unknown[]) => void; (): unknown[] };
    };
    app.openWorkspaceConfirm = vi.fn(async () => true);
    app.firebase.mode = 'demo';
    app.loanAccounts.set([
      {
        id: 'loan-delete',
        schemaVersion: 2,
        lender: 'Bank',
        loanType: 'Personal loan',
        contract: {
          disbursedAmount: 100000,
          disbursementDate: '2020-01-01',
          firstEmiDate: '2020-02-01',
          initialEmi: 8792,
          initialAnnualRate: 10,
          interestType: 'fixed',
          interestCalculationMethod: 'monthly-reducing',
          dayCountConvention: 'actual-365',
          compoundingFrequency: 'monthly',
          postPrepaymentStrategy: 'keep-emi-reduce-tenure',
          roundingPolicy: {
            monetaryScale: 2,
            interestRounding: 'half-up',
            installmentRounding: 'half-up',
            finalInstallmentAdjustment: true,
          },
        },
        notes: '',
      },
    ]);
    app.loanEvents.set([
      {
        id: 'event-delete',
        loanId: 'loan-delete',
        type: 'emi-payment',
        effectiveDate: '2020-02-01',
        amount: 8792,
        source: 'manual',
        createdDate: '2020-02-01T00:00:00.000Z',
      },
    ]);
    app.loanReconciliations.set([{ id: 'reconciliation-delete', loanId: 'loan-delete' }]);
    app.loanDocuments.set([{ id: 'document-delete', loanId: 'loan-delete' }]);
    app.expenses.set([
      {
        id: 'expense-historical',
        sourceLoanId: 'loan-delete',
        month: '2020-02',
        date: '2020-02-01',
      },
      {
        id: 'expense-future',
        sourceLoanId: 'loan-delete',
        month: '2099-02',
        date: '2099-02-01',
      },
    ]);

    await expect(app.archiveLoanAccount('loan-delete')).resolves.toBe(true);
    expect(app.loanAccounts()[0].archivedDate).toBeTruthy();
    expect(app.expenses().map((expense) => expense.id)).toEqual(['expense-historical']);

    await expect(app.permanentlyDeleteLoanAccount('loan-delete')).resolves.toBe(true);
    expect(app.loanAccounts()).toEqual([]);
    expect(app.loanEvents()).toEqual([]);
    expect(app.loanReconciliations()).toEqual([]);
    expect(app.loanDocuments()).toEqual([]);
    expect(app.expenses().map((expense) => expense.id)).toEqual(['expense-historical']);
  });

  it('should omit archived and deleted loan expenses from the dashboard', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      activeExpenseEntries: () => Array<{ id: string }>;
      activeOutflowTotal: () => number;
      activeRecurringEntries: () => Array<{ id: string }>;
      expenses: { set: (records: unknown[]) => void };
      firebase: { mode: string };
      loanAccounts: { set: (records: unknown[]) => void };
      loans: { set: (records: unknown[]) => void };
      selectedMonth: { set: (month: string) => void };
    };

    app.firebase.mode = 'local';
    app.selectedMonth.set('2026-08');
    app.loans.set([
      {
        id: 'loan-legacy-closed',
        lender: 'Closed Bank',
        loanType: 'Home loan',
        principal: 500000,
        outstanding: 0,
        annualRate: 8,
        emi: 12000,
        startDate: '2020-01-01',
        endDate: '2026-07-31',
        notes: '',
      },
    ]);
    app.loanAccounts.set([
      {
        id: 'loan-archived',
        schemaVersion: 2,
        lender: 'Archived Bank',
        loanType: 'Personal loan',
        archivedDate: '2026-08-10T00:00:00.000Z',
        contract: {
          disbursedAmount: 100000,
          disbursementDate: '2026-01-01',
          firstEmiDate: '2026-02-01',
          initialEmi: 8792,
          initialAnnualRate: 10,
          interestType: 'fixed',
          interestCalculationMethod: 'monthly-reducing',
          dayCountConvention: 'actual-365',
          compoundingFrequency: 'monthly',
          postPrepaymentStrategy: 'keep-emi-reduce-tenure',
          roundingPolicy: {
            monetaryScale: 2,
            interestRounding: 'half-up',
            installmentRounding: 'half-up',
            finalInstallmentAdjustment: true,
          },
        },
        notes: '',
      },
    ]);
    app.expenses.set([
      {
        id: 'expense-rent',
        month: '2026-08',
        date: '2026-08-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: '',
      },
      {
        id: 'expense-archived-loan',
        month: '2026-08',
        date: '2026-08-04',
        name: 'Archived Bank - Personal loan',
        categoryId: 'category-loan-emi',
        amount: 8792,
        type: 'recurring',
        note: '',
        sourceLoanId: 'loan-archived',
      },
      {
        id: 'expense-closed-legacy-loan',
        month: '2026-08',
        date: '2026-08-01',
        name: 'Closed Bank - Home loan',
        categoryId: 'category-loan-emi',
        amount: 12000,
        type: 'recurring',
        note: '',
        templateId: 'loan:loan-legacy-closed',
      },
      {
        id: 'expense-deleted-loan',
        month: '2026-08',
        date: '2026-08-01',
        name: 'Deleted Bank - Personal loan',
        categoryId: 'category-loan-emi',
        amount: 10000,
        type: 'recurring',
        note: '',
        sourceLoanId: 'loan-permanently-deleted',
      },
    ]);

    expect(app.activeExpenseEntries().map((expense) => expense.id)).toEqual(['expense-rent']);
    expect(app.activeRecurringEntries().map((expense) => expense.id)).toEqual(['expense-rent']);
    expect(app.activeOutflowTotal()).toBe(25000);
  });

  it('should provide editable zero-budget defaults without recreating archived categories', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      withDefaultCategories: (categories: BudgetCategory[]) => BudgetCategory[];
    };

    const defaults = app.withDefaultCategories([]);
    expect(
      DEFAULT_EXPENSE_CATEGORIES.every((defaultCategory) =>
        defaults.some(
          (category) =>
            category.id === defaultCategory.id &&
            category.monthlyBudget === 0 &&
            category.type === 'Expenses',
        ),
      ),
    ).toBe(true);

    const archived = {
      ...DEFAULT_EXPENSE_CATEGORIES[0],
      archivedDate: '2026-08-17T00:00:00.000Z',
    };
    const afterArchive = app.withDefaultCategories([archived]);
    expect(afterArchive.filter((category) => category.id === archived.id)).toEqual([archived]);
  });

  it('should clamp loan EMIs to the last valid day and restore the nominal day', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildDefaultMonthEntries: (month: string) => Array<{
        date?: string;
        templateId?: string;
      }>;
      loanCalendarDays: () => Array<{
        date: string;
        items: Array<{ id: string }>;
      }>;
      loans: { set: (records: unknown[]) => void };
      selectedMonth: { set: (month: string) => void };
    };
    app.loans.set([
      {
        id: 'loan-day-31',
        lender: 'Bank',
        loanType: 'Home loan',
        principal: 4000000,
        outstanding: 3200000,
        annualRate: 8.7,
        emi: 38000,
        startDate: '2026-01-31',
        endDate: '2028-12-31',
        notes: '',
      },
    ]);

    const occurrenceDate = (month: string) =>
      app
        .buildDefaultMonthEntries(month)
        .find((expense) => expense.templateId === 'loan:loan-day-31')?.date;

    expect(occurrenceDate('2026-02')).toBe('2026-02-28');
    expect(occurrenceDate('2028-02')).toBe('2028-02-29');
    expect(occurrenceDate('2026-04')).toBe('2026-04-30');
    expect(occurrenceDate('2026-05')).toBe('2026-05-31');

    app.selectedMonth.set('2026-04');
    expect(
      app
        .loanCalendarDays()
        .find((day) => day.date === '2026-04-30')
        ?.items.some((item) => item.id === 'loan-day-31'),
    ).toBe(true);
  });

  it('should not generate a clamped EMI after the exact loan end date', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildDefaultMonthEntries: (month: string) => Array<{ templateId?: string }>;
      loans: { set: (records: unknown[]) => void };
    };
    app.loans.set([
      {
        id: 'loan-ended-mid-month',
        lender: 'Bank',
        loanType: 'Vehicle loan',
        principal: 500000,
        outstanding: 300000,
        annualRate: 9,
        emi: 15000,
        startDate: '2026-01-31',
        endDate: '2026-02-15',
        notes: '',
      },
    ]);

    expect(
      app
        .buildDefaultMonthEntries('2026-02')
        .some((expense) => expense.templateId === 'loan:loan-ended-mid-month'),
    ).toBe(false);
  });

  it('should resolve payment mode labels including archived modes', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      activePaymentModes: () => PaymentMode[];
      paymentModeLabel: (paymentModeId: string | undefined) => string;
      paymentModeMeta: (
        paymentModeId: string | undefined,
      ) => { iconSrc: string; label: string } | null;
      paymentModes: { set: (records: PaymentMode[]) => void };
    };

    app.paymentModes.set([
      {
        id: 'pm-gpay',
        type: 'upi',
        provider: 'Google Pay',
        name: 'Personal Google Pay',
      },
      {
        id: 'pm-old-card',
        type: 'credit-card',
        name: 'Old card',
        lastFour: '1234',
        archivedDate: '2026-06-01T00:00:00.000Z',
      },
    ]);

    expect(app.paymentModeLabel('pm-old-card')).toBe('Credit Card');
    expect(app.paymentModeMeta('pm-old-card')).toEqual(
      expect.objectContaining({
        iconSrc: '/payment-icons/cards_default.svg',
        label: 'Unassigned 1234',
      }),
    );
    expect(app.paymentModeMeta('payment-mode-cash')).toEqual(
      expect.objectContaining({
        iconSrc: '/payment-icons/cash.svg',
        label: 'Cash',
      }),
    );
    expect(app.paymentModeLabel(undefined)).toBe('');
    expect(app.activePaymentModes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'payment-mode-cash' }),
        expect.objectContaining({ id: 'pm-gpay' }),
      ]),
    );
  });

  it('should preserve the selected bank while normalizing credit cards', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      normalizePaymentMode: (paymentMode: PaymentMode) => PaymentMode;
    };

    expect(
      app.normalizePaymentMode({
        id: 'pm-hdfc-card',
        type: 'credit-card',
        name: 'Credit Card',
        bankName: 'HDFC',
        cardType: 'visa',
        lastFour: '9876',
      }),
    ).toEqual(
      expect.objectContaining({
        bankName: 'HDFC',
        name: 'HDFC Credit Card',
        type: 'credit-card',
      }),
    );
  });

  it('should total selected-month payment mode usage across expenses investments and loan EMIs', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      expenses: { set: (records: unknown[]) => void };
      investments: { set: (records: unknown[]) => void };
      loans: { set: (records: unknown[]) => void };
      paymentModeCards: () => Array<{ id: string; recordCount: number; usageAmount: number }>;
      paymentModes: { set: (records: PaymentMode[]) => void };
      selectedMonth: { set: (month: string) => void };
    };

    app.selectedMonth.set('2026-06');
    app.paymentModes.set([
      { id: 'pm-gpay', type: 'upi', provider: 'Google Pay', name: 'Personal Google Pay' },
    ]);
    app.expenses.set([
      {
        id: 'expense-food',
        month: '2026-06',
        date: '2026-06-05',
        name: 'Food',
        categoryId: 'category-food',
        amount: 1000,
        type: 'one-time',
        note: '',
        paymentModeId: 'pm-gpay',
      },
    ]);
    app.investments.set([
      {
        id: 'investment-gold',
        name: 'Gold',
        amount: 2000,
        categoryId: 'category-invest',
        frequency: 'one-time',
        date: '2026-06-08',
        notes: '',
        paymentModeId: 'pm-gpay',
      },
    ]);
    app.loans.set([
      {
        id: 'loan-bike',
        lender: 'Bank',
        loanType: 'Bike',
        principal: 100000,
        outstanding: 90000,
        annualRate: 9,
        emi: 3000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        notes: '',
        paymentModeId: 'pm-gpay',
      },
    ]);

    expect(app.paymentModeCards().find((paymentMode) => paymentMode.id === 'pm-gpay')).toEqual(
      expect.objectContaining({ recordCount: 2, usageAmount: 3000 }),
    );
  });

  it('should total selected-month usage at payment account level', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      expenses: { set: (records: unknown[]) => void };
      paymentAccountCards: () => Array<{
        id: string;
        mappedModeCount: number;
        recordCount: number;
        usageAmount: number;
      }>;
      paymentAccounts: { set: (records: PaymentAccount[]) => void };
      paymentModeCards: () => Array<{ bankIconSrc?: string; id: string; iconSrc: string }>;
      paymentModes: { set: (records: PaymentMode[]) => void };
      selectedMonth: { set: (month: string) => void };
    };

    app.selectedMonth.set('2026-06');
    app.paymentAccounts.set([
      {
        id: 'pa-hdfc',
        name: 'Salary account',
        bankName: 'HDFC',
        lastFour: '4321',
      },
    ]);
    app.paymentModes.set([
      {
        id: 'pm-upi',
        type: 'upi',
        provider: 'Google Pay',
        name: 'GPay',
        paymentAccountId: 'pa-hdfc',
      },
      {
        id: 'pm-netbanking',
        type: 'internet-banking',
        name: 'HDFC NetBanking',
        bankName: 'HDFC',
        paymentAccountId: 'pa-hdfc',
      },
    ]);
    app.expenses.set([
      {
        id: 'expense-food',
        month: '2026-06',
        date: '2026-06-05',
        name: 'Food',
        categoryId: 'category-food',
        amount: 1000,
        type: 'one-time',
        note: '',
        paymentModeId: 'pm-upi',
      },
      {
        id: 'expense-tax',
        month: '2026-06',
        date: '2026-06-06',
        name: 'Tax',
        categoryId: 'category-tax',
        amount: 2500,
        type: 'one-time',
        note: '',
        paymentModeId: 'pm-netbanking',
      },
    ]);

    expect(app.paymentAccountCards().find((account) => account.id === 'pa-hdfc')).toEqual(
      expect.objectContaining({ mappedModeCount: 2, recordCount: 2, usageAmount: 3500 }),
    );
    expect(app.paymentModeCards().find((paymentMode) => paymentMode.id === 'pm-upi')).toEqual(
      expect.objectContaining({
        bankIconSrc: '/bank-icons/HDFC Bank Symbol SVG.svg',
        iconSrc: '/payment-icons/google-pay.svg',
      }),
    );
    expect(
      app.paymentModeCards().find((paymentMode) => paymentMode.id === 'pm-netbanking'),
    ).toEqual(
      expect.objectContaining({
        iconSrc: '/bank-icons/HDFC Bank Symbol SVG.svg',
      }),
    );
  });

  it('should ignore legacy credit-card account mappings', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      canArchivePaymentAccount: (paymentAccountId: string) => boolean;
      paymentAccountCards: () => Array<{ id: string; mappedModeCount: number }>;
      paymentAccounts: { set: (records: PaymentAccount[]) => void };
      paymentModeCards: () => Array<{ id: string; paymentAccountName: string }>;
      paymentModes: { set: (records: PaymentMode[]) => void };
    };

    app.paymentAccounts.set([
      {
        id: 'pa-legacy',
        name: 'Legacy account',
        bankName: 'HDFC',
        lastFour: '4321',
      },
    ]);
    app.paymentModes.set([
      {
        id: 'pm-credit',
        type: 'credit-card',
        name: 'Credit Card',
        lastFour: '9876',
        paymentAccountId: 'pa-legacy',
      },
    ]);

    expect(app.paymentAccountCards().find((account) => account.id === 'pa-legacy')).toEqual(
      expect.objectContaining({ mappedModeCount: 0 }),
    );
    expect(app.paymentModeCards().find((mode) => mode.id === 'pm-credit')).toEqual(
      expect.objectContaining({ paymentAccountName: '' }),
    );
    expect(app.canArchivePaymentAccount('pa-legacy')).toBe(true);
  });

  it('should block archiving payment accounts that still have active mapped modes', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      archivePaymentAccount: (paymentAccountId: string) => Promise<boolean>;
      canArchivePaymentAccount: (paymentAccountId: string) => boolean;
      paymentAccounts: { set: (records: PaymentAccount[]) => void };
      paymentModes: { set: (records: PaymentMode[]) => void };
    };

    app.paymentAccounts.set([
      {
        id: 'pa-axis',
        name: 'Bills account',
        bankName: 'Axis',
        lastFour: '9999',
      },
    ]);
    app.paymentModes.set([
      {
        id: 'pm-axis-upi',
        type: 'upi',
        provider: 'Google Pay',
        name: 'Bills UPI',
        paymentAccountId: 'pa-axis',
      },
    ]);

    expect(app.canArchivePaymentAccount('pa-axis')).toBe(false);
    await expect(app.archivePaymentAccount('pa-axis')).resolves.toBe(false);
  });

  it('should restore archived payment modes and accounts', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      activePaymentAccounts: () => PaymentAccount[];
      activePaymentModes: () => PaymentMode[];
      archivedPaymentAccounts: () => PaymentAccount[];
      archivedPaymentModes: () => PaymentMode[];
      firebase: { mode: string };
      paymentAccounts: { set: (records: PaymentAccount[]) => void };
      paymentModes: { set: (records: PaymentMode[]) => void };
      restorePaymentAccount: (paymentAccountId: string) => Promise<boolean>;
      restorePaymentMode: (paymentModeId: string) => Promise<boolean>;
    };

    app.firebase.mode = 'local';
    fixture.detectChanges();
    await fixture.whenStable();

    app.paymentModes.set([
      {
        id: 'pm-old-upi',
        type: 'upi',
        provider: 'Google Pay',
        name: 'Old UPI',
        ownerUid: 'owner-uid',
        memberEmail: 'owner@example.com',
        archivedDate: '2026-06-01T00:00:00.000Z',
      },
    ]);
    app.paymentAccounts.set([
      {
        id: 'pa-old',
        name: 'Old account',
        bankName: 'HDFC',
        lastFour: '4321',
        ownerUid: 'owner-uid',
        memberEmail: 'owner@example.com',
        archivedDate: '2026-06-01T00:00:00.000Z',
      },
    ]);

    expect(app.archivedPaymentModes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'pm-old-upi' })]),
    );
    expect(app.archivedPaymentAccounts()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'pa-old' })]),
    );

    await expect(app.restorePaymentMode('pm-old-upi')).resolves.toBe(true);
    await expect(app.restorePaymentAccount('pa-old')).resolves.toBe(true);

    expect(app.activePaymentModes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pm-old-upi', ownerUid: 'owner-uid' }),
      ]),
    );
    expect(app.activePaymentAccounts()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'pa-old', ownerUid: 'owner-uid' })]),
    );
    expect(app.archivedPaymentModes()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'pm-old-upi' })]),
    );
    expect(app.archivedPaymentAccounts()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'pa-old' })]),
    );
  });

  it('should preserve UID ownership while archiving an account-backed payment mode', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      activePaymentModes: () => PaymentMode[];
      archivePaymentMode: (paymentModeId: string) => Promise<boolean>;
      archivedPaymentModes: () => PaymentMode[];
      firebase: { mode: string };
      paymentAccounts: { set: (records: PaymentAccount[]) => void };
      paymentModes: { set: (records: PaymentMode[]) => void };
      restorePaymentMode: (paymentModeId: string) => Promise<boolean>;
    };

    app.firebase.mode = 'local';
    app.paymentAccounts.set([
      {
        id: 'pa-owner',
        name: 'Owner account',
        bankName: 'HDFC',
        lastFour: '4321',
        ownerUid: 'owner-uid',
        memberEmail: 'owner@example.com',
      },
    ]);
    app.paymentModes.set([
      {
        id: 'pm-owner-upi',
        type: 'upi',
        provider: 'BHIM',
        name: 'Owner UPI',
        paymentAccountId: 'pa-owner',
        ownerUid: 'owner-uid',
        memberEmail: 'owner@example.com',
      },
    ]);

    await expect(app.archivePaymentMode('pm-owner-upi')).resolves.toBe(true);
    expect(app.archivedPaymentModes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pm-owner-upi', ownerUid: 'owner-uid' }),
      ]),
    );

    await expect(app.restorePaymentMode('pm-owner-upi')).resolves.toBe(true);
    expect(app.activePaymentModes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pm-owner-upi', ownerUid: 'owner-uid' }),
      ]),
    );
  });

  it('should expose icon and label metadata for tagged financial rows', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      expenseRows: () => Array<{ paymentModeMeta?: { iconSrc: string; label: string } | null }>;
      expenses: { set: (records: unknown[]) => void };
      investments: { set: (records: unknown[]) => void };
      loans: { set: (records: unknown[]) => void };
      loanRepaymentRows: () => Array<{
        paymentModeMeta?: { iconSrc: string; label: string } | null;
      }>;
      paymentModes: { set: (records: PaymentMode[]) => void };
      portfolioRows: () => Array<{ paymentModeMeta?: { iconSrc: string; label: string } | null }>;
      selectedMonth: { set: (month: string) => void };
    };

    app.selectedMonth.set('2026-06');
    app.paymentModes.set([{ id: 'pm-paytm', type: 'upi', provider: 'Paytm', name: 'Paytm UPI' }]);
    app.expenses.set([
      {
        id: 'expense-food',
        month: '2026-06',
        date: '2026-06-05',
        name: 'Food',
        categoryId: 'category-food',
        amount: 1000,
        type: 'one-time',
        note: '',
        paymentModeId: 'pm-paytm',
      },
    ]);
    app.investments.set([
      {
        id: 'investment-sip',
        name: 'SIP',
        amount: 2000,
        categoryId: 'category-invest',
        frequency: 'monthly',
        startDate: '2026-01-01',
        notes: '',
        paymentModeId: 'pm-paytm',
      },
    ]);
    app.loans.set([
      {
        id: 'loan-bike',
        lender: 'Bank',
        loanType: 'Bike',
        principal: 100000,
        outstanding: 90000,
        annualRate: 9,
        emi: 3000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        notes: '',
        paymentModeId: 'pm-paytm',
      },
    ]);

    const expected = { iconSrc: '/payment-icons/paytm.svg', label: 'Unassigned' };
    expect(app.expenseRows()[0].paymentModeMeta).toEqual(expect.objectContaining(expected));
    expect(app.portfolioRows()[0].paymentModeMeta).toEqual(expect.objectContaining(expected));
    expect(app.loanRepaymentRows()[0].paymentModeMeta).toEqual(expect.objectContaining(expected));
  });

  it('should materialize past recurring expenses while current months wait for review', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      buildDefaultMonthEntries: (
        month: string,
      ) => Array<{ name: string; templateId?: string; type: string }>;
      templates: { set: (records: unknown[]) => void };
    };

    app.templates.set([
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        startDate: '2026-05-01',
      },
    ]);

    expect(app.buildDefaultMonthEntries('2026-05')).toContainEqual(
      expect.objectContaining({
        name: 'Rent',
        templateId: 'fixed-rent',
        type: 'recurring',
      }),
    );
    expect(
      app
        .buildDefaultMonthEntries('2026-06')
        .some((expense) => expense.templateId === 'fixed-rent'),
    ).toBe(false);
  });
});

describe('PaymentModesPage', () => {
  let store: ReturnType<typeof createPaymentModeStore>;
  let bottomSheetOpen: ReturnType<typeof vi.fn>;
  let breakpointObserver: {
    isMatched: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    store = createPaymentModeStore();
    bottomSheetOpen = vi.fn();
    breakpointObserver = {
      isMatched: vi.fn(() => false),
      observe: vi.fn(() => of({ matches: false, breakpoints: {} })),
    };
    await TestBed.configureTestingModule({
      imports: [PaymentModesPage],
      providers: [
        { provide: BudgetStore, useValue: store },
        { provide: BreakpointObserver, useValue: breakpointObserver },
      ],
    })
      .overrideProvider(MatBottomSheet, { useValue: { open: bottomSheetOpen } })
      .compileComponents();
  });

  it('should save UPI providers with a derived name', async () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.form.patchValue({ provider: 'Google Pay' });
    page.savePaymentMode();
    await Promise.resolve();

    expect(page.validationError()).toBe('');
    expect(store.savePaymentMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'upi',
        name: 'UPI',
        provider: 'Google Pay',
        lastFour: undefined,
      }),
    );
  });

  it('should require card last four digits before saving card modes', async () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.setFormType('credit-card');
    page.form.patchValue({ lastFour: '12' });
    page.savePaymentMode();

    expect(page.validationError()).toBe('Card modes need exactly 4 digits.');

    page.form.patchValue({ bankName: 'HDFC', cardType: 'visa', lastFour: '9876' });
    page.savePaymentMode();
    await Promise.resolve();

    expect(store.savePaymentMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'credit-card',
        name: 'Credit Card',
        provider: undefined,
        bankName: 'HDFC',
        cardType: 'visa',
        lastFour: '9876',
        paymentAccountId: undefined,
      }),
    );
  });

  it('should not offer or retain account mapping for credit cards', async () => {
    const existing: PaymentMode = {
      id: 'pm-credit',
      type: 'credit-card',
      name: 'Credit Card',
      cardType: 'visa',
      lastFour: '9876',
      paymentAccountId: 'legacy-account',
    };
    store.paymentModes.set([existing]);
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;

    page.editPaymentMode(existing);
    fixture.detectChanges();

    expect(page.isAccountBackedType('credit-card')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Payment account');

    page.savePaymentMode();
    await Promise.resolve();

    expect(store.savePaymentMode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pm-credit',
        type: 'credit-card',
        paymentAccountId: undefined,
      }),
    );
  });

  it('should require and save internet banking modes with mapped account data', async () => {
    store.paymentAccounts.set([
      {
        id: 'pa-hdfc',
        name: 'Salary account',
        bankName: 'HDFC',
        lastFour: '4321',
      },
    ]);
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.setFormType('internet-banking');
    page.savePaymentMode();

    expect(page.validationError()).toBe('Choose a linked payment account for internet banking.');

    page.form.patchValue({ paymentAccountId: 'pa-hdfc' });
    page.savePaymentMode();
    await Promise.resolve();

    expect(store.savePaymentMode).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'internet-banking',
        name: 'Internet Banking',
        bankName: undefined,
        paymentAccountId: 'pa-hdfc',
        provider: undefined,
      }),
    );
  });

  it('should render the payment accounts tab and save account records', async () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.selectedTabIndex.set(1);
    page.savePaymentAccount();

    expect(page.accountValidationError()).toBe('Account needs exactly 4 digits.');
    expect(store.savePaymentAccount).not.toHaveBeenCalled();

    page.accountForm.patchValue({
      bankName: 'HDFC',
      lastFour: '4321',
    });
    page.savePaymentAccount();
    await Promise.resolve();
    fixture.detectChanges();

    expect(store.savePaymentAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bank account',
        bankName: 'HDFC',
        lastFour: '4321',
      }),
    );
  });

  it('should hide mapped payment modes until an account is selected on desktop', () => {
    store.paymentAccounts.set([
      {
        id: 'pa-hdfc',
        name: 'Salary account',
        bankName: 'HDFC',
        lastFour: '4321',
      },
    ]);
    store.paymentModes.set([
      {
        id: 'pm-upi',
        type: 'upi',
        provider: 'Google Pay',
        name: 'GPay',
        paymentAccountId: 'pa-hdfc',
      },
    ]);
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    page.selectedTabIndex.set(1);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(page.selectedPaymentAccountCard()).toBeNull();
    expect(element.querySelector('.account-detail-panel')).toBeNull();

    page.selectPaymentAccount('pa-hdfc');
    fixture.detectChanges();

    expect(page.selectedPaymentAccountCard()).toEqual(expect.objectContaining({ id: 'pa-hdfc' }));
    expect(element.querySelector('.account-detail-panel')?.textContent ?? '').toContain(
      'Google Pay',
    );
  });

  it('should show mapped payment modes in a bottom sheet on mobile account clicks', () => {
    breakpointObserver.isMatched.mockReturnValue(true);
    store.paymentAccounts.set([
      {
        id: 'pa-hdfc',
        name: 'Salary account',
        bankName: 'HDFC',
        lastFour: '4321',
      },
    ]);
    store.paymentModes.set([
      {
        id: 'pm-upi',
        type: 'upi',
        provider: 'Google Pay',
        name: 'GPay',
        paymentAccountId: 'pa-hdfc',
      },
    ]);
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    page.selectedTabIndex.set(1);
    fixture.detectChanges();

    const cardBody = (fixture.nativeElement as HTMLElement).querySelector(
      '.payment-account-card .category-card-body',
    ) as HTMLElement;
    cardBody.click();

    expect(page.selectedPaymentAccountCard()).toBeNull();
    expect(bottomSheetOpen).toHaveBeenCalledWith(
      PaymentAccountModesSheet,
      expect.objectContaining({
        ariaLabel: 'HDFC mapped payment modes',
        data: expect.objectContaining({
          mappedModes: [expect.objectContaining({ id: 'pm-upi' })],
          paymentAccount: expect.objectContaining({ id: 'pa-hdfc' }),
        }),
      }),
    );
  });

  it('should render card modes with masked virtual card numbers', () => {
    store.paymentModes.set([
      {
        id: 'pm-card',
        type: 'credit-card',
        name: 'Visa Credit',
        cardType: 'visa',
        lastFour: '9002',
      },
    ]);
    const fixture = TestBed.createComponent(PaymentModesPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('xxxx xxxx xxxx 9002');
    expect(text).not.toContain('ending 9002');
  });

  it('should update and archive existing payment modes', async () => {
    const existing: PaymentMode = {
      id: 'pm-card',
      type: 'debit-card',
      name: 'Old debit',
      lastFour: '1111',
    };
    store.paymentModes.set([existing]);
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.editPaymentMode(existing);
    page.form.patchValue({ lastFour: '2222' });
    page.savePaymentMode();
    await Promise.resolve();
    page.archivePaymentMode('pm-card');

    expect(store.savePaymentMode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pm-card',
        name: 'Old debit',
        lastFour: '2222',
      }),
    );
    expect(store.archivePaymentMode).toHaveBeenCalledWith('pm-card');
  });

  it('should open a bottom sheet for adding payment modes on mobile', () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.openMobilePaymentModeForm();

    expect(bottomSheetOpen).toHaveBeenCalledWith(
      PaymentModeFormSheet,
      expect.objectContaining({
        data: { paymentMode: undefined },
        ariaLabel: 'Add payment mode',
        viewContainerRef: expect.anything(),
      }),
    );
  });

  it('should open a bottom sheet with existing payment mode data for mobile edits', () => {
    const existing: PaymentMode = {
      id: 'pm-gpay',
      type: 'upi',
      provider: 'Google Pay',
      name: 'Personal Google Pay',
    };
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.openMobilePaymentModeForm(existing);

    expect(bottomSheetOpen).toHaveBeenCalledWith(
      PaymentModeFormSheet,
      expect.objectContaining({
        data: { paymentMode: existing },
        ariaLabel: 'Edit payment mode',
        viewContainerRef: expect.anything(),
      }),
    );
  });

  it('should open a bottom sheet for adding payment accounts on mobile', () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.openMobilePaymentAccountForm();

    expect(bottomSheetOpen).toHaveBeenCalledWith(
      PaymentAccountFormSheet,
      expect.objectContaining({
        data: { paymentAccount: undefined },
        ariaLabel: 'Add payment account',
        viewContainerRef: expect.anything(),
      }),
    );
  });

  it('should keep the inline form for payment modes on desktop', () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    page.openPaymentModeForm();

    expect(bottomSheetOpen).not.toHaveBeenCalled();
    expect(page.editingId()).toBeNull();
  });

  it('should not offer wallet as a payment mode', () => {
    const fixture = TestBed.createComponent(PaymentModesPage);
    const page = fixture.componentInstance;

    expect(page.modeOptions.map((option) => option.value)).not.toContain('wallet');
    expect(page.filterOptions.map((option) => option.value)).not.toContain('wallet');
  });
});

describe('WorkspaceFormDialog', () => {
  const dialogClose = vi.fn();
  const data: WorkspaceFormData = {
    mode: 'create',
    ownerProfile: {
      uid: 'owner-uid',
      email: 'owner@example.com',
      displayName: 'Owner',
      updatedDate: '2026-08-16T00:00:00.000Z',
    },
    existingMembers: [],
    lookupUserProfile: vi.fn(async () => null),
  };

  beforeEach(async () => {
    dialogClose.mockReset();
    await TestBed.configureTestingModule({
      imports: [WorkspaceFormDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: dialogClose } },
      ],
    }).compileComponents();
  });

  it('should create a workspace without requiring an additional member', () => {
    const fixture = TestBed.createComponent(WorkspaceFormDialog);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const nameInput = element.querySelector<HTMLInputElement>('input[formControlName="name"]');
    const submitButton = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.type === 'submit',
    );

    expect(nameInput).not.toBeNull();
    expect(submitButton?.disabled).toBe(true);

    nameInput!.value = 'Solo workspace';
    nameInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(submitButton?.disabled).toBe(false);
    submitButton?.click();
    expect(dialogClose).toHaveBeenCalledWith({
      mode: 'create',
      name: 'Solo workspace',
      members: [],
    });
  });
});

describe('BulkEditorDialog', () => {
  const dialogData: BulkEditorData = {
    scope: 'monthly',
    selectedMonth: '2026-05',
    paymentAccounts: [
      {
        id: 'account-hdfc',
        name: 'HDFC account',
        bankName: 'HDFC',
        lastFour: '4321',
      },
    ],
    paymentModes: [
      {
        id: 'pm-gpay',
        type: 'upi',
        provider: 'Google Pay',
        name: 'Personal Google Pay',
        paymentAccountId: 'account-hdfc',
      },
      {
        id: 'pm-card',
        type: 'credit-card',
        name: 'Visa Credit',
        cardType: 'visa',
        lastFour: '1234',
        paymentAccountId: 'account-hdfc',
      },
    ],
    categories: [{ id: 'category-home', name: 'Home', monthlyBudget: 35000, color: '#1f7a8c' }],
    incomes: [
      { id: 'income-salary', source: 'Salary', amount: 120000, cadence: 'monthly', notes: '' },
    ],
    templates: [
      {
        id: 'fixed-rent',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        endDate: '2026-12-31',
      },
    ],
    expenses: [
      {
        id: 'expense-rent',
        month: '2026-05',
        date: '2026-05-01',
        name: 'Rent',
        categoryId: 'category-home',
        amount: 25000,
        type: 'recurring',
        note: 'Prepopulated from recurring plan',
        templateId: 'fixed-rent',
      },
    ],
    investments: [
      {
        id: 'investment-sip',
        name: 'Index SIP',
        amount: 15000,
        frequency: 'monthly',
        date: '2026-05-01',
        startDate: '2026-05-01',
        notes: '',
        paymentModeId: 'pm-gpay',
      },
    ],
    loans: [
      {
        id: 'loan-home',
        lender: 'Bank',
        loanType: 'Home loan',
        principal: 4000000,
        outstanding: 3200000,
        annualRate: 8.7,
        emi: 38000,
        startDate: '2024-01-01',
        endDate: '2036-12-31',
        notes: '',
        paymentModeId: 'pm-gpay',
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkEditorDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
  });

  const checkboxChangeEvent = (checked: boolean): Event => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    return { target: input } as unknown as Event;
  };

  it('should render expenses and recurring parents in the scoped monthly editor', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Monthly Entry Editor');
    expect(compiled.textContent).toContain('Expenses');
    expect(compiled.textContent).toContain('Recurring');
    expect(compiled.textContent).not.toContain('Income');
    expect(compiled.textContent).not.toContain('Loans');
  });

  it('should preserve the permanent owner when another member edits a record', () => {
    const originalActingMember = dialogData.actingMemberEmail;
    const originalTemplateOwner = dialogData.templates[0].memberEmail;
    const originalExpenseOwner = dialogData.expenses[0].memberEmail;
    dialogData.actingMemberEmail = 'editor@example.com';
    dialogData.templates[0].memberEmail = 'owner@example.com';
    dialogData.expenses[0].memberEmail = 'owner@example.com';
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as { apply: () => void };
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };

    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.templates[0].memberEmail).toBe('owner@example.com');
    expect(result.expenses[0].memberEmail).toBe('owner@example.com');
    dialogData.actingMemberEmail = originalActingMember;
    dialogData.templates[0].memberEmail = originalTemplateOwner;
    dialogData.expenses[0].memberEmail = originalExpenseOwner;
  });

  it('should require account-backed payment linkage for a new investment', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      addInvestment: () => void;
      apply: () => void;
      investments: () => Array<{ amount: number; name: string }>;
      validationError: () => string;
    };
    dialog.addInvestment();
    dialog.investments()[0].name = 'New SIP';
    dialog.investments()[0].amount = 10000;

    dialog.apply();

    expect(dialog.validationError()).toContain('linked to an active payment account');
  });

  it('should expose the redesigned bulk editor shell controls', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Bulk edit monthly expenses and entries');
    expect(compiled.textContent).toContain('Visible rows:');
    expect(compiled.textContent).toContain('Active rows:');
    expect(compiled.textContent).toContain('Marked delete:');
    expect(compiled.textContent).toContain('Add Row');
    expect(compiled.textContent).toContain('Apply Changes');
    expect(compiled.querySelector('button[aria-label="Close bulk editor"]')).toBeTruthy();
    expect(compiled.querySelector('button[aria-label="Edit expense row"]')).toBeTruthy();
  });

  it('should keep existing desktop rows read-only until the edit action is clicked', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const getExpenseNameInput = () =>
      compiled.querySelector<HTMLInputElement>('input[aria-label="Expense name"]');

    expect(getExpenseNameInput()).toBeNull();
    expect(compiled.querySelector('.cell-value')?.textContent).toContain('Rent');

    compiled.querySelector<HTMLButtonElement>('button[aria-label="Edit expense row"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(getExpenseNameInput()?.disabled).toBe(false);
  });

  it('should render mobile cards as read-only display content before editing', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const mobileCard = compiled.querySelector('.mobile-row-card');

    expect(mobileCard?.querySelector('.mobile-row-title')?.textContent).toContain('Rent');
    expect(mobileCard?.querySelector('.mobile-card-money-row')?.textContent).toContain('Home');
    expect(mobileCard?.querySelector('.mobile-card-money-row')?.textContent).toContain('₹25,000');
    expect(mobileCard?.querySelector('.mobile-card-note')?.textContent).toContain(
      'Prepopulated from recurring plan',
    );
    expect(mobileCard?.querySelector('input[aria-label="Expense name"]')).toBeNull();
  });

  it('should pass axe checks for the bulk editor dialog', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      addExpense: () => void;
      setBulkHeaderValue: (table: string, field: string, value: string) => void;
      toggleFilteredRowsSelection: (table: string, event: Event) => void;
    };

    dialog.addExpense();
    dialog.toggleFilteredRowsSelection('expenses', checkboxChangeEvent(true));
    dialog.setBulkHeaderValue('expenses', 'note', 'axe note');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input[placeholder="Search expenses"]'),
    ).toBeTruthy();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'input[aria-label="Set note for selected expenses"]',
      ),
    ).toBeTruthy();

    const results = await runAxe(fixture.nativeElement);

    expect(results.violations).toEqual([]);
  }, 12000);

  it('should filter and sort expense rows with common modal controls', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        categories: [
          { id: 'category-home', name: 'Home', monthlyBudget: 35000, color: '#1f7a8c' },
          { id: 'category-food', name: 'Food', monthlyBudget: 12000, color: '#0f766e' },
        ],
        expenses: [
          {
            id: 'expense-rent',
            month: '2026-05',
            date: '2026-05-01',
            name: 'Rent',
            categoryId: 'category-home',
            amount: 25000,
            type: 'recurring',
            note: 'Prepopulated from recurring plan',
            templateId: 'fixed-rent',
            paymentModeId: 'pm-card',
          },
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-food',
            amount: 2500,
            type: 'one-time',
            note: '',
            paymentModeId: 'pm-gpay',
          },
          {
            id: 'expense-groceries',
            month: '2026-05',
            date: '2026-05-08',
            name: 'Groceries',
            categoryId: 'category-food',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-medical-apr',
            month: '2026-04',
            date: '2026-04-08',
            name: 'Medical',
            categoryId: 'category-home',
            amount: 1800,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      filteredExpenses: () => Array<{
        amount: number;
        categoryId: string;
        isSuggested?: boolean;
        name: string;
        paymentModeId?: string;
      }>;
      setTableFilter: (table: string, key: string, value: string) => void;
      toggleSort: (table: string, column: string) => void;
    };

    dialog.setTableFilter('expenses', 'status', 'suggested');
    expect(dialog.filteredExpenses().map((expense) => expense.name)).toEqual(['Medical']);

    dialog.setTableFilter('expenses', 'status', 'all');
    dialog.setTableFilter('expenses', 'categoryId', 'category-food');
    expect(dialog.filteredExpenses().map((expense) => expense.name)).toEqual(['Fuel', 'Groceries']);

    dialog.setTableFilter('expenses', 'categoryId', '');
    dialog.setTableFilter('expenses', 'paymentModeId', 'pm-gpay');
    expect(dialog.filteredExpenses().map((expense) => expense.name)).toEqual(['Fuel']);

    dialog.setTableFilter('expenses', 'paymentModeId', '');
    dialog.setTableFilter('expenses', 'query', 'rent');
    expect(dialog.filteredExpenses().map((expense) => expense.name)).toEqual(['Rent']);

    dialog.setTableFilter('expenses', 'query', '');
    dialog.setTableFilter('expenses', 'categoryId', 'category-food');
    dialog.toggleSort('expenses', 'amount');
    expect(dialog.filteredExpenses().map((expense) => expense.name)).toEqual(['Fuel', 'Groceries']);

    dialog.toggleSort('expenses', 'amount');
    expect(dialog.filteredExpenses().map((expense) => expense.name)).toEqual(['Groceries', 'Fuel']);
  });

  it('should filter and sort investment rows with common modal controls', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        scope: 'planning',
        initialTabIndex: 2,
        categories: [
          {
            id: 'category-equity',
            name: 'Equity',
            monthlyBudget: 0,
            color: '#2563eb',
            type: 'Investments',
          },
          {
            id: 'category-gold',
            name: 'Gold',
            monthlyBudget: 0,
            color: '#a16207',
            type: 'Investments',
          },
        ],
        investments: [
          {
            id: 'investment-index',
            name: 'Index SIP',
            amount: 15000,
            categoryId: 'category-equity',
            frequency: 'monthly',
            date: '2026-05-01',
            startDate: '2026-05-01',
            notes: '',
            paymentModeId: 'pm-gpay',
          },
          {
            id: 'investment-gold',
            name: 'Gold Fund',
            amount: 5000,
            categoryId: 'category-gold',
            frequency: 'one-time',
            date: '2026-05-05',
            notes: '',
            paymentModeId: 'pm-card',
          },
          {
            id: 'investment-debt',
            name: 'Debt Fund',
            amount: 7000,
            categoryId: 'category-equity',
            frequency: 'annual',
            date: '2026-05-02',
            notes: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      filteredInvestments: () => Array<{
        amount: number;
        categoryId?: string;
        frequency: string;
        name: string;
        paymentModeId?: string;
      }>;
      setTableFilter: (table: string, key: string, value: string) => void;
      toggleSort: (table: string, column: string) => void;
    };

    dialog.setTableFilter('investments', 'frequency', 'monthly');
    expect(dialog.filteredInvestments().map((investment) => investment.name)).toEqual([
      'Index SIP',
    ]);

    dialog.setTableFilter('investments', 'frequency', '');
    dialog.setTableFilter('investments', 'paymentModeId', 'pm-card');
    expect(dialog.filteredInvestments().map((investment) => investment.name)).toEqual([
      'Gold Fund',
    ]);

    dialog.setTableFilter('investments', 'paymentModeId', '');
    dialog.setTableFilter('investments', 'categoryId', 'category-equity');
    expect(dialog.filteredInvestments().map((investment) => investment.name)).toEqual([
      'Index SIP',
      'Debt Fund',
    ]);

    dialog.setTableFilter('investments', 'categoryId', '');
    dialog.toggleSort('investments', 'amount');
    dialog.toggleSort('investments', 'amount');
    expect(dialog.filteredInvestments().map((investment) => investment.name)).toEqual([
      'Index SIP',
      'Debt Fund',
      'Gold Fund',
    ]);
  });

  it('should apply all draft rows after sorting and filtering the modal view', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      applyBulkHeaderEdit: (table: string) => void;
      apply: () => void;
      setBulkHeaderValue: (table: string, field: string, value: string) => void;
      setTableFilter: (table: string, key: string, value: string) => void;
      toggleSort: (table: string, column: string) => void;
      toggleFilteredRowsSelection: (table: string, event: Event) => void;
    };

    dialog.toggleFilteredRowsSelection('expenses', checkboxChangeEvent(true));
    dialog.setBulkHeaderValue('expenses', 'note', 'reviewed');
    dialog.applyBulkHeaderEdit('expenses');
    dialog.setTableFilter('expenses', 'status', 'modified');
    dialog.setTableFilter('expenses', 'query', 'rent');
    dialog.toggleSort('expenses', 'amount');
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.expenses.map((expense: { name: string }) => expense.name).sort()).toEqual([
      'Fuel',
      'Rent',
    ]);
    expect(result.expenses.map((expense: { note: string }) => expense.note)).toEqual([
      'reviewed',
      'reviewed',
    ]);
  });

  it('should select filtered desktop rows and clear selection', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          dialogData.expenses[0],
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      clearSelection: (table: string) => void;
      isRowSelected: (table: string, rowId: string) => boolean;
      selectedCount: (table: string) => number;
      setTableFilter: (table: string, key: string, value: string) => void;
      toggleFilteredRowsSelection: (table: string, event: Event) => void;
    };

    dialog.setTableFilter('expenses', 'query', 'fuel');
    dialog.toggleFilteredRowsSelection('expenses', checkboxChangeEvent(true));

    expect(dialog.selectedCount('expenses')).toBe(1);
    expect(dialog.isRowSelected('expenses', 'expense-fuel')).toBe(true);
    expect(dialog.isRowSelected('expenses', 'expense-rent')).toBe(false);

    dialog.clearSelection('expenses');

    expect(dialog.selectedCount('expenses')).toBe(0);
  });

  it('should mark selected rows for delete and keep them from the desktop bulk action', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          dialogData.expenses[0],
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      expenses: () => Array<{ pendingDelete?: boolean }>;
      keepSelectedRows: (table: string) => void;
      markSelectedForDelete: (table: string) => void;
      toggleFilteredRowsSelection: (table: string, event: Event) => void;
    };

    dialog.toggleFilteredRowsSelection('expenses', checkboxChangeEvent(true));
    dialog.markSelectedForDelete('expenses');

    expect(dialog.expenses().every((expense) => expense.pendingDelete)).toBe(true);

    dialog.keepSelectedRows('expenses');

    expect(dialog.expenses().some((expense) => expense.pendingDelete)).toBe(false);
  });

  it('should show header bulk editors only after multiple desktop rows are selected', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          dialogData.expenses[0],
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      bulkHeaderEditActive: (table: string) => boolean;
      showBulkHeaderEditor: (table: string, field: string) => boolean;
      toggleRowSelection: (table: string, rowId: string, event: Event) => void;
    };

    dialog.toggleRowSelection('expenses', 'expense-rent', checkboxChangeEvent(true));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialog.bulkHeaderEditActive('expenses')).toBe(false);
    expect(dialog.showBulkHeaderEditor('expenses', 'paymentModeId')).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'th.bulk-header-edit-col mat-select[aria-label="Set paid via for selected expenses"]',
      ),
    ).toBeNull();

    dialog.toggleRowSelection('expenses', 'expense-fuel', checkboxChangeEvent(true));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialog.bulkHeaderEditActive('expenses')).toBe(true);
    expect(dialog.showBulkHeaderEditor('expenses', 'paymentModeId')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('th.bulk-header-edit-col'),
    ).toBeTruthy();
  });

  it('should apply staged expense header edits and mark changed rows', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          { ...dialogData.expenses[0], paymentModeId: 'pm-card' },
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      applyBulkHeaderEdit: (table: string) => void;
      bulkHeaderResult: (table: string) => string;
      expenses: () => Array<{ note?: string; paymentModeId?: string }>;
      isFieldModified: (table: string, row: unknown, field: string) => boolean;
      isRowModified: (table: string, row: unknown) => boolean;
      setBulkHeaderValue: (table: string, field: string, value: string) => void;
      toggleFilteredRowsSelection: (table: string, event: Event) => void;
    };

    dialog.toggleFilteredRowsSelection('expenses', checkboxChangeEvent(true));
    dialog.setBulkHeaderValue('expenses', 'paymentModeId', 'pm-gpay');
    dialog.setBulkHeaderValue('expenses', 'note', 'future record');
    dialog.applyBulkHeaderEdit('expenses');

    expect(dialog.expenses().map((expense) => expense.paymentModeId)).toEqual([
      'pm-gpay',
      'pm-gpay',
    ]);
    expect(dialog.expenses().map((expense) => expense.note)).toEqual([
      'future record',
      'future record',
    ]);
    expect(dialog.expenses().every((expense) => dialog.isRowModified('expenses', expense))).toBe(
      true,
    );
    expect(
      dialog
        .expenses()
        .every((expense) => dialog.isFieldModified('expenses', expense, 'paymentModeId')),
    ).toBe(true);
    expect(dialog.bulkHeaderResult('expenses')).toContain('Updated 4 fields across 2 of 2');
  });

  it('should protect existing immutable investment fields and allow all-new selections', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        scope: 'planning',
        initialTabIndex: 2,
        investments: [
          {
            id: 'investment-index',
            name: 'Index SIP',
            amount: 15000,
            frequency: 'monthly',
            date: '2026-05-01',
            startDate: '2026-05-01',
            notes: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      addInvestment: () => void;
      applyBulkHeaderEdit: (table: string) => void;
      investments: () => Array<{ id: string; isNew?: boolean; name: string }>;
      showBulkHeaderEditor: (table: string, field: string) => boolean;
      setBulkHeaderValue: (table: string, field: string, value: string) => void;
      toggleFilteredRowsSelection: (table: string, event: Event) => void;
      toggleRowSelection: (table: string, rowId: string, event: Event) => void;
      clearSelection: (table: string) => void;
    };

    dialog.addInvestment();
    dialog.addInvestment();
    dialog.toggleFilteredRowsSelection('investments', checkboxChangeEvent(true));

    expect(dialog.showBulkHeaderEditor('investments', 'name')).toBe(false);

    dialog.clearSelection('investments');
    for (const investment of dialog.investments().filter((investment) => investment.isNew)) {
      dialog.toggleRowSelection('investments', investment.id, checkboxChangeEvent(true));
    }

    expect(dialog.showBulkHeaderEditor('investments', 'name')).toBe(true);

    dialog.setBulkHeaderValue('investments', 'name', 'Future SIP');
    dialog.applyBulkHeaderEdit('investments');

    expect(
      dialog.investments().find((investment) => investment.id === 'investment-index')?.name,
    ).toBe('Index SIP');
    expect(
      dialog
        .investments()
        .filter((investment) => investment.isNew)
        .map((investment) => investment.name),
    ).toEqual(['Future SIP', 'Future SIP']);
  });

  it('should apply staged investment header edits to selected rows', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        scope: 'planning',
        initialTabIndex: 2,
        categories: [
          {
            id: 'category-equity',
            name: 'Equity',
            monthlyBudget: 0,
            color: '#2563eb',
            type: 'Investments',
          },
          {
            id: 'category-gold',
            name: 'Gold',
            monthlyBudget: 0,
            color: '#a16207',
            type: 'Investments',
          },
        ],
        investments: [
          {
            id: 'investment-index',
            name: 'Index SIP',
            amount: 15000,
            categoryId: 'category-equity',
            frequency: 'monthly',
            date: '2026-05-01',
            notes: '',
          },
          {
            id: 'investment-gold',
            name: 'Gold Fund',
            amount: 5000,
            categoryId: 'category-gold',
            frequency: 'one-time',
            date: '2026-05-05',
            notes: '',
          },
          {
            id: 'investment-debt',
            name: 'Debt Fund',
            amount: 7000,
            categoryId: 'category-equity',
            frequency: 'annual',
            date: '2026-05-02',
            notes: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      applyBulkHeaderEdit: (table: string) => void;
      investments: () => Array<{
        categoryId?: string;
        date?: string;
        frequency?: string;
        id: string;
        name: string;
      }>;
      isRowModified: (table: string, row: unknown) => boolean;
      setBulkHeaderValue: (table: string, field: string, value: string) => void;
      toggleRowSelection: (table: string, rowId: string, event: Event) => void;
    };

    dialog.toggleRowSelection('investments', 'investment-index', checkboxChangeEvent(true));
    dialog.toggleRowSelection('investments', 'investment-gold', checkboxChangeEvent(true));
    dialog.setBulkHeaderValue('investments', 'categoryId', 'category-gold');
    dialog.setBulkHeaderValue('investments', 'frequency', 'monthly');
    dialog.setBulkHeaderValue('investments', 'date', '2026-06-01');
    dialog.applyBulkHeaderEdit('investments');

    expect(
      dialog
        .investments()
        .filter((investment) => investment.id !== 'investment-debt')
        .map((investment) => ({
          categoryId: investment.categoryId,
          date: investment.date,
          frequency: investment.frequency,
        })),
    ).toEqual([
      { categoryId: 'category-gold', date: '2026-06-01', frequency: 'monthly' },
      { categoryId: 'category-gold', date: '2026-06-01', frequency: 'monthly' },
    ]);
    expect(
      dialog.isRowModified(
        'investments',
        dialog.investments().find((investment) => investment.id === 'investment-index'),
      ),
    ).toBe(true);
    expect(
      dialog.investments().find((investment) => investment.id === 'investment-debt')?.date,
    ).toBe('2026-05-02');
  });

  it('should filter modified rows without including new or delete-only rows', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          dialogData.expenses[0],
          {
            id: 'expense-fuel',
            month: '2026-05',
            date: '2026-05-04',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-coffee',
            month: '2026-05',
            date: '2026-05-06',
            name: 'Coffee',
            categoryId: 'category-home',
            amount: 300,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      addExpense: () => void;
      applyBulkHeaderEdit: (table: string) => void;
      expenses: () => Array<{ id: string; name: string; pendingDelete?: boolean }>;
      filteredExpenses: () => Array<{ id: string; name: string }>;
      markSelectedForDelete: (table: string) => void;
      setBulkHeaderValue: (table: string, field: string, value: string) => void;
      setTableFilter: (table: string, key: string, value: string) => void;
      toggleRowSelection: (table: string, rowId: string, event: Event) => void;
    };

    dialog.addExpense();
    dialog.toggleRowSelection('expenses', 'expense-coffee', checkboxChangeEvent(true));
    dialog.markSelectedForDelete('expenses');
    dialog.setTableFilter('expenses', 'status', 'modified');

    expect(dialog.filteredExpenses()).toEqual([]);

    dialog.setTableFilter('expenses', 'status', 'all');
    dialog.toggleRowSelection('expenses', 'expense-rent', checkboxChangeEvent(true));
    dialog.toggleRowSelection('expenses', 'expense-fuel', checkboxChangeEvent(true));
    dialog.setBulkHeaderValue('expenses', 'note', 'reviewed');
    dialog.applyBulkHeaderEdit('expenses');
    dialog.setTableFilter('expenses', 'status', 'modified');

    expect(
      dialog
        .filteredExpenses()
        .map((expense) => expense.name)
        .sort(),
    ).toEqual(['Fuel', 'Rent']);
  });

  it('should keep bulk selection controls out of mobile card markup', async () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.desktop-table-region .row-select-input')).toBeTruthy();
    expect(compiled.querySelector('.mobile-card-list .row-select-input')).toBeNull();
    expect(compiled.querySelector('.mobile-card-list .bulk-header-editor')).toBeNull();
  });

  it('should suggest previous one-time expenses that are not already in the selected month', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-grocery-apr',
            month: '2026-04',
            date: '2026-04-10',
            name: 'Groceries',
            categoryId: 'category-home',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-medical-jan',
            month: '2026-01',
            date: '2026-01-10',
            name: 'Medical',
            categoryId: 'category-home',
            amount: 900,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-fuel-apr',
            month: '2026-04',
            date: '2026-04-12',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2500,
            type: 'one-time',
            note: '',
          },
          {
            id: 'expense-fuel-may',
            month: '2026-05',
            date: '2026-05-02',
            name: 'Fuel',
            categoryId: 'category-home',
            amount: 2600,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      expenses: () => Array<{
        name: string;
        categoryId: string;
        isSuggested?: boolean;
        suggestionMonth?: string;
      }>;
    };

    const suggestions = dialog.expenses().filter((expense) => expense.isSuggested);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      name: 'Groceries',
      categoryId: 'category-home',
      suggestionMonth: '2026-04',
    });
  });

  it('should save recurring parents separately and infer expense types', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      addExpense: () => void;
      apply: () => void;
      expenses: () => Array<{
        name: string;
        amount: number;
        categoryId: string;
        templateId?: string;
      }>;
    };

    dialog.addExpense();
    dialog.expenses()[0].name = 'Snacks';
    dialog.expenses()[0].amount = 450;
    dialog.expenses()[0].categoryId = 'category-home';
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.templates).toHaveLength(1);
    expect(result.expenses.find((expense: { name: string }) => expense.name === 'Rent')?.type).toBe(
      'recurring',
    );
    expect(
      result.expenses.find((expense: { name: string }) => expense.name === 'Snacks')?.type,
    ).toBe('one-time');
  });

  it('should include selected payment modes in edited financial rows', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      expenses: () => Array<{ paymentModeId?: string }>;
      investments: () => Array<{ paymentModeId?: string }>;
      loans: () => Array<{ paymentModeId?: string }>;
      templates: () => Array<{ paymentModeId?: string }>;
    };

    dialog.expenses()[0].paymentModeId = 'pm-gpay';
    dialog.templates()[0].paymentModeId = 'pm-card';
    dialog.investments()[0].paymentModeId = 'pm-gpay';
    dialog.loans()[0].paymentModeId = 'pm-card';
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.expenses[0]).toEqual(expect.objectContaining({ paymentModeId: 'pm-gpay' }));
    expect(result.templates[0]).toEqual(expect.objectContaining({ paymentModeId: 'pm-card' }));
    expect(result.investments[0]).toEqual(expect.objectContaining({ paymentModeId: 'pm-gpay' }));
    expect(result.loans[0]).toEqual(expect.objectContaining({ paymentModeId: 'pm-card' }));
  });

  it('should resolve archived payment mode labels without offering archived modes in selectors', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        paymentModes: [
          ...(dialogData.paymentModes ?? []),
          {
            id: 'pm-old-upi',
            type: 'upi',
            provider: 'Paytm',
            name: 'Old Paytm UPI',
            archivedDate: '2026-05-01T00:00:00.000Z',
          },
        ],
        expenses: [{ ...dialogData.expenses[0], paymentModeId: 'pm-old-upi' }],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      activePaymentModes: PaymentMode[];
      paymentModeName: (paymentModeId?: string) => string;
    };

    expect(dialog.paymentModeName('pm-old-upi')).toBe('Paytm Unassigned');
    expect(dialog.activePaymentModes.some((paymentMode) => paymentMode.id === 'pm-old-upi')).toBe(
      false,
    );
  });

  it('should offer only same-owner modes while retaining a historical cross-owner selection', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        actingMemberEmail: 'owner@example.com',
        paymentModes: [
          {
            id: 'pm-owner',
            type: 'upi',
            name: 'Owner UPI',
            memberEmail: 'owner@example.com',
          },
          {
            id: 'pm-historical-other',
            type: 'upi',
            name: 'Historical other UPI',
            memberEmail: 'other@example.com',
          },
          {
            id: 'pm-other',
            type: 'upi',
            name: 'Other UPI',
            memberEmail: 'other@example.com',
          },
          {
            id: 'payment-mode-cash',
            type: 'cash',
            name: 'Cash',
            workspaceGlobal: true,
          },
        ],
        expenses: [
          {
            ...dialogData.expenses[0],
            memberEmail: 'owner@example.com',
            paymentModeId: 'pm-historical-other',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      expenses: () => Array<{ memberEmail?: string; paymentModeId?: string }>;
      paymentModesForRecord: (record: {
        memberEmail?: string;
        paymentModeId?: string;
      }) => PaymentMode[];
    };

    const availableIds = dialog
      .paymentModesForRecord(dialog.expenses()[0])
      .map((paymentMode) => paymentMode.id);
    expect(availableIds).toEqual(
      expect.arrayContaining(['pm-owner', 'pm-historical-other', 'payment-mode-cash']),
    );
    expect(availableIds).not.toContain('pm-other');
  });

  it('should hide and clear budgets for non-expense categories', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        scope: 'planning',
        categories: [
          {
            id: 'category-income',
            name: 'Salary',
            monthlyBudget: 50000,
            color: '#1f7a8c',
            type: 'Income',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      categories: () => Array<{ id: string; monthlyBudget: number; type?: string }>;
      toggleRowEditing: (row: unknown, event: Event) => void;
    };
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    dialog.toggleRowEditing(dialog.categories()[0], new Event('click'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'input[aria-label="Category monthly budget"]',
      ),
    ).toBeNull();
    dialog.apply();
    expect(dialogRef.close.mock.calls[0][0].categories[0].monthlyBudget).toBe(0);
  });

  it('should not persist untouched suggested one-time expense rows', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-grocery-apr',
            month: '2026-04',
            date: '2026-04-10',
            name: 'Groceries',
            categoryId: 'category-home',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
    };

    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.expenses.some((expense: { name: string }) => expense.name === 'Groceries')).toBe(
      false,
    );
  });

  it('should persist suggested one-time expense rows after an amount is entered', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        expenses: [
          ...dialogData.expenses,
          {
            id: 'expense-grocery-apr',
            month: '2026-04',
            date: '2026-04-10',
            name: 'Groceries',
            categoryId: 'category-home',
            amount: 3200,
            type: 'one-time',
            note: '',
          },
        ],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      expenses: () => Array<{ name: string; amount: number; isSuggested?: boolean }>;
    };

    const suggestion = dialog.expenses().find((expense) => expense.isSuggested);
    if (suggestion) {
      suggestion.amount = 3300;
    }
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(
      result.expenses.find((expense: { name: string }) => expense.name === 'Groceries'),
    ).toMatchObject({
      amount: 3300,
      month: '2026-05',
      type: 'one-time',
    });
  });

  it('should keep existing recurring name and category unchanged from the modal', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      templates: () => Array<{ name: string; categoryId: string; amount: number }>;
    };

    dialog.templates()[0].name = 'Lease';
    dialog.templates()[0].categoryId = '';
    dialog.templates()[0].amount = 26000;
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.templates[0]).toMatchObject({
      name: 'Rent',
      categoryId: 'category-home',
      amount: 26000,
    });
  });

  it('should keep non-updatable income, investment, and loan fields unchanged from the modal', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      incomes: () => Array<{ source: string; cadence: string; amount: number }>;
      investments: () => Array<{ name: string; amount: number }>;
      loans: () => Array<{ lender: string; loanType: string; emi: number }>;
    };

    dialog.incomes()[0].source = 'Changed salary';
    dialog.incomes()[0].cadence = 'annual';
    dialog.incomes()[0].amount = 130000;
    dialog.investments()[0].name = 'Changed SIP';
    dialog.investments()[0].amount = 18000;
    dialog.loans()[0].lender = 'Changed bank';
    dialog.loans()[0].loanType = 'Changed loan';
    dialog.loans()[0].emi = 39000;
    dialog.apply();

    const result = dialogRef.close.mock.calls[0][0];
    expect(result.incomes[0]).toMatchObject({
      source: 'Salary',
      cadence: 'monthly',
      amount: 130000,
    });
    expect(result.investments[0]).toMatchObject({ name: 'Index SIP', amount: 18000 });
    expect(result.loans[0]).toMatchObject({
      lender: 'Bank',
      loanType: 'Home loan',
      emi: 39000,
    });
  });

  it('should allow unchanged recurring parents with historical starts', () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        templates: [{ ...dialogData.templates[0], startDate: '2021-01-01' }],
      },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      validationError: () => string;
    };

    dialog.apply();

    expect(dialog.validationError()).toBe('');
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('should allow new recurring parents to start before the selected month', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      addRecurringExpense: () => void;
      apply: () => void;
      templates: () => Array<{
        amount: number;
        categoryId: string;
        name: string;
        startDate?: string;
      }>;
      validationError: () => string;
    };

    dialog.addRecurringExpense();
    dialog.templates()[0].name = 'Hyd Rent';
    dialog.templates()[0].categoryId = 'category-home';
    dialog.templates()[0].amount = 35000;
    dialog.templates()[0].startDate = '2026-05-01';
    dialog.apply();

    expect(dialog.validationError()).toBe('');
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('should default new recurring parents to the current month, not selected month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: { ...dialogData, selectedMonth: '2026-01' },
    });
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      addRecurringExpense: () => void;
      templates: () => Array<{ startDate?: string }>;
    };

    dialog.addRecurringExpense();

    expect(dialog.templates()[0].startDate).toBe('2026-06-01');
  });

  it('should validate recurring update dates and amount before applying', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 11));
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialogRef = TestBed.inject(MatDialogRef) as unknown as {
      close: ReturnType<typeof vi.fn>;
    };
    const dialog = fixture.componentInstance as unknown as {
      apply: () => void;
      templates: () => Array<{ amount: number; startDate?: string; endDate?: string }>;
      validationError: () => string;
    };

    dialog.templates()[0].amount = undefined as unknown as number;
    dialog.apply();

    expect(dialog.validationError()).toContain('Amount is mandatory');
    expect(dialogRef.close).not.toHaveBeenCalled();

    dialog.templates()[0].amount = 25000;
    dialog.templates()[0].startDate = '2026-04-01';
    dialog.apply();

    expect(dialog.validationError()).toContain('selected month or a future month');
    expect(dialogRef.close).not.toHaveBeenCalled();

    dialog.templates()[0].startDate = '2026-06-01';
    dialog.templates()[0].endDate = '2026-05-31';
    dialog.apply();

    expect(dialog.validationError()).toContain('greater than the start date');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('should show only historical recurring audit rows', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      recurringAuditRows: (template: unknown) => Array<{
        amount: number;
        operation: string;
        recordedDate?: string;
      }>;
    };

    const rows = dialog.recurringAuditRows({
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 9000,
      type: 'recurring',
      startDate: '2026-08-01',
      auditTrail: [
        {
          id: 'created',
          operation: 'created',
          recordedDate: '2026-05-01',
          effectiveStartDate: '2026-05-01',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 8500,
        },
        {
          id: 'updated',
          operation: 'updated',
          recordedDate: '2026-07-01',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-07-31',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 8500,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 8500,
      operation: 'Updated',
      recordedDate: '2026-07-01',
    });
  });

  it('should show legacy-cased recurring audit rows', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      recurringAuditRows: (template: unknown) => Array<{ amount: number; operation: string }>;
    };

    const rows = dialog.recurringAuditRows({
      id: 'fixed-rent',
      name: 'Rent',
      categoryId: 'category-home',
      amount: 9000,
      type: 'recurring',
      startDate: '2026-08-01',
      auditTrail: [
        {
          id: 'updated',
          operation: 'Updated',
          recordedDate: '2026-07-01',
          effectiveStartDate: '2026-05-01',
          effectiveEndDate: '2026-07-31',
          name: 'Rent',
          categoryId: 'category-home',
          amount: 8500,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 8500, operation: 'Updated' });
  });

  it('should keep the audit expand button visible for recurring history', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: {
        ...dialogData,
        initialTabIndex: 1,
        templates: [
          {
            ...dialogData.templates[0],
            amount: 9000,
            startDate: '2026-08-01',
            auditTrail: [
              {
                id: 'updated',
                operation: 'updated',
                recordedDate: '2026-07-01',
                effectiveStartDate: '2026-05-01',
                effectiveEndDate: '2026-07-31',
                name: 'Rent',
                categoryId: 'category-home',
                amount: 8500,
              },
            ],
          },
        ],
      },
    });

    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('expand_more');
  });

  it('should format recurring audit timestamps for display', () => {
    const fixture = TestBed.createComponent(BulkEditorDialog);
    const dialog = fixture.componentInstance as unknown as {
      auditDateTimeLabel: (date: string | undefined) => string;
    };

    expect(dialog.auditDateTimeLabel(undefined)).toBe('Not recorded');
    expect(dialog.auditDateTimeLabel('not-a-date')).toBe('not-a-date');
    expect(dialog.auditDateTimeLabel('2026-07-01T10:30:00.000Z')).toContain('2026');
    expect(dialog.auditDateTimeLabel('2026-07-01T10:30:00.000Z')).toMatch(/\d{2}:\d{2}/);
  });

  it('should render investments in the scoped planning editor', async () => {
    TestBed.overrideProvider(MAT_DIALOG_DATA, {
      useValue: { ...dialogData, scope: 'planning', initialTabIndex: 2 },
    });

    const fixture = TestBed.createComponent(BulkEditorDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Income & Budget Editor');
    expect(compiled.textContent).toContain('Income');
    expect(compiled.textContent).toContain('Categories');
    expect(compiled.textContent).toContain('Investments');
    expect(compiled.textContent).not.toContain('Recurring Plans');
    expect(compiled.textContent).not.toContain('Loans');
  });
});

describe('BudgetStore bulk editor launcher', () => {
  it('should open the bulk editor as a Material bottom sheet on mobile', async () => {
    const bottomSheetOpen = vi.fn(() => ({ afterDismissed: () => of(undefined) }));
    const dialogOpen = vi.fn(() => ({ afterClosed: () => of(undefined) }));
    const breakpointObserver = {
      isMatched: vi.fn(() => true),
      observe: vi.fn(() => of({ matches: true, breakpoints: {} })),
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    })
      .overrideProvider(BreakpointObserver, { useValue: breakpointObserver })
      .overrideProvider(MatBottomSheet, { useValue: { open: bottomSheetOpen } })
      .overrideProvider(MatDialog, { useValue: { open: dialogOpen } })
      .compileComponents();

    const fixture = TestBed.createComponent(App);

    await fixture.debugElement.injector.get(BudgetStore).openBulkEditor('monthly');

    expect(bottomSheetOpen).toHaveBeenCalled();
    expect(dialogOpen).not.toHaveBeenCalled();
  });
});

describe('App accessibility', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pass axe checks on the login screen', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
      workspaceId: { set: (workspaceId: string | null) => void };
    };

    app.firebase.mode = 'firebase';
    app.isSessionChecking.set(false);
    app.workspaceId.set(null);
    fixture.detectChanges();
    await Promise.resolve();

    const results = await runAxe(fixture.nativeElement);

    expect(results.violations).toEqual([]);
  }, 12000);

  it.each([
    '/dashboard',
    '/income',
    '/expenses',
    '/planning',
    '/investments',
    '/loans',
    '/categories',
    '/payment-modes',
    '/import-export',
    '/workspace',
    '/settings',
  ])(
    'should pass axe checks for %s',
    async (path) => {
      const fixture = TestBed.createComponent(App);
      const router = TestBed.inject(Router);
      const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
        firebase: { mode: string };
        isSessionChecking: { set: (checking: boolean) => void };
      };

      app.firebase.mode = 'local';
      app.isSessionChecking.set(false);
      await router.navigateByUrl(path);
      fixture.detectChanges();
      await Promise.resolve();

      const results = await runAxe(fixture.nativeElement);

      expect(results.violations).toEqual([]);
    },
    12000,
  );

  it('should pass axe checks on a loan detail screen', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const app = fixture.debugElement.injector.get(BudgetStore) as unknown as {
      firebase: { mode: string };
      isSessionChecking: { set: (checking: boolean) => void };
      loanAccounts: { set: (records: unknown[]) => void };
      loanEvents: { set: (records: unknown[]) => void };
    };

    app.firebase.mode = 'local';
    app.isSessionChecking.set(false);
    app.loanAccounts.set([
      {
        id: 'loan-a11y',
        schemaVersion: 2,
        lender: 'Example Bank',
        loanType: 'Personal loan',
        accountReferenceLastFour: '1234',
        contract: {
          disbursedAmount: 100000,
          disbursementDate: '2026-08-01',
          firstEmiDate: '2026-09-01',
          originalTenureMonths: 12,
          initialEmi: 8792,
          initialAnnualRate: 10,
          interestType: 'fixed',
          interestCalculationMethod: 'monthly-reducing',
          dayCountConvention: 'actual-365',
          compoundingFrequency: 'monthly',
          postPrepaymentStrategy: 'keep-emi-reduce-tenure',
          roundingPolicy: {
            monetaryScale: 2,
            interestRounding: 'half-up',
            installmentRounding: 'half-up',
            finalInstallmentAdjustment: true,
          },
        },
        notes: '',
      },
    ]);
    app.loanEvents.set([]);

    await router.navigateByUrl('/loans/loan-a11y');
    fixture.detectChanges();
    await fixture.whenStable();

    const results = await runAxe(fixture.nativeElement);

    expect(results.violations).toEqual([]);
  }, 12000);
});

describe('budget import helpers', () => {
  it('should generate a template with import status output columns', () => {
    const template = createBudgetImportTemplateCsv();

    expect(template).toContain('recordType');
    expect(template).toContain('status');
    expect(template).toContain('comments');
    expect(template).toContain('recurring_expense');
  });

  it('should add existing categories to the workbook master sheet', async () => {
    const readExcelFile = (await import('read-excel-file/universal')).default;
    const workbookBlob = await createBudgetImportTemplateWorkbook([
      {
        id: 'category-home',
        name: 'Home',
        monthlyBudget: 35000,
        color: '#1f7a8c',
        type: 'Expenses',
      },
      {
        id: 'category-mf',
        name: 'Mutual Funds',
        monthlyBudget: 20000,
        color: '#047857',
        type: 'Investments',
      },
    ]);
    const workbook = await readExcelFile(await workbookBlob.arrayBuffer());
    const masterSheet = workbook.find((sheet) => sheet.sheet === 'master_categories');
    const [headers = [], ...dataRows] = masterSheet?.data ?? [];
    const rows = dataRows.map((row) =>
      Object.fromEntries(headers.map((header, index) => [String(header), row[index] ?? ''])),
    );

    expect(workbook[0]?.sheet).toBe('master_categories');
    expect(rows).toContainEqual(
      expect.objectContaining({
        name: 'Home',
        type: 'Expenses',
        monthlyBudget: 35000,
        color: '#1f7a8c',
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        name: 'Mutual Funds',
        type: 'Investments',
      }),
    );
  });

  it('should ignore the workbook master sheet during import parsing', async () => {
    const workbookBlob = await createBudgetImportTemplateWorkbook([
      {
        id: 'category-home',
        name: 'Home',
        monthlyBudget: 35000,
        color: '#1f7a8c',
        type: 'Expenses',
      },
    ]);
    const file = new File([workbookBlob], 'budget-template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const parsed = await parseBudgetImportFile(file, []);

    expect(parsed.rows.every((row) => row.values['sheet'] !== 'master_categories')).toBe(true);
    expect(parsed.rows.some((row) => row.comments.join(' ').includes('master_categories'))).toBe(
      false,
    );
  });

  it('should validate each row and map valid rows into app collections', () => {
    const csv = [
      'recordType,name,categoryName,monthlyBudget,color,amount,month,date',
      'category,Food,,15000,#1f7a8c,,,',
      'expense,Groceries,Food,,,1200,2026-06,2026-06-04',
      'expense,Broken,Unknown,,,nope,2026-06,2026-06-05',
    ].join('\n');

    const parsed = parseBudgetImportCsv(csv, []);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].collectionName).toBe('categories');
    expect(parsed.rows[1].collectionName).toBe('expenses');
    expect((parsed.rows[1].record as { type: string }).type).toBe('one-time');
    expect(parsed.rows[2].status).toBe('error');
    expect(parsed.rows[2].comments.join(' ')).toContain('amount must be a number');
    expect(parsed.rows[2].comments.join(' ')).toContain('categoryName "Unknown" was not found');
  });

  it('should reject explicit owner assignment in imported financial rows', () => {
    const csv = [
      'recordType,name,categoryName,monthlyBudget,color,amount,month,date,memberEmail',
      'category,Food,,15000,#1f7a8c,,,,',
      'expense,Groceries,Food,,,1200,2026-06,2026-06-04,a@example.com',
      'expense,Unknown user,Food,,,900,2026-06,2026-06-05,missing@example.com',
    ].join('\n');

    const parsed = parseBudgetImportCsv(
      csv,
      [],
      [
        {
          uid: 'uid-a',
          email: 'a@example.com',
          displayName: 'A',
          role: 'editor',
          createdDate: '2026-06-01T00:00:00.000Z',
        },
      ],
    );

    expect(parsed.rows[1].status).toBe('error');
    expect(parsed.rows[1].comments.join(' ')).toContain('must be blank');
    expect(parsed.rows[2].status).toBe('error');
    expect(parsed.rows[2].comments.join(' ')).toContain('must be blank');
  });

  it('should reject unsupported investment import frequencies', () => {
    const csv = [
      'recordType,name,type,categoryName,monthlyBudget,color,amount,frequency,date,startDate,paymentModeName',
      'category,Mutual Funds,Investments,,0,#047857,,,,,',
      'investment,Legacy SIP,,Mutual Funds,,,12000,recurring,2026-06-01,2026-06-01,Bank UPI',
      'investment,Odd SIP,,Mutual Funds,,,8000,fortnightly,2026-06-01,2026-06-01,Bank UPI',
      'investment,Bonus,,Mutual Funds,,,5000,one-time,2026-06-10,,Bank UPI',
    ].join('\n');

    const parsed = parseBudgetImportCsv(
      csv,
      [],
      [],
      [
        {
          id: 'pm-bank-upi',
          type: 'upi',
          name: 'Bank UPI',
          paymentAccountId: 'account-bank',
        },
      ],
    );
    const comments = parsed.rows.flatMap((row) => row.comments).join(' ');

    expect(parsed.rows.filter((row) => row.recordType === 'investment' && row.record)).toHaveLength(
      1,
    );
    expect(comments).toContain('frequency must be one of');
    expect(comments).toContain('weekly, monthly, quarterly, half-yearly, annual, one-time');
  });

  it('should skip rows already marked successful in processed imports', () => {
    const csv = [
      'recordType,name,monthlyBudget,status,comments',
      'category,Food,15000,success,Imported into categories.',
      'category,Travel,12000,error,Fix and retry.',
    ].join('\n');

    const parsed = parseBudgetImportCsv(csv, []);

    expect(parsed.rows[0].status).toBe('success');
    expect(parsed.rows[0].collectionName).toBeUndefined();
    expect(parsed.rows[0].comments.join(' ')).toContain('Previously imported; skipped');
    expect(parsed.rows[1].collectionName).toBe('categories');
  });

  it('should build processed CSV files with status and comments columns', () => {
    const parsed = parseBudgetImportCsv('recordType,name,monthlyBudget\ncategory,Food,15000', []);
    parsed.rows[0].status = 'success';
    parsed.rows[0].comments.push('Imported into categories.');

    const output = buildProcessedImportCsv(parsed.headers, parsed.rows);

    expect(output.split('\n')[0]).toContain('status,comments');
    expect(output).toContain('success,Imported into categories.');
  });
});
