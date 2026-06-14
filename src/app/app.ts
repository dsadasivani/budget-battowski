import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
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
};

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
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
  readonly navOpen = signal(false);
  readonly navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
    { label: 'Monthly Expenses', icon: 'credit_card', path: '/expenses' },
    { label: 'Planning', icon: 'calendar_month', path: '/planning' },
    { label: 'Investments', icon: 'trending_up', path: '/investments' },
    { label: 'Loans', icon: 'account_balance', path: '/loans' },
    { label: 'Categories', icon: 'sell', path: '/categories' },
    { label: 'Import/Export', icon: 'upload_file', path: '/import-export' },
    { label: 'Workspace', icon: 'group', path: '/workspace' },
    { label: 'Settings', icon: 'settings', path: '/settings' },
  ];
  readonly accountLabel = computed(() => this.userName() || this.userEmail() || 'Signed in');

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }
}
