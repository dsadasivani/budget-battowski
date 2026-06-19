import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  forwardRef,
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

type NavItem = {
  label: string;
  icon: string;
  path: string;
  shortLabel?: string;
};

type OnboardingStep = {
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

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatBottomSheetModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  providers: [{ provide: BudgetStore, useExisting: forwardRef(() => App) }],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App extends BudgetStore {
  private static readonly onboardingStorageKey = 'budget-battowski-onboarding-v1';
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private loginCarouselTimer: ReturnType<typeof setInterval> | null = null;

  readonly activeRoutePath = signal('/dashboard');
  readonly navOpen = signal(false);
  readonly onboardingOpen = signal(false);
  readonly onboardingIndex = signal(0);
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
      icon: 'dashboard',
      eyebrow: 'Start here',
      title: 'Your dashboard is the quick health check.',
      description:
        'See income, expenses, investments, loan EMIs, and what is left for the selected month before making decisions.',
      actionLabel: 'Open dashboard',
      path: '/dashboard',
      tips: ['Use month and member filters first.', 'Watch the remaining amount and runway badge.'],
    },
    {
      icon: 'credit_card',
      eyebrow: 'Daily tracking',
      title: 'Add spending as recurring or one-time.',
      description:
        'Recurring entries are bills that repeat. One-time entries are ad-hoc purchases. Keeping them separate makes every month easier to review.',
      actionLabel: 'Review expenses',
      path: '/expenses',
      tips: ['Use search to find a bill quickly.', 'Monthly review helps confirm expected rows.'],
    },
    {
      icon: 'calendar_month',
      eyebrow: 'Plan ahead',
      title: 'Use planning before the money moves.',
      description:
        'Planning lets you compare expected income, commitments, and savings goals so there are fewer surprises later.',
      actionLabel: 'Open planning',
      path: '/planning',
      tips: ['Plan by month.', 'Adjust categories before overspending.'],
    },
    {
      icon: 'trending_up',
      eyebrow: 'Grow and repay',
      title: 'Investments and loans stay in the same picture.',
      description:
        'Track SIPs, savings, and EMIs beside expenses so your budget reflects the full household cash flow.',
      actionLabel: 'See investments',
      path: '/investments',
      tips: ['Keep SIPs updated.', 'Check loan EMI totals on the dashboard.'],
    },
    {
      icon: 'group',
      eyebrow: 'Household setup',
      title: 'Invite the right people and keep data organized.',
      description:
        'Workspaces, members, categories, payment modes, and import/export tools help you keep the app clean as usage grows.',
      actionLabel: 'Open workspace',
      path: '/workspace',
      tips: [
        'Create a workspace for each household.',
        'Use categories and payment modes for cleaner reports.',
      ],
    },
  ];
  readonly activeOnboardingStep = computed(() => this.onboardingSteps[this.onboardingIndex()]);
  readonly onboardingProgressLabel = computed(
    () => `Step ${this.onboardingIndex() + 1} of ${this.onboardingSteps.length}`,
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
    { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
    { label: 'Monthly Expenses', icon: 'credit_card', path: '/expenses', shortLabel: 'Expenses' },
    { label: 'Planning', icon: 'calendar_month', path: '/planning' },
    { label: 'Investments', icon: 'trending_up', path: '/investments' },
    { label: 'Loans', icon: 'account_balance', path: '/loans' },
    { label: 'Categories', icon: 'sell', path: '/categories' },
    { label: 'Payment Modes', icon: 'payments', path: '/payment-modes' },
    { label: 'Import/Export', icon: 'upload_file', path: '/import-export' },
    { label: 'Workspace', icon: 'group', path: '/workspace' },
    { label: 'Settings', icon: 'settings', path: '/settings' },
  ];
  readonly primaryMobileNavItems = this.navItems.slice(0, 5);
  readonly utilityMobileNavItems = this.navItems.slice(5);
  readonly activeMobileNavItem = computed(() => {
    const path = this.activeRoutePath();
    return (
      this.navItems.find((item) => path === item.path || path.startsWith(`${item.path}/`)) ??
      this.navItems[0]
    );
  });
  readonly accountLabel = computed(() => this.userName() || this.userEmail() || 'Signed in');

  constructor() {
    super();
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
    this.openOnboardingForFirstVisit();
  }

  override ngOnDestroy(): void {
    if (this.loginCarouselTimer) {
      clearInterval(this.loginCarouselTimer);
    }

    super.ngOnDestroy();
  }

  openOnboarding(): void {
    this.onboardingIndex.set(0);
    this.onboardingOpen.set(true);
  }

  closeOnboarding(): void {
    this.onboardingOpen.set(false);
    this.markOnboardingSeen();
  }

  nextOnboardingStep(): void {
    if (this.onboardingIndex() === this.onboardingSteps.length - 1) {
      this.closeOnboarding();
      return;
    }

    this.onboardingIndex.update((index) => index + 1);
  }

  previousOnboardingStep(): void {
    this.onboardingIndex.update((index) => Math.max(0, index - 1));
  }

  selectOnboardingStep(index: number): void {
    this.onboardingIndex.set(index);
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

  private openOnboardingForFirstVisit(): void {
    if (this.firebase.mode === 'firebase' && !this.workspaceId()) {
      return;
    }

    if (globalThis.localStorage?.getItem(App.onboardingStorageKey) === 'seen') {
      return;
    }

    this.onboardingOpen.set(true);
  }

  private markOnboardingSeen(): void {
    globalThis.localStorage?.setItem(App.onboardingStorageKey, 'seen');
  }

  private normalizedRoutePath(url: string): string {
    const path = url.split(/[?#]/)[0];
    return path && path !== '/' ? path : '/dashboard';
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
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
