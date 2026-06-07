import {
  CommonModule,
  CurrencyPipe,
  DatePipe,
  PercentPipe,
  registerLocaleData,
} from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { User } from 'firebase/auth';

import { BudgetFirestoreRepository } from './budget.firestore';
import {
  BulkEditorDialog,
  type BulkEditorResult,
  type BulkEditorScope,
} from './bulk-editor-dialog';
import {
  initializeBudgetFirebase,
  observeBudgetAuth,
  signInWithGoogle,
  signOutBudgetUser,
} from './firebase.client';
import type {
  BudgetCategory,
  BudgetCollectionName,
  BudgetDataMap,
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseType,
  IncomeSource,
  Loan,
} from './budget.models';

registerLocaleData(localeEnIn);

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(month: string, offset: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return monthKey(new Date(year, monthIndex - 1 + offset, 1));
}

function lastMonth(): string {
  const now = new Date();
  return monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

function monthLabel(month: string): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
    new Date(year, monthIndex - 1, 1),
  );
}

function monthOptions(centerMonth: string): string[] {
  return Array.from({ length: 13 }, (_, index) => addMonths(centerMonth, index - 6));
}

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    CurrencyPipe,
    DatePipe,
    PercentPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    MatToolbarModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  private readonly dialog = inject(MatDialog);
  private readonly storagePrefix = 'budget-battowski';
  private authUnsubscribe?: () => void;
  private readonly unsubscribes: Array<() => void> = [];

  protected readonly firebase = initializeBudgetFirebase();
  private repository?: BudgetFirestoreRepository;
  protected readonly isSyncing = signal(false);
  protected readonly syncStatus = signal(
    this.firebase.mode === 'firebase' ? 'Sign in with Google' : 'Firebase config needed',
  );
  protected readonly syncError = signal<string | null>(null);
  protected readonly workspaceId = signal<string | null>(null);
  protected readonly userName = signal<string | null>(null);
  protected readonly userEmail = signal<string | null>(null);
  protected readonly selectedMonth = signal(lastMonth());
  protected readonly categories = signal<BudgetCategory[]>([]);
  protected readonly incomes = signal<IncomeSource[]>([]);
  protected readonly templates = signal<ExpenseTemplate[]>([]);
  protected readonly expenses = signal<ExpenseEntry[]>([]);
  protected readonly loans = signal<Loan[]>([]);

  protected readonly monthOptions = computed(() => monthOptions(this.selectedMonth()));
  protected readonly canWrite = computed(
    () => this.firebase.mode !== 'firebase' || (!!this.workspaceId() && !this.isSyncing()),
  );
  protected readonly monthLabel = computed(() => monthLabel(this.selectedMonth()));
  protected readonly monthlyIncome = computed(() =>
    this.incomes().reduce((total, income) => {
      if (income.cadence === 'annual') {
        return total + income.amount / 12;
      }

      return total + income.amount;
    }, 0),
  );
  protected readonly selectedEntries = computed(() =>
    this.expenses().filter((expense) => expense.month === this.selectedMonth()),
  );
  protected readonly recurringTotal = computed(() => this.totalByType('recurring'));
  protected readonly oneTimeTotal = computed(() => this.totalByType('one-time'));
  protected readonly investmentTotal = computed(() => this.totalByType('investment'));
  protected readonly outflowTotal = computed(() =>
    this.selectedEntries().reduce((total, expense) => total + expense.amount, 0),
  );
  protected readonly remainingFunds = computed(() => this.monthlyIncome() - this.outflowTotal());
  protected readonly burnoutRatio = computed(() =>
    this.ratio(this.outflowTotal(), this.monthlyIncome()),
  );
  protected readonly savingsRatio = computed(() =>
    this.ratio(this.investmentTotal() + Math.max(0, this.remainingFunds()), this.monthlyIncome()),
  );
  protected readonly debtEmiTotal = computed(() =>
    this.loans().reduce((total, loan) => total + loan.emi, 0),
  );
  protected readonly debtRatio = computed(() =>
    this.ratio(this.debtEmiTotal(), this.monthlyIncome()),
  );
  protected readonly categoryStats = computed(() =>
    this.categories().map((category) => {
      const spent = this.selectedEntries()
        .filter((expense) => expense.categoryId === category.id)
        .reduce((total, expense) => total + expense.amount, 0);

      return {
        ...category,
        spent,
        remaining: category.monthlyBudget - spent,
        used: this.ratio(spent, category.monthlyBudget),
      };
    }),
  );
  protected readonly trendRows = computed(() => {
    const months = Array.from({ length: 6 }, (_, index) =>
      addMonths(this.selectedMonth(), index - 5),
    );

    return months.map((month) => {
      const entries = this.expenses().filter((expense) => expense.month === month);
      const outflow = entries.reduce((total, expense) => total + expense.amount, 0);
      const invested = entries
        .filter((expense) => expense.type === 'investment')
        .reduce((total, expense) => total + expense.amount, 0);

      return {
        month,
        label: monthLabel(month),
        outflow,
        invested,
        remaining: this.monthlyIncome() - outflow,
        burn: this.ratio(outflow, this.monthlyIncome()),
      };
    });
  });
  protected readonly loanPlans = computed(() =>
    this.loans().map((loan) => {
      const monthsLeft = Math.max(1, Math.ceil(loan.outstanding / loan.emi));
      const payoff = new Date();
      payoff.setMonth(payoff.getMonth() + monthsLeft);

      return {
        ...loan,
        monthsLeft,
        payoff,
        paidRatio: this.ratio(loan.principal - loan.outstanding, loan.principal),
      };
    }),
  );
  protected readonly totalDebt = computed(() =>
    this.loans().reduce((total, loan) => total + loan.outstanding, 0),
  );
  protected readonly donutStyle = computed(() => {
    const stats = this.categoryStats().filter((category) => category.spent > 0);
    const total = stats.reduce((sum, category) => sum + category.spent, 0);
    if (!total) {
      return 'conic-gradient(#d7dee8 0 100%)';
    }

    let cursor = 0;
    const stops = stats.map((category) => {
      const start = cursor;
      cursor += (category.spent / total) * 100;
      return `${category.color} ${start}% ${cursor}%`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  });
  protected readonly suggestions = computed(() => {
    const ideas: string[] = [];
    const overBudget = this.categoryStats()
      .filter((category) => category.spent > category.monthlyBudget)
      .sort((a, b) => b.spent - b.monthlyBudget - (a.spent - a.monthlyBudget));

    if (overBudget[0]) {
      ideas.push(
        `${overBudget[0].name} is over budget by ${this.formatMoney(
          overBudget[0].spent - overBudget[0].monthlyBudget,
        )}. Move one flexible purchase or lift the budget if this is expected.`,
      );
    }

    if (this.investmentTotal() < this.monthlyIncome() * 0.2) {
      ideas.push(
        'Investments are below 20% of monthly income. Consider increasing SIPs or emergency savings.',
      );
    }

    if (this.debtRatio() > 0.35) {
      ideas.push(
        'EMIs are above 35% of income. Prioritize short-tenure debts before adding new obligations.',
      );
    }

    if (this.burnoutRatio() > 0.85) {
      ideas.push(
        'Salary burn is high for this month. Lock discretionary categories before the next card cycle.',
      );
    }

    if (!this.categories().length) {
      ideas.push('Create your first category before adding expenses or fixed monthly items.');
    }

    if (ideas.length === 0) {
      ideas.push(
        'The month is balanced. Keep recurring templates updated so future entries stay painless.',
      );
    }

    return ideas;
  });

  constructor() {
    this.clearLegacyLocalData();
    void this.watchAuthState();
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.stopFirestoreListeners();
  }

  protected async loginWithGoogle(): Promise<void> {
    if (!this.firebase.app) {
      this.syncStatus.set('Firebase config needed');
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      await signInWithGoogle(this.firebase.app);
      this.syncStatus.set('Signing in');
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }

  protected async logout(): Promise<void> {
    if (!this.firebase.app) {
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      await signOutBudgetUser(this.firebase.app);
      this.syncStatus.set('Signed out');
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Logout failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }

  protected setMonth(month: string): void {
    if (month) {
      this.selectedMonth.set(month);
    }
  }

  protected moveMonth(offset: number): void {
    this.selectedMonth.update((month) => addMonths(month, offset));
  }

  protected openBulkEditor(scope: BulkEditorScope): void {
    const dialogRef = this.dialog.open(BulkEditorDialog, {
      autoFocus: false,
      data: {
        scope,
        selectedMonth: this.selectedMonth(),
        categories: this.categories(),
        incomes: this.incomes(),
        templates: this.templates(),
        expenses: this.expenses(),
        loans: this.loans(),
      },
      maxWidth: '96vw',
      width: '1240px',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        void this.applyBulkChanges(result);
      }
    });
  }

  protected async prefillMonth(): Promise<void> {
    const month = this.selectedMonth();
    const existingTemplateIds = new Set(
      this.expenses()
        .filter((expense) => expense.month === month && expense.templateId)
        .map((expense) => expense.templateId),
    );
    const newEntries = this.templates()
      .filter((template) => !existingTemplateIds.has(template.id))
      .map<ExpenseEntry>((template) => ({
        id: id('planned'),
        month,
        name: template.name,
        categoryId: template.categoryId,
        amount: template.amount,
        type: template.type,
        note: 'Prepopulated from recurring plan',
        templateId: template.id,
      }));

    if (newEntries.length) {
      await this.saveRecords('expenses', newEntries, () =>
        this.expenses.update((items) => [...items, ...newEntries]),
      );
    }
  }

  protected categoryName(categoryId: string): string {
    return (
      this.categories().find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
    );
  }

  protected formatMonth(month: string): string {
    return monthLabel(month);
  }

  protected formatMoney(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  protected clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  private async watchAuthState(): Promise<void> {
    if (!this.firebase.app) {
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      this.authUnsubscribe = await observeBudgetAuth(this.firebase.app, (user) => {
        void this.handleAuthUser(user);
      });
      this.syncStatus.set('Sign in with Google');
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Unable to initialize Firebase login.',
      );
    } finally {
      this.isSyncing.set(false);
    }
  }

  private async handleAuthUser(user: User | null): Promise<void> {
    this.stopFirestoreListeners();
    this.repository = undefined;
    const email = user?.email ?? null;
    this.workspaceId.set(email);
    this.userName.set(user?.displayName ?? null);
    this.userEmail.set(email);

    if (!user || !this.firebase.app || !email) {
      this.clearAppData();
      this.syncStatus.set(
        this.firebase.mode === 'firebase' ? 'Sign in with Google' : 'Firebase config needed',
      );
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);
    this.repository = new BudgetFirestoreRepository(this.firebase.app, email);

    try {
      const subscriptions = await Promise.all([
        this.repository.listen(
          'categories',
          (records) => this.categories.set(records),
          (message) => this.handleSyncError(message),
        ),
        this.repository.listen(
          'incomes',
          (records) => this.incomes.set(records),
          (message) => this.handleSyncError(message),
        ),
        this.repository.listen(
          'templates',
          (records) => this.templates.set(records),
          (message) => this.handleSyncError(message),
        ),
        this.repository.listen(
          'expenses',
          (records) => this.expenses.set(records),
          (message) => this.handleSyncError(message),
        ),
        this.repository.listen(
          'loans',
          (records) => this.loans.set(records),
          (message) => this.handleSyncError(message),
        ),
      ]);

      this.unsubscribes.push(...subscriptions);
      this.syncStatus.set('Synced with Firebase');
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Unable to connect to Firebase.',
      );
    } finally {
      this.isSyncing.set(false);
    }
  }

  private async saveRecords<TName extends BudgetCollectionName>(
    collectionName: TName,
    records: BudgetDataMap[TName][],
    applyLocal: () => void,
  ): Promise<boolean> {
    return this.runFirebaseWrite(async () => {
      await this.repository?.upsertMany(collectionName, records);
    }, applyLocal);
  }

  private async applyBulkChanges(result: BulkEditorResult): Promise<void> {
    const deletedCategoryIds = new Set(result.deleted.categories);
    const deletedExpenseIds = new Set(result.deleted.expenses);
    const deletedIncomeIds = new Set(result.deleted.incomes);
    const deletedLoanIds = new Set(result.deleted.loans);
    const deletedTemplateIds = new Set(result.deleted.templates);

    const categories = result.categories.filter((category) => !deletedCategoryIds.has(category.id));
    const incomes = result.incomes.filter((income) => !deletedIncomeIds.has(income.id));
    const templates = result.templates.filter(
      (template) =>
        !deletedTemplateIds.has(template.id) && !deletedCategoryIds.has(template.categoryId),
    );
    const expenses = result.expenses
      .filter((expense) => !deletedExpenseIds.has(expense.id))
      .map((expense) =>
        deletedCategoryIds.has(expense.categoryId)
          ? { ...expense, categoryId: '', templateId: undefined }
          : deletedTemplateIds.has(expense.templateId ?? '')
            ? { ...expense, templateId: undefined }
            : expense,
      );
    const loans = result.loans.filter((loan) => !deletedLoanIds.has(loan.id));

    const existingTemplates = this.templates();
    const existingExpenses = this.expenses();

    const saved = await this.runFirebaseWrite(
      async () => {
        for (const categoryId of deletedCategoryIds) {
          await this.repository?.deleteCategory(
            categoryId,
            existingTemplates.filter((template) => template.categoryId === categoryId),
            existingExpenses.filter((expense) => expense.categoryId === categoryId),
          );
        }

        await Promise.all([
          ...result.deleted.incomes.map((recordId) => this.repository?.delete('incomes', recordId)),
          ...result.deleted.templates.map((recordId) =>
            this.repository?.delete('templates', recordId),
          ),
          ...result.deleted.expenses.map((recordId) =>
            this.repository?.delete('expenses', recordId),
          ),
          ...result.deleted.loans.map((recordId) => this.repository?.delete('loans', recordId)),
        ]);

        await Promise.all([
          this.repository?.upsertMany('categories', categories),
          this.repository?.upsertMany('incomes', incomes),
          this.repository?.upsertMany('templates', templates),
          this.repository?.upsertMany('expenses', expenses),
          this.repository?.upsertMany('loans', loans),
        ]);
      },
      () => {
        this.categories.set(categories);
        this.incomes.set(incomes);
        this.templates.set(templates);
        this.expenses.set(expenses);
        this.loans.set(loans);
      },
    );

    if (saved) {
      this.syncStatus.set(
        this.repository ? 'Bulk changes saved to Firebase' : 'Bulk changes saved',
      );
    }
  }

  private async runFirebaseWrite(
    action: () => Promise<void>,
    applyLocal: () => void,
  ): Promise<boolean> {
    if (!this.repository) {
      if (this.firebase.mode === 'firebase') {
        this.syncStatus.set('Sign in required');
        return false;
      }

      applyLocal();
      return true;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      await action();
      applyLocal();
      this.syncStatus.set('Saved to Firebase');
      return true;
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Firebase save failed.');
      return false;
    } finally {
      this.isSyncing.set(false);
    }
  }

  private handleSyncError(message: string): void {
    this.syncError.set(message);
    this.syncStatus.set('Firebase sync failed');
    this.isSyncing.set(false);
  }

  private totalByType(type: ExpenseType): number {
    return this.selectedEntries()
      .filter((expense) => expense.type === type)
      .reduce((total, expense) => total + expense.amount, 0);
  }

  private ratio(value: number, total: number): number {
    return total <= 0 ? 0 : value / total;
  }

  private clearLegacyLocalData(): void {
    for (const key of ['categories', 'incomes', 'templates', 'expenses', 'loans']) {
      localStorage.removeItem(`${this.storagePrefix}:${key}`);
    }
  }

  private stopFirestoreListeners(): void {
    while (this.unsubscribes.length) {
      this.unsubscribes.pop()?.();
    }
  }

  private clearAppData(): void {
    this.categories.set([]);
    this.incomes.set([]);
    this.templates.set([]);
    this.expenses.set([]);
    this.loans.set([]);
  }
}
