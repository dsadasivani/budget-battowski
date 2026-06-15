import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { BudgetStore } from './budget.store';

type NavItem = {
  label: string;
  icon: string;
  path: string;
  shortLabel?: string;
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
  private loginCarouselTimer: ReturnType<typeof setInterval> | null = null;

  readonly navOpen = signal(false);
  readonly loginCarouselIndex = signal(0);
  readonly loginCarouselPaused = signal(false);
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
    { label: 'Import/Export', icon: 'upload_file', path: '/import-export' },
    { label: 'Workspace', icon: 'group', path: '/workspace' },
    { label: 'Settings', icon: 'settings', path: '/settings' },
  ];
  readonly primaryMobileNavItems = this.navItems.slice(0, 5);
  readonly utilityMobileNavItems = this.navItems.slice(5);
  readonly accountLabel = computed(() => this.userName() || this.userEmail() || 'Signed in');

  constructor() {
    super();
    this.startLoginCarousel();
  }

  override ngOnDestroy(): void {
    if (this.loginCarouselTimer) {
      clearInterval(this.loginCarouselTimer);
    }

    super.ngOnDestroy();
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
