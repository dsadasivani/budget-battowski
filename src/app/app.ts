import { CommonModule } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { appEnvironment } from '../environments/environment';
import { BudgetStore } from './budget.store';
import { BudgetFacade } from './core/budget.facade';
import type { OnboardingProgress, OnboardingStepStatus } from './budget.models';

type NavItem = {
  label: string;
  icon: string;
  path: string;
  shortLabel?: string;
  mobilePlacement: 'primary' | 'utility';
};

type OnboardingStep = {
  id: string;
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  path: string;
  tips: string[];
};

type LoginFeature = {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  visualClass: string;
  imageLabel: string;
  metrics: Array<{
    label: string;
    value: string;
    tone: 'blue' | 'green' | 'amber';
  }>;
  highlights: string[];
};

export interface App extends BudgetFacade {}

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    CdkTrapFocus,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  providers: [BudgetFacade, { provide: BudgetStore, useExisting: BudgetFacade }],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private static readonly onboardingStorageKey = 'budget-battowski-onboarding-v2';
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private loginCarouselTimer: ReturnType<typeof setInterval> | null = null;
  private navFocusRestoreTimer: ReturnType<typeof setTimeout> | null = null;
  private navTriggerElement: HTMLElement | null = null;
  private onboardingHydratedIdentity: string | null = null;
  readonly budget = inject(BudgetFacade);

  readonly activeRoutePath = signal('/dashboard');
  readonly navOpen = signal(false);
  readonly onboardingOpen = signal(false);
  readonly onboardingIndex = signal(0);
  readonly onboardingStatuses = signal<Record<string, OnboardingStepStatus>>({});
  readonly loginCarouselIndex = signal(0);
  readonly loginCarouselPaused = signal(false);
  readonly passwordLoginEnabled = Boolean(appEnvironment.enablePasswordLogin);
  readonly appEnvironmentName = appEnvironment.name;
  readonly qaLoginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly onboardingSteps: OnboardingStep[] = [
    {
      id: 'payment-accounts',
      icon: 'account_balance_wallet',
      eyebrow: 'Payment setup',
      title: 'Add your active payment accounts.',
      description: 'Record the bank and last four digits for every account used by this workspace.',
      actionLabel: 'Open payment accounts',
      path: '/payment-modes?tab=accounts',
      tips: ['Add accounts before payment modes.', 'Account ownership follows the creator.'],
    },
    {
      id: 'payment-modes',
      icon: 'credit_card',
      eyebrow: 'Payment setup',
      title: 'Create payment modes and link accounts.',
      description: 'Set up UPI, cards, net banking, and other modes used for regular payments.',
      actionLabel: 'Open payment modes',
      path: '/payment-modes',
      tips: ['Multiple modes can point to one account.', 'Cash is available by default.'],
    },
    {
      id: 'categories',
      icon: 'sell',
      eyebrow: 'Budget setup',
      title: 'Create categories and expense budgets.',
      description:
        'Organize expenses, income, and investments. Budgets apply only to expense categories.',
      actionLabel: 'Open categories',
      path: '/categories',
      tips: ['Expense budgets repeat monthly.', 'Changes apply from the selected month forward.'],
    },
    {
      id: 'income',
      icon: 'payments',
      eyebrow: 'Money coming in',
      title: 'Add monthly and one-time income.',
      description: 'Record each income source and view how income changes over time.',
      actionLabel: 'Open income',
      path: '/income',
      tips: ['Monthly income repeats automatically.', 'Income does not require monthly review.'],
    },
    {
      id: 'loans',
      icon: 'account_balance',
      eyebrow: 'Optional setup',
      title: 'Add existing loans, if applicable.',
      description: 'Record fixed monthly EMIs and the linked payment account used for debit.',
      actionLabel: 'Open loans',
      path: '/loans',
      tips: ['Loan EMIs are confirmed automatically.', 'Skip this step if you have no loans.'],
    },
    {
      id: 'investments',
      icon: 'trending_up',
      eyebrow: 'Optional setup',
      title: 'Add existing investments, if applicable.',
      description: 'Record one-time investments or recurring plans and link their payment account.',
      actionLabel: 'Open investments',
      path: '/investments',
      tips: [
        'Future occurrences require monthly approval.',
        'Skip this step if you have no investments.',
      ],
    },
    {
      id: 'monthly-expenses',
      icon: 'receipt_long',
      eyebrow: 'Start tracking',
      title: 'Add and review monthly expenses.',
      description:
        'Record one-time spending and approve expected recurring expenses for the month.',
      actionLabel: 'Open monthly expenses',
      path: '/expenses',
      tips: ['Pending plans stay out of dashboards.', 'Review covers the whole workspace.'],
    },
  ];
  readonly activeOnboardingStep = computed(() => this.onboardingSteps[this.onboardingIndex()]);
  readonly onboardingProgressLabel = computed(
    () => `Step ${this.onboardingIndex() + 1} of ${this.onboardingSteps.length}`,
  );
  readonly activeOnboardingStatus = computed(
    () => this.onboardingStatuses()[this.activeOnboardingStep().id] ?? 'pending',
  );

  readonly loginFeatures: LoginFeature[] = [
    {
      eyebrow: 'Month-first planning',
      title: 'See every monthly decision before it hits the account.',
      description:
        'Track income, expenses, recurring commitments, and remaining buffer in one calm planning view.',
      icon: 'calendar_month',
      visualClass: 'monthly-visual',
      imageLabel: 'Illustrated dashboard showing monthly budget cards and spending movement',
      metrics: [
        { label: 'Income', value: '₹1.5L', tone: 'blue' },
        { label: 'Spend', value: '₹75K', tone: 'amber' },
        { label: 'Buffer', value: '₹58K', tone: 'green' },
      ],
      highlights: ['Month controls', 'Budget cards', 'Runway signal'],
    },
    {
      eyebrow: 'Recurring clarity',
      title: 'Recurring bills, one-time spends, and plans stay separated.',
      description:
        'Review predictable expenses without losing sight of the irregular transactions that change the month.',
      icon: 'sync_alt',
      visualClass: 'recurring-visual',
      imageLabel: 'Illustrated list of recurring and one-time records moving into monthly review',
      metrics: [
        { label: 'Recurring', value: '₹69K', tone: 'blue' },
        { label: 'One-time', value: '₹6.8K', tone: 'amber' },
        { label: 'Rows', value: '18', tone: 'green' },
      ],
      highlights: ['Smart review', 'Bulk editor', 'Clean categories'],
    },
    {
      eyebrow: 'Shared household view',
      title: 'Keep every member aligned without crowding the screen.',
      description:
        'Filter by member, share workspace ownership, and keep household finances readable on any device.',
      icon: 'groups',
      visualClass: 'workspace-visual',
      imageLabel: 'Illustrated shared workspace with member avatars and synchronized cards',
      metrics: [
        { label: 'Members', value: '2', tone: 'blue' },
        { label: 'Synced', value: 'Live', tone: 'green' },
        { label: 'Private', value: 'Yes', tone: 'amber' },
      ],
      highlights: ['Member filters', 'Cloud sync', 'Private access'],
    },
    {
      eyebrow: 'Investments and loans',
      title: 'Investments and EMIs live beside the monthly budget.',
      description:
        'Balance SIPs, loan repayments, and savings targets with the same monthly context as expenses.',
      icon: 'trending_up',
      visualClass: 'portfolio-visual',
      imageLabel: 'Illustrated finance portfolio with investment growth and loan repayment cards',
      metrics: [
        { label: 'SIP', value: '₹16K', tone: 'green' },
        { label: 'EMI', value: '₹31K', tone: 'amber' },
        { label: 'Plans', value: '6', tone: 'blue' },
      ],
      highlights: ['SIP review', 'Loan calendar', 'Savings ratio'],
    },
  ];
  readonly navItems: NavItem[] = [
    {
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: 'dashboard',
      path: '/dashboard',
      mobilePlacement: 'primary',
    },
    {
      label: 'Monthly Expenses',
      shortLabel: 'Expenses',
      icon: 'credit_card',
      path: '/expenses',
      mobilePlacement: 'primary',
    },
    {
      label: 'Income',
      icon: 'payments',
      path: '/income',
      mobilePlacement: 'utility',
    },
    {
      label: 'Planning',
      shortLabel: 'Plan',
      icon: 'calendar_month',
      path: '/planning',
      mobilePlacement: 'primary',
    },
    {
      label: 'Investments',
      shortLabel: 'Invest',
      icon: 'trending_up',
      path: '/investments',
      mobilePlacement: 'primary',
    },
    {
      label: 'Loans',
      icon: 'account_balance',
      path: '/loans',
      mobilePlacement: 'primary',
    },
    { label: 'Categories', icon: 'sell', path: '/categories', mobilePlacement: 'utility' },
    {
      label: 'Payment Modes',
      icon: 'payments',
      path: '/payment-modes',
      mobilePlacement: 'utility',
    },
    {
      label: 'Import & Export',
      icon: 'upload_file',
      path: '/import-export',
      mobilePlacement: 'utility',
    },
    {
      label: 'Workspace Management',
      icon: 'group',
      path: '/workspace',
      mobilePlacement: 'utility',
    },
    { label: 'Settings', icon: 'settings', path: '/settings', mobilePlacement: 'utility' },
  ];
  readonly primaryMobileNavItems = this.navItems.filter(
    (item) => item.mobilePlacement === 'primary',
  );
  readonly utilityMobileNavItems = this.navItems.filter(
    (item) => item.mobilePlacement === 'utility',
  );
  readonly activeMobileNavItem = computed(() => {
    const path = this.activeRoutePath();
    return (
      this.navItems.find((item) => path === item.path || path.startsWith(`${item.path}/`)) ??
      this.navItems[0]
    );
  });
  readonly accountLabel = computed(() => this.userName() || this.userEmail() || 'Signed in');

  constructor() {
    this.exposeFacadeCompatibilityApi();
    this.activeRoutePath.set(this.normalizedRoutePath(this.router.url));
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.activeRoutePath.set(this.normalizedRoutePath(event.urlAfterRedirects));
      });
    this.startLoginCarousel();
    effect(() => this.hydrateOnboardingWhenReady());
  }

  ngOnDestroy(): void {
    if (this.loginCarouselTimer) {
      clearInterval(this.loginCarouselTimer);
    }

    if (this.navFocusRestoreTimer) {
      clearTimeout(this.navFocusRestoreTimer);
    }

  }

  private exposeFacadeCompatibilityApi(): void {
    Object.assign(this, this.budget);
    let prototype: object | null = Object.getPrototypeOf(this.budget);
    while (prototype && prototype !== Object.prototype) {
      for (const propertyName of Object.getOwnPropertyNames(prototype)) {
        if (propertyName === 'constructor' || propertyName in this) {
          continue;
        }
        const value = Reflect.get(prototype, propertyName, this.budget) as unknown;
        if (typeof value === 'function') {
          Reflect.set(this, propertyName, value.bind(this.budget));
        }
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
  }

  openOnboarding(): void {
    this.onboardingIndex.set(this.firstIncompleteOnboardingIndex());
    this.onboardingOpen.set(true);
  }

  closeOnboarding(): void {
    this.onboardingOpen.set(false);
    void this.persistOnboardingProgress();
  }

  completeOnboardingStep(): void {
    this.setActiveOnboardingStatus('completed');
    this.advanceOnboarding();
  }

  skipOnboardingStep(): void {
    this.setActiveOnboardingStatus('skipped');
    this.advanceOnboarding();
  }

  previousOnboardingStep(): void {
    this.onboardingIndex.update((index) => Math.max(0, index - 1));
    void this.persistOnboardingProgress();
  }

  selectOnboardingStep(index: number): void {
    this.onboardingIndex.set(index);
    void this.persistOnboardingProgress();
  }

  async loginWithPassword(): Promise<void> {
    if (!this.passwordLoginEnabled) {
      return;
    }

    if (this.qaLoginForm.invalid) {
      this.qaLoginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.qaLoginForm.getRawValue();
    await this.loginWithEmailPassword(email.trim(), password);
  }

  private hydrateOnboardingWhenReady(): void {
    const email = this.userEmail();
    const workspaceId = this.workspaceId();
    const progress = this.onboardingProgress();
    const checking = this.isSessionChecking() || this.isWorkspaceDataLoading();
    if (this.firebase.mode === 'firebase' && (!email || !workspaceId || checking)) {
      return;
    }

    const identity = email || 'local-user';
    if (this.onboardingHydratedIdentity === identity) {
      return;
    }
    this.onboardingHydratedIdentity = identity;

    const stored = progress ?? this.readLocalOnboardingProgress(identity);
    const statuses = Object.fromEntries(
      this.onboardingSteps.map((step) => [step.id, stored?.steps[step.id] ?? 'pending']),
    ) as Record<string, OnboardingStepStatus>;
    this.onboardingStatuses.set(statuses);
    const activeIndex = stored
      ? Math.max(
          0,
          this.onboardingSteps.findIndex((step) => step.id === stored.activeStepId),
        )
      : this.firstIncompleteOnboardingIndex(statuses);
    this.onboardingIndex.set(activeIndex);

    if (Object.values(statuses).some((status) => status === 'pending')) {
      this.onboardingOpen.set(true);
    }
  }

  private setActiveOnboardingStatus(status: OnboardingStepStatus): void {
    const stepId = this.activeOnboardingStep().id;
    this.onboardingStatuses.update((statuses) => ({ ...statuses, [stepId]: status }));
  }

  private advanceOnboarding(): void {
    const nextIndex = this.onboardingSteps.findIndex(
      (step, index) =>
        index > this.onboardingIndex() &&
        (this.onboardingStatuses()[step.id] ?? 'pending') === 'pending',
    );
    if (nextIndex < 0) {
      void this.persistOnboardingProgress();
      this.onboardingOpen.set(false);
      return;
    }

    this.onboardingIndex.set(nextIndex);
    void this.persistOnboardingProgress();
  }

  private firstIncompleteOnboardingIndex(statuses = this.onboardingStatuses()): number {
    const index = this.onboardingSteps.findIndex(
      (step) => (statuses[step.id] ?? 'pending') === 'pending',
    );
    return index < 0 ? 0 : index;
  }

  private async persistOnboardingProgress(): Promise<void> {
    const identity = this.userEmail() || 'local-user';
    const progress: OnboardingProgress = {
      activeStepId: this.activeOnboardingStep().id,
      steps: this.onboardingStatuses(),
      updatedDate: new Date().toISOString(),
    };
    globalThis.localStorage?.setItem(
      `${App.onboardingStorageKey}:${identity}`,
      JSON.stringify(progress),
    );
    await this.saveOnboardingProgress(progress);
  }

  private readLocalOnboardingProgress(identity: string): OnboardingProgress | null {
    const value = globalThis.localStorage?.getItem(`${App.onboardingStorageKey}:${identity}`);
    if (!value) {
      if (globalThis.localStorage?.getItem('budget-battowski-onboarding-v1') === 'seen') {
        return {
          activeStepId: this.onboardingSteps.at(-1)?.id ?? this.onboardingSteps[0].id,
          steps: Object.fromEntries(
            this.onboardingSteps.map((step) => [step.id, 'completed' as const]),
          ),
          updatedDate: new Date().toISOString(),
        };
      }
      return null;
    }
    try {
      return JSON.parse(value) as OnboardingProgress;
    } catch {
      return null;
    }
  }

  private normalizedRoutePath(url: string): string {
    const path = url.split(/[?#]/)[0];
    return path && path !== '/' ? path : '/dashboard';
  }

  toggleNav(event?: Event): void {
    if (this.navOpen()) {
      this.closeNav();
      return;
    }

    this.navTriggerElement =
      event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.navOpen.set(true);
  }

  closeNav(restoreFocus = true): void {
    const trigger = restoreFocus ? this.navTriggerElement : null;
    this.navOpen.set(false);
    this.navTriggerElement = null;

    if (!trigger) {
      return;
    }

    if (this.navFocusRestoreTimer) {
      clearTimeout(this.navFocusRestoreTimer);
    }

    this.navFocusRestoreTimer = setTimeout(() => {
      if (trigger.isConnected) {
        trigger.focus();
      }
      this.navFocusRestoreTimer = null;
    });
  }

  nextLoginFeature(): void {
    this.loginCarouselIndex.update((index) => (index + 1) % this.loginFeatures.length);
  }

  previousLoginFeature(): void {
    this.loginCarouselIndex.update(
      (index) => (index - 1 + this.loginFeatures.length) % this.loginFeatures.length,
    );
  }

  selectLoginFeature(index: number): void {
    this.loginCarouselIndex.set(index);
  }

  toggleLoginCarousel(): void {
    this.loginCarouselPaused.update((paused) => !paused);
  }

  private startLoginCarousel(): void {
    const prefersReducedMotion =
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      this.loginCarouselPaused.set(true);
      return;
    }

    this.loginCarouselTimer = setInterval(() => {
      if (!this.loginCarouselPaused()) {
        this.nextLoginFeature();
      }
    }, 5200);
  }
}
