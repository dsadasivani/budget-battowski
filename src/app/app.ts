import {
  CommonModule,
  CurrencyPipe,
  DatePipe,
  PercentPipe,
  registerLocaleData,
} from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
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
  MonthlyReviewDialog,
  type MonthlyReviewResult,
  type MonthlyReviewRow,
} from './monthly-review-dialog';
import {
  initializeBudgetFirebase,
  observeBudgetAuth,
  signInWithGoogle,
  signOutBudgetUser,
} from './firebase.client';
import {
  buildProcessedImportWorkbook,
  createBudgetImportTemplateWorkbook,
  parseBudgetImportFile,
  summarizeImportRows,
  type BudgetImportRow,
  type BudgetImportSummary,
} from './budget-import.service';
import type {
  BudgetCategory,
  BudgetCollectionName,
  BudgetDataMap,
  Cadence,
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseTemplateAuditVersion,
  ExpenseType,
  IncomeAuditVersion,
  IncomeSource,
  InvestmentAuditVersion,
  InvestmentEntry,
  Loan,
  LoanAuditVersion,
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

function monthParts(month: string): { year: number; monthIndex: number } {
  const [year, monthIndex] = month.split('-').map(Number);
  return { year, monthIndex: monthIndex - 1 };
}

function monthKeyFromParts(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function monthStartDate(month: string): string {
  return `${month}-01`;
}

function monthEndDate(month: string): string {
  return previousDate(monthStartDate(addMonths(month, 1)));
}

function previousDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(year, month - 1, day - 1);

  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}-${String(
    previous.getDate(),
  ).padStart(2, '0')}`;
}

function laterDate(first: string, second: string): string {
  return first > second ? first : second;
}

function dateInMonth(month: string, sourceDate?: string): string {
  const day = Math.max(1, Math.min(28, Number(sourceDate?.split('-')[2]) || 1));
  return `${month}-${String(day).padStart(2, '0')}`;
}

function currentMonth(): string {
  const now = new Date();
  return monthKey(now);
}

function monthLabel(month: string): string {
  const { year, monthIndex } = monthParts(month);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
    new Date(year, monthIndex, 1),
  );
}

function dateMonthKey(date?: string): string | null {
  if (!date) {
    return null;
  }

  const [year, month] = date.split('-');
  if (!year || !month) {
    return null;
  }

  return `${year}-${month.padStart(2, '0')}`;
}

function isMonthInRange(month: string, startDate?: string, endDate?: string): boolean {
  const startMonth = dateMonthKey(startDate);
  const endMonth = dateMonthKey(endDate);

  return (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth);
}

function entryMonthKey(entry: Pick<ExpenseEntry, 'date' | 'month'>): string {
  return dateMonthKey(entry.date) ?? entry.month;
}

function legacyExpenseType(entry: ExpenseEntry): string {
  return (entry as unknown as { type: string }).type;
}

function normalizedExpenseType(entry: ExpenseEntry): ExpenseType | 'investment' {
  const legacyType = legacyExpenseType(entry);
  if (legacyType === 'recurring') {
    return 'recurring';
  }

  if (legacyType === 'investment') {
    return 'investment';
  }

  return 'one-time';
}

function activeStartDate(startDate?: string, createdDate?: string): string | undefined {
  return startDate || createdDate;
}

function incomeMonthStartDate(month?: string): string | undefined {
  const monthKey = dateMonthKey(month);
  return monthKey ? monthStartDate(monthKey) : undefined;
}

function incomeBaseId(incomeId: string): string {
  return incomeId.replace(/(?::\d{4}-\d{2})+$/, '');
}

function yearPageStart(year: number): number {
  return year - (year % 16);
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DEFAULT_LOAN_EMI_CATEGORY: BudgetCategory = {
  id: 'category-loan-emi',
  name: 'Loan EMI',
  monthlyBudget: 0,
  color: '#4b5563',
  type: 'Expenses',
};

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
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTabsModule,
    MatTooltipModule,
    MatToolbarModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  private readonly dialog = inject(MatDialog);
  private readonly storagePrefix = 'budget-battowski';
  private readonly workspaceTabCount = 5;
  private authUnsubscribe?: () => void;
  private tabSwipeStart: { x: number; y: number } | null = null;
  private readonly unsubscribes: Array<() => void> = [];
  private readonly prefillAttemptedSignatures = new Set<string>();
  private readonly prefillInFlightSignatures = new Set<string>();
  private loanEmiCategoryUpsertInFlight = false;

  protected readonly firebase = initializeBudgetFirebase();
  private repository?: BudgetFirestoreRepository;
  protected readonly isSessionChecking = signal(this.firebase.mode === 'firebase');
  protected readonly isSyncing = signal(false);
  protected readonly syncStatus = signal(
    this.firebase.mode === 'firebase' ? 'Sign in with Google' : 'Firebase config needed',
  );
  protected readonly syncError = signal<string | null>(null);
  protected readonly workspaceId = signal<string | null>(null);
  protected readonly userName = signal<string | null>(null);
  protected readonly userEmail = signal<string | null>(null);
  protected readonly selectedMonth = signal(currentMonth());
  protected readonly monthPickerOpen = signal(false);
  protected readonly monthPickerView = signal<'months' | 'years'>('months');
  protected readonly pickerYear = signal(monthParts(this.selectedMonth()).year);
  protected readonly pickerYearPageStart = signal(yearPageStart(this.pickerYear()));
  protected readonly activeTabIndex = signal(0);
  protected readonly categories = signal<BudgetCategory[]>([]);
  protected readonly incomes = signal<IncomeSource[]>([]);
  protected readonly templates = signal<ExpenseTemplate[]>([]);
  protected readonly expenses = signal<ExpenseEntry[]>([]);
  protected readonly investments = signal<InvestmentEntry[]>([]);
  protected readonly loans = signal<Loan[]>([]);
  protected readonly importSummary = signal<BudgetImportSummary | null>(null);
  protected readonly processedImportFile = signal<{ blob: Blob; filename: string } | null>(null);

  protected readonly monthNames = MONTH_NAMES;
  protected readonly selectedMonthParts = computed(() => monthParts(this.selectedMonth()));
  protected readonly pickerYears = computed(() =>
    Array.from({ length: 16 }, (_, index) => this.pickerYearPageStart() + index),
  );
  protected readonly pickerYearRangeLabel = computed(
    () => `${this.pickerYearPageStart()} - ${this.pickerYearPageStart() + 15}`,
  );
  protected readonly hasBudgetData = computed(
    () =>
      this.categories().length +
        this.incomes().length +
        this.templates().length +
        this.expenses().length +
        this.investments().length +
        this.loans().length >
      0,
  );
  protected readonly showDashboardSkeleton = computed(
    () => this.isSyncing() && !this.hasBudgetData(),
  );
  protected readonly showGlobalLoader = computed(
    () => this.firebase.mode === 'firebase' && this.isSessionChecking(),
  );
  protected readonly canWrite = computed(
    () => this.firebase.mode !== 'firebase' || (!!this.workspaceId() && !this.isSyncing()),
  );
  protected readonly canReviewMonth = computed(() => this.selectedMonth() >= currentMonth());
  protected readonly monthlyReviewRows = computed(() =>
    this.canReviewMonth() ? this.buildMonthlyReviewRows(this.selectedMonth()) : [],
  );
  protected readonly hasMonthlyReviewRows = computed(() => this.monthlyReviewRows().length > 0);
  protected readonly expenseCategories = computed(() =>
    this.categories().filter((category) => this.categoryType(category) === 'Expenses'),
  );
  protected readonly incomeCategories = computed(() =>
    this.categories().filter((category) => this.categoryType(category) === 'Income'),
  );
  protected readonly investmentCategories = computed(() =>
    this.categories().filter((category) => this.categoryType(category) === 'Investments'),
  );
  protected readonly statusIcon = computed(() =>
    this.syncError()
      ? 'sync_problem'
      : this.isSyncing()
        ? 'sync'
        : this.firebase.mode === 'firebase' && this.workspaceId()
          ? 'cloud_done'
          : 'cloud_off',
  );
  protected readonly statusTone = computed(() =>
    this.syncError()
      ? 'danger'
      : this.firebase.mode === 'firebase' && this.workspaceId()
        ? 'success'
        : 'neutral',
  );
  protected readonly monthLabel = computed(() => monthLabel(this.selectedMonth()));
  protected readonly activeIncomeSources = computed(() => {
    const selectedMonth = this.selectedMonth();
    const activeIncomes = this.incomes().filter((income) => {
      const incomeMonth = income.month ? dateMonthKey(income.month) : null;
      const startDate = activeStartDate(
        income.startDate,
        incomeMonthStartDate(income.month) || income.createdDate,
      );

      return (
        (!incomeMonth || incomeMonth <= selectedMonth) &&
        isMonthInRange(selectedMonth, startDate, income.endDate)
      );
    });
    const monthScoped = activeIncomes.filter(
      (income) => dateMonthKey(income.month) === selectedMonth,
    );

    if (monthScoped.length) {
      return monthScoped;
    }

    const latestIncomeMonth = activeIncomes
      .map((income) => dateMonthKey(income.month))
      .filter((month): month is string => !!month && month <= selectedMonth)
      .sort()
      .at(-1);

    if (latestIncomeMonth) {
      return activeIncomes.filter((income) => dateMonthKey(income.month) === latestIncomeMonth);
    }

    return activeIncomes.filter((income) => !income.month);
  });
  protected readonly activeLoans = computed(() =>
    this.loans().filter(
      (loan) => loan.emi > 0 && isMonthInRange(this.selectedMonth(), loan.startDate, loan.endDate),
    ),
  );
  protected readonly monthlyIncome = computed(() =>
    this.activeIncomeSources().reduce(
      (total, income) => total + this.monthlyIncomeAmount(income),
      0,
    ),
  );
  protected readonly selectedEntries = computed(() =>
    this.expenses().filter(
      (expense) =>
        entryMonthKey(expense) === this.selectedMonth() &&
        normalizedExpenseType(expense) !== 'investment',
    ),
  );
  protected readonly selectedInvestments = computed(() =>
    this.investments().filter((investment) => {
      if (investment.frequency === 'recurring') {
        if (this.selectedMonth() >= currentMonth()) {
          return false;
        }

        return isMonthInRange(
          this.selectedMonth(),
          activeStartDate(investment.startDate, investment.date || investment.createdDate),
          investment.endDate,
        );
      }

      return (
        dateMonthKey(investment.date || investment.startDate || investment.createdDate) ===
          this.selectedMonth() &&
        isMonthInRange(
          this.selectedMonth(),
          investment.date || investment.startDate || investment.createdDate,
          investment.endDate,
        )
      );
    }),
  );
  protected readonly legacyInvestmentEntries = computed(() =>
    this.expenses().filter(
      (expense) =>
        entryMonthKey(expense) === this.selectedMonth() &&
        legacyExpenseType(expense) === 'investment',
    ),
  );
  protected readonly recurringTotal = computed(() => this.totalByType('recurring'));
  protected readonly oneTimeTotal = computed(() => this.totalByType('one-time'));
  protected readonly investmentTotal = computed(
    () =>
      this.selectedInvestments().reduce((total, investment) => total + investment.amount, 0) +
      this.legacyInvestmentEntries().reduce((total, expense) => total + expense.amount, 0),
  );
  protected readonly outflowTotal = computed(() =>
    this.selectedEntries().reduce((total, expense) => total + expense.amount, 0),
  );
  protected readonly remainingFunds = computed(
    () => this.monthlyIncome() - this.outflowTotal() - this.investmentTotal(),
  );
  protected readonly burnoutRatio = computed(() =>
    this.ratio(this.outflowTotal(), this.monthlyIncome()),
  );
  protected readonly savingsRatio = computed(() =>
    this.ratio(this.investmentTotal() + Math.max(0, this.remainingFunds()), this.monthlyIncome()),
  );
  protected readonly debtEmiTotal = computed(() =>
    this.activeLoans().reduce((total, loan) => total + loan.emi, 0),
  );
  protected readonly debtRatio = computed(() =>
    this.ratio(this.debtEmiTotal(), this.monthlyIncome()),
  );
  protected readonly categoryStats = computed(() =>
    this.expenseCategories().map((category) => {
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
      const entries = this.expenses().filter(
        (expense) =>
          entryMonthKey(expense) === month &&
          ((expense as ExpenseEntry & { type: string }).type === 'recurring' ||
            (expense as ExpenseEntry & { type: string }).type === 'one-time'),
      );
      const outflow = entries.reduce((total, expense) => total + expense.amount, 0);
      const invested =
        this.investments()
          .filter((investment) =>
            investment.frequency === 'recurring'
              ? month < currentMonth() &&
                isMonthInRange(
                  month,
                  activeStartDate(investment.startDate, investment.date || investment.createdDate),
                  investment.endDate,
                )
              : dateMonthKey(investment.date || investment.startDate || investment.createdDate) ===
                month,
          )
          .reduce((total, investment) => total + investment.amount, 0) +
        this.expenses()
          .filter(
            (expense) =>
              entryMonthKey(expense) === month && legacyExpenseType(expense) === 'investment',
          )
          .reduce((total, expense) => total + expense.amount, 0);

      return {
        month,
        label: monthLabel(month),
        outflow,
        invested,
        remaining: this.monthlyIncome() - outflow - invested,
        burn: this.ratio(outflow, this.monthlyIncome()),
      };
    });
  });
  protected readonly loanPlans = computed(() =>
    this.loans().map((loan) => {
      const monthsLeft = Math.max(1, Math.ceil(loan.outstanding / loan.emi));
      const payoff = loan.endDate ? new Date(loan.endDate) : new Date();
      if (!loan.endDate) {
        payoff.setMonth(payoff.getMonth() + monthsLeft);
      }

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
      ideas.push('Create your first category before adding expenses or recurring expenses.');
    }

    if (ideas.length === 0) {
      ideas.push(
        'The month is balanced. Keep recurring templates updated so future entries stay painless.',
      );
    }

    return ideas;
  });
  protected readonly leadingCategory = computed(() => {
    const [category] = [...this.categoryStats()].sort((a, b) => b.spent - a.spent);
    return category ?? null;
  });
  protected readonly runwayLabel = computed(() => {
    if (this.monthlyIncome() <= 0) {
      return 'Add income';
    }

    const ratio = this.remainingFunds() / this.monthlyIncome();
    if (ratio < 0) {
      return 'Over plan';
    }

    if (ratio < 0.12) {
      return 'Tight runway';
    }

    return 'Healthy runway';
  });

  constructor() {
    this.clearLegacyLocalData();
    effect(() => {
      if (!this.canWrite()) {
        return;
      }

      void this.ensureMonthDefaults();
    });
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

  protected openMonthPicker(): void {
    const { year } = this.selectedMonthParts();
    this.pickerYear.set(year);
    this.pickerYearPageStart.set(yearPageStart(year));
    this.monthPickerView.set('months');
    this.monthPickerOpen.set(true);
  }

  protected closeMonthPicker(): void {
    this.monthPickerOpen.set(false);
  }

  protected showYearPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.monthPickerView.set('years');
    this.pickerYearPageStart.set(yearPageStart(this.pickerYear()));
  }

  protected shiftMonthPicker(event: MouseEvent, offset: number): void {
    event.stopPropagation();

    if (this.monthPickerView() === 'years') {
      this.pickerYearPageStart.update((start) => start + offset * 16);
      return;
    }

    this.pickerYear.update((year) => year + offset);
  }

  protected selectPickerYear(event: MouseEvent, year: number): void {
    event.stopPropagation();
    this.pickerYear.set(year);
    this.monthPickerView.set('months');
  }

  protected selectPickerMonth(monthIndex: number, trigger: MatMenuTrigger): void {
    this.selectedMonth.set(monthKeyFromParts(this.pickerYear(), monthIndex));
    trigger.closeMenu();
  }

  protected moveMonth(offset: number): void {
    this.selectedMonth.update((month) => addMonths(month, offset));
  }

  protected setActiveTab(index: number): void {
    this.activeTabIndex.set(Math.max(0, Math.min(this.workspaceTabCount - 1, index)));
  }

  protected startTabSwipe(event: TouchEvent): void {
    if (
      event.touches.length !== 1 ||
      !this.isMobileViewport() ||
      this.isSwipeIgnoredTarget(event.target)
    ) {
      this.tabSwipeStart = null;
      return;
    }

    const [touch] = event.touches;
    this.tabSwipeStart = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  protected finishTabSwipe(event: TouchEvent): void {
    const start = this.tabSwipeStart;
    this.tabSwipeStart = null;

    if (!start || !this.isMobileViewport() || event.changedTouches.length !== 1) {
      return;
    }

    const [touch] = event.changedTouches;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const isHorizontalSwipe = Math.abs(deltaX) >= 58 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4;

    if (!isHorizontalSwipe) {
      return;
    }

    this.setActiveTab(this.activeTabIndex() + (deltaX < 0 ? 1 : -1));
  }

  protected cancelTabSwipe(): void {
    this.tabSwipeStart = null;
  }

  protected async downloadImportTemplate(): Promise<void> {
    this.downloadBlob(
      await createBudgetImportTemplateWorkbook(),
      'budget-battowski-import-template.xlsx',
    );
  }

  protected downloadProcessedImport(): void {
    const processedFile = this.processedImportFile();
    if (!processedFile) {
      return;
    }

    this.downloadBlob(processedFile.blob, processedFile.filename);
  }

  protected async importBudgetFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      const parsed = await parseBudgetImportFile(file, this.categories());
      const validRows = parsed.rows.filter(
        (row) => row.status !== 'error' && row.record && row.collectionName,
      );

      if (validRows.length) {
        const saved = await this.applyImportRows(validRows);
        if (!saved) {
          for (const row of validRows) {
            row.status = 'error';
            row.comments.push('Could not save this row. Check sync status and retry.');
          }
        }
      }

      for (const row of parsed.rows) {
        if (row.status === 'pending') {
          row.status = 'success';
          row.comments.push(`Imported into ${row.collectionName}.`);
        }
      }

      this.processedImportFile.set({
        blob: await buildProcessedImportWorkbook(parsed.rows),
        filename: 'budget-battowski-import-results.xlsx',
      });
      const summary = summarizeImportRows(parsed.rows);
      this.importSummary.set(summary);
      this.syncStatus.set(
        summary.error
          ? `Import finished with ${summary.error} row issue${summary.error === 1 ? '' : 's'}`
          : `Imported ${summary.success} row${summary.success === 1 ? '' : 's'}`,
      );
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Unable to import budget file.',
      );
    } finally {
      this.isSyncing.set(false);
    }
  }

  protected openBulkEditor(scope: BulkEditorScope, initialTabIndex = 0): void {
    const dialogRef = this.dialog.open(BulkEditorDialog, {
      autoFocus: false,
      data: {
        scope,
        initialTabIndex,
        selectedMonth: this.selectedMonth(),
        categories: this.categories(),
        incomes: this.incomes(),
        templates: this.templates(),
        expenses: this.expenses(),
        investments: this.investments(),
        loans: this.loans(),
      },
      maxHeight: '100dvh',
      maxWidth: '98vw',
      panelClass: 'bulk-editor-panel',
      width: 'min(1540px, 98vw)',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        void this.applyBulkChanges(result);
      }
    });
  }

  protected openMonthlyReview(): void {
    if (!this.canReviewMonth()) {
      this.syncStatus.set('Review is available for current and future months only');
      return;
    }

    const dialogRef = this.dialog.open(MonthlyReviewDialog, {
      autoFocus: false,
      data: {
        monthLabel: this.monthLabel(),
        rows: this.monthlyReviewRows(),
      },
      maxHeight: '96dvh',
      maxWidth: '96vw',
      panelClass: 'monthly-review-panel',
      width: 'min(980px, 96vw)',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        void this.applyMonthlyReview(result);
      }
    });
  }

  private buildMonthlyReviewRows(month: string): MonthlyReviewRow[] {
    const existingExpensesByTemplateId = new Map(
      this.expenses()
        .filter((expense) => entryMonthKey(expense) === month && expense.templateId)
        .map((expense) => [expense.templateId!, expense]),
    );
    const expenseRows = this.templates()
      .filter((template) => !this.isTemplateMonthSkipped(template, month))
      .map((template) => this.templateVersionForMonth(template, month))
      .filter((template): template is ExpenseTemplate => !!template)
      .filter((template) => !existingExpensesByTemplateId.has(template.id))
      .map<MonthlyReviewRow>((template) => {
        return {
          id: `expense:${template.id}`,
          sourceId: template.id,
          sourceType: 'expense',
          label: template.name,
          categoryName: this.categoryName(template.categoryId),
          amount: template.amount,
        };
      });

    const existingInvestmentsByPlanId = new Map(
      this.investments()
        .filter(
          (investment) =>
            investment.frequency === 'one-time' &&
            dateMonthKey(investment.date || investment.startDate || investment.createdDate) ===
              month &&
            investment.sourceInvestmentId,
        )
        .map((investment) => [investment.sourceInvestmentId!, investment]),
    );
    const investmentRows = this.investments()
      .filter(
        (investment) =>
          investment.frequency === 'recurring' &&
          !existingInvestmentsByPlanId.has(investment.id) &&
          !this.investments().some(
            (record) => record.id === this.reviewedInvestmentId(investment.id, month),
          ) &&
          !this.isInvestmentMonthSkipped(investment, month) &&
          isMonthInRange(
            month,
            activeStartDate(investment.startDate, investment.date || investment.createdDate),
            investment.endDate,
          ),
      )
      .map<MonthlyReviewRow>((investment) => {
        return {
          id: `investment:${investment.id}`,
          sourceId: investment.id,
          sourceType: 'investment',
          label: investment.name,
          categoryName: investment.categoryId
            ? this.categoryName(investment.categoryId)
            : 'Investments',
          amount: investment.amount,
        };
      });

    return [...expenseRows, ...investmentRows];
  }

  private async applyMonthlyReview(result: MonthlyReviewResult): Promise<void> {
    const month = this.selectedMonth();
    if (month < currentMonth()) {
      this.syncStatus.set('Review is available for current and future months only');
      return;
    }

    const templatesById = new Map(this.templates().map((template) => [template.id, template]));
    const expensesByTemplateId = new Map(
      this.expenses()
        .filter((expense) => entryMonthKey(expense) === month && expense.templateId)
        .map((expense) => [expense.templateId!, expense]),
    );
    const investmentsById = new Map(
      this.investments().map((investment) => [investment.id, investment]),
    );
    const approvedExpenses: ExpenseEntry[] = [];
    const approvedInvestments: InvestmentEntry[] = [];
    const deletedExpenseIds = new Set<string>();
    const deletedInvestmentIds = new Set<string>();

    let templates = this.templates();
    let investments = this.investments();

    for (const row of result.rows) {
      if (row.sourceType === 'expense') {
        const template = templatesById.get(row.sourceId);
        const effectiveTemplate = template ? this.templateVersionForMonth(template, month) : null;
        const existing = expensesByTemplateId.get(row.sourceId);

        if (!template || !effectiveTemplate) {
          continue;
        }

        if (row.pendingDelete) {
          templates = templates.map((item) =>
            item.id === row.sourceId ? this.withSkippedTemplateMonth(item, month) : item,
          );
          if (existing) {
            deletedExpenseIds.add(existing.id);
          }
          continue;
        }

        approvedExpenses.push({
          ...this.expenseFromTemplate(effectiveTemplate, month, existing),
          amount: row.amount,
        });
        continue;
      }

      const plan = investmentsById.get(row.sourceId);
      if (!plan || plan.frequency !== 'recurring') {
        continue;
      }

      const existing =
        this.investments().find(
          (investment) =>
            investment.sourceInvestmentId === plan.id &&
            dateMonthKey(investment.date || investment.startDate || investment.createdDate) ===
              month,
        ) ??
        this.investments().find(
          (investment) => investment.id === this.reviewedInvestmentId(plan.id, month),
        );

      if (row.pendingDelete) {
        investments = investments.map((item) =>
          item.id === plan.id ? this.withSkippedInvestmentMonth(item, month) : item,
        );
        if (existing) {
          deletedInvestmentIds.add(existing.id);
        }
        continue;
      }

      approvedInvestments.push({
        id: existing?.id ?? this.reviewedInvestmentId(plan.id, month),
        name: plan.name,
        amount: row.amount,
        categoryId: plan.categoryId,
        frequency: 'one-time',
        date: dateInMonth(month, activeStartDate(plan.startDate, plan.date || plan.createdDate)),
        notes: plan.notes || 'Approved from recurring investment plan',
        createdDate: existing?.createdDate || new Date().toISOString(),
        sourceInvestmentId: plan.id,
        auditTrail: existing?.auditTrail ?? [],
      });
    }

    const approvedExpenseIds = new Set(approvedExpenses.map((expense) => expense.id));
    const approvedInvestmentIds = new Set(approvedInvestments.map((investment) => investment.id));
    const expenses = [
      ...this.expenses().filter(
        (expense) => !deletedExpenseIds.has(expense.id) && !approvedExpenseIds.has(expense.id),
      ),
      ...approvedExpenses,
    ];
    investments = [
      ...investments.filter(
        (investment) =>
          !deletedInvestmentIds.has(investment.id) && !approvedInvestmentIds.has(investment.id),
      ),
      ...approvedInvestments,
    ];

    const saved = await this.runFirebaseWrite(
      async () => {
        await Promise.all([
          ...[...deletedExpenseIds].map((recordId) =>
            this.repository?.delete('expenses', recordId),
          ),
          ...[...deletedInvestmentIds].map((recordId) =>
            this.repository?.delete('investments', recordId),
          ),
        ]);
        await Promise.all([
          this.repository?.upsertMany('templates', templates),
          this.repository?.upsertMany('expenses', expenses),
          this.repository?.upsertMany('investments', investments),
        ]);
      },
      () => {
        this.templates.set(templates);
        this.expenses.set(expenses);
        this.investments.set(investments);
      },
    );

    if (saved) {
      this.syncStatus.set(
        this.repository ? 'Monthly review saved to Firebase' : 'Monthly review saved',
      );
    }
  }

  private async applyImportRows(rows: BudgetImportRow[]): Promise<boolean> {
    const records = {
      categories: rows
        .filter((row) => row.collectionName === 'categories')
        .map((row) => row.record as BudgetCategory),
      incomes: rows
        .filter((row) => row.collectionName === 'incomes')
        .map((row) => row.record as IncomeSource),
      templates: rows
        .filter((row) => row.collectionName === 'templates')
        .map((row) => row.record as ExpenseTemplate),
      expenses: rows
        .filter((row) => row.collectionName === 'expenses')
        .map((row) => row.record as ExpenseEntry),
      investments: rows
        .filter((row) => row.collectionName === 'investments')
        .map((row) => row.record as InvestmentEntry),
      loans: rows.filter((row) => row.collectionName === 'loans').map((row) => row.record as Loan),
    } satisfies { [TName in BudgetCollectionName]: BudgetDataMap[TName][] };

    return this.runFirebaseWrite(
      async () => {
        await Promise.all([
          this.repository?.upsertMany('categories', records.categories),
          this.repository?.upsertMany('incomes', records.incomes),
          this.repository?.upsertMany('templates', records.templates),
          this.repository?.upsertMany('expenses', records.expenses),
          this.repository?.upsertMany('investments', records.investments),
          this.repository?.upsertMany('loans', records.loans),
        ]);
      },
      () => {
        this.categories.update((items) =>
          this.withDefaultCategories([...items, ...records.categories]),
        );
        this.incomes.update((items) => [...items, ...records.incomes]);
        this.templates.update((items) => [...items, ...records.templates]);
        this.expenses.update((items) => [...items, ...records.expenses]);
        this.investments.update((items) => [...items, ...records.investments]);
        this.loans.update((items) => [...items, ...records.loans]);
      },
    );
  }

  private downloadCsv(csv: string, filename: string): void {
    this.downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async ensureMonthDefaults(): Promise<void> {
    const month = this.selectedMonth();
    const newEntries = this.buildDefaultMonthEntries(month);

    if (!newEntries.length) {
      return;
    }

    const signature = `${month}:${newEntries
      .map((entry) => entry.templateId)
      .sort()
      .join('|')}`;

    if (
      this.prefillAttemptedSignatures.has(signature) ||
      this.prefillInFlightSignatures.has(signature)
    ) {
      return;
    }

    this.prefillInFlightSignatures.add(signature);

    try {
      const saved = await this.saveRecords('expenses', newEntries, () =>
        this.expenses.update((items) => [...items, ...newEntries]),
      );
      if (saved) {
        this.prefillAttemptedSignatures.add(signature);
      }
    } finally {
      this.prefillInFlightSignatures.delete(signature);
    }
  }

  private buildDefaultMonthEntries(month: string): ExpenseEntry[] {
    const existingTemplateIds = new Set(
      this.expenses()
        .filter((expense) => entryMonthKey(expense) === month && expense.templateId)
        .map((expense) => expense.templateId),
    );

    const templateEntries =
      month < currentMonth()
        ? this.templates()
            .filter(
              (template) =>
                !existingTemplateIds.has(template.id) &&
                !this.isTemplateMonthSkipped(template, month),
            )
            .map((template) => this.templateVersionForMonth(template, month))
            .filter((template): template is ExpenseTemplate => !!template)
            .map<ExpenseEntry>((template) => this.expenseFromTemplate(template, month))
        : [];

    const loanEntries = this.loans()
      .filter((loan) => {
        const templateId = this.loanTemplateId(loan.id);
        return (
          loan.emi > 0 &&
          !existingTemplateIds.has(templateId) &&
          isMonthInRange(month, loan.startDate, loan.endDate)
        );
      })
      .map<ExpenseEntry>((loan) => ({
        id: id('emi'),
        month,
        date: dateInMonth(month, loan.startDate),
        name: this.loanExpenseName(loan),
        categoryId: this.loanEmiCategoryId(),
        amount: loan.emi,
        type: 'recurring',
        note: 'Prepopulated from loan EMI',
        templateId: this.loanTemplateId(loan.id),
      }));

    return [...templateEntries, ...loanEntries];
  }

  protected categoryName(categoryId: string): string {
    if (categoryId === DEFAULT_LOAN_EMI_CATEGORY.id || categoryId === '__loan_emi__') {
      return 'Loan EMI';
    }

    return (
      this.categories().find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
    );
  }

  protected formatMoney(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  protected expenseTypeLabel(expense: ExpenseEntry): ExpenseType {
    return normalizedExpenseType(expense) === 'recurring' ? 'recurring' : 'one-time';
  }

  private monthlyIncomeAmount(income: IncomeSource): number {
    if (income.cadence === 'one-time') {
      const incomeMonth = income.month ?? dateMonthKey(income.startDate || income.createdDate);
      return incomeMonth === this.selectedMonth() ? income.amount : 0;
    }

    const cadenceMultipliers: Record<Cadence, number> = {
      daily: 365 / 12,
      weekly: 52 / 12,
      'bi-weekly': 26 / 12,
      monthly: 1,
      quarterly: 1 / 3,
      'half-yearly': 1 / 6,
      annual: 1 / 12,
      'one-time': 1,
      variable: 1,
    };

    return income.amount * cadenceMultipliers[income.cadence];
  }

  private loanEmiCategoryId(categories = this.categories()): string {
    return this.findLoanEmiCategory(categories)?.id ?? DEFAULT_LOAN_EMI_CATEGORY.id;
  }

  private findLoanEmiCategory(categories: BudgetCategory[]): BudgetCategory | undefined {
    return categories.find(
      (category) =>
        category.id === DEFAULT_LOAN_EMI_CATEGORY.id ||
        category.name.trim().toLowerCase() === DEFAULT_LOAN_EMI_CATEGORY.name.toLowerCase(),
    );
  }

  private withDefaultCategories(categories: BudgetCategory[]): BudgetCategory[] {
    const normalized = categories.map((category) => ({
      ...category,
      type: this.categoryType(category),
    }));

    if (this.findLoanEmiCategory(normalized)) {
      return normalized;
    }

    return [...normalized, DEFAULT_LOAN_EMI_CATEGORY].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  private categoryType(category: BudgetCategory): NonNullable<BudgetCategory['type']> {
    return category.type ?? 'Expenses';
  }

  private ensureDefaultCategoryRecord(categories: BudgetCategory[]): void {
    if (
      !this.repository ||
      this.findLoanEmiCategory(categories) ||
      this.loanEmiCategoryUpsertInFlight
    ) {
      return;
    }

    this.loanEmiCategoryUpsertInFlight = true;
    void this.repository
      .upsert('categories', DEFAULT_LOAN_EMI_CATEGORY)
      .catch((error: unknown) =>
        this.handleSyncError(
          error instanceof Error ? error.message : 'Unable to create Loan EMI category.',
        ),
      )
      .finally(() => {
        this.loanEmiCategoryUpsertInFlight = false;
      });
  }

  private expenseFromTemplate(
    template: ExpenseTemplate,
    month: string,
    existing?: ExpenseEntry,
  ): ExpenseEntry {
    return {
      id: existing?.id ?? id('planned'),
      month,
      date: dateInMonth(month, template.startDate),
      name: template.name,
      categoryId: template.categoryId,
      amount: template.amount,
      type: 'recurring',
      note: existing?.note || 'Prepopulated from recurring plan',
      templateId: template.id,
    };
  }

  private templateVersionForMonth(
    template: ExpenseTemplate,
    month: string,
  ): ExpenseTemplate | null {
    if (
      template.archivedDate &&
      template.endDate &&
      month > (dateMonthKey(template.endDate) ?? '')
    ) {
      return null;
    }

    const auditVersion = (template.auditTrail ?? []).find(
      (audit) =>
        audit.operation !== 'deleted' &&
        isMonthInRange(
          month,
          audit.effectiveStartDate || audit.startDate,
          audit.effectiveEndDate || audit.endDate,
        ),
    );

    if (auditVersion) {
      return {
        ...template,
        name: auditVersion.name,
        categoryId: auditVersion.categoryId,
        amount: auditVersion.amount,
        startDate: auditVersion.effectiveStartDate || auditVersion.startDate,
        endDate: auditVersion.effectiveEndDate || auditVersion.endDate,
      };
    }

    if (
      isMonthInRange(
        month,
        activeStartDate(template.startDate, template.createdDate),
        template.endDate,
      )
    ) {
      return template;
    }

    return null;
  }

  private isTemplateChanged(previous: ExpenseTemplate | undefined, next: ExpenseTemplate): boolean {
    return (
      !previous ||
      previous.amount !== next.amount ||
      (previous.startDate || '') !== (next.startDate || '') ||
      (previous.endDate || '') !== (next.endDate || '')
    );
  }

  private auditVersionFromTemplate(
    template: ExpenseTemplate,
    operation: ExpenseTemplateAuditVersion['operation'],
    effectiveEndDate: string | undefined,
  ): ExpenseTemplateAuditVersion {
    return {
      id: id('audit'),
      operation,
      recordedDate: new Date().toISOString(),
      effectiveStartDate: activeStartDate(template.startDate, template.createdDate),
      effectiveEndDate,
      name: template.name,
      categoryId: template.categoryId,
      amount: template.amount,
      startDate: template.startDate,
      endDate: template.endDate,
    };
  }

  private hasMatchingTemplateAudit(
    auditTrail: ExpenseTemplateAuditVersion[] | undefined,
    auditVersion: ExpenseTemplateAuditVersion,
  ): boolean {
    return (auditTrail ?? []).some(
      (audit) =>
        audit.operation === auditVersion.operation &&
        (audit.effectiveStartDate || '') === (auditVersion.effectiveStartDate || '') &&
        (audit.effectiveEndDate || '') === (auditVersion.effectiveEndDate || '') &&
        audit.name === auditVersion.name &&
        audit.categoryId === auditVersion.categoryId &&
        audit.amount === auditVersion.amount &&
        (audit.startDate || '') === (auditVersion.startDate || '') &&
        (audit.endDate || '') === (auditVersion.endDate || ''),
    );
  }

  private createdAuditVersion(template: ExpenseTemplate): ExpenseTemplateAuditVersion {
    return {
      id: id('audit'),
      operation: 'created',
      recordedDate: new Date().toISOString(),
      effectiveStartDate: activeStartDate(template.startDate, template.createdDate),
      name: template.name,
      categoryId: template.categoryId,
      amount: template.amount,
      startDate: template.startDate,
      endDate: template.endDate,
    };
  }

  private normalizeMonthlyTemplate(
    template: ExpenseTemplate,
    previous: ExpenseTemplate | undefined,
    selectedMonth: string,
  ): ExpenseTemplate {
    if (!previous) {
      return {
        ...template,
        startDate: template.startDate || monthStartDate(selectedMonth),
        auditTrail: template.auditTrail ?? [],
      };
    }

    const immutableTemplate = {
      ...template,
      name: previous.name,
      categoryId: previous.categoryId,
    };

    if (!this.isTemplateChanged(previous, immutableTemplate)) {
      return {
        ...immutableTemplate,
        createdDate: previous.createdDate || template.createdDate,
        auditTrail: previous.auditTrail ?? template.auditTrail ?? [],
      };
    }

    const selectedStartDate = monthStartDate(selectedMonth);
    const effectiveStartDate = laterDate(
      immutableTemplate.startDate || selectedStartDate,
      selectedStartDate,
    );
    const effectiveEndDate = previousDate(effectiveStartDate);
    const auditVersion = this.auditVersionFromTemplate(previous, 'updated', effectiveEndDate);
    const auditTrail = this.hasMatchingTemplateAudit(previous.auditTrail, auditVersion)
      ? (previous.auditTrail ?? [])
      : [...(previous.auditTrail ?? []), auditVersion];

    return {
      ...immutableTemplate,
      createdDate: previous.createdDate || template.createdDate,
      startDate: effectiveStartDate,
      auditTrail,
    };
  }

  private isTemplateMonthSkipped(template: ExpenseTemplate, month: string): boolean {
    return (template.skippedMonths ?? []).includes(month);
  }

  private withSkippedTemplateMonth(template: ExpenseTemplate, month: string): ExpenseTemplate {
    if (this.isTemplateMonthSkipped(template, month)) {
      return template;
    }

    return {
      ...template,
      skippedMonths: [...(template.skippedMonths ?? []), month].sort(),
    };
  }

  private isInvestmentMonthSkipped(investment: InvestmentEntry, month: string): boolean {
    return (investment.skippedMonths ?? []).includes(month);
  }

  private withSkippedInvestmentMonth(investment: InvestmentEntry, month: string): InvestmentEntry {
    if (this.isInvestmentMonthSkipped(investment, month)) {
      return investment;
    }

    return {
      ...investment,
      skippedMonths: [...(investment.skippedMonths ?? []), month].sort(),
    };
  }

  private reviewedInvestmentId(investmentId: string, month: string): string {
    return `review:${investmentId}:${month}`;
  }

  private loanTemplateId(loanId: string): string {
    return `loan:${loanId}`;
  }

  private loanExpenseName(loan: Pick<Loan, 'lender' | 'loanType'>): string {
    return [loan.lender, loan.loanType].filter(Boolean).join(' - ') || 'Loan EMI';
  }

  private normalizeIncomeRecord(
    income: IncomeSource,
    previous: IncomeSource | undefined,
    operationMonth: string,
  ): IncomeSource {
    if (!previous) {
      return {
        ...income,
        auditTrail: income.auditTrail ?? [],
      };
    }

    const immutableIncome = {
      ...income,
      source: previous.source,
      cadence: previous.cadence,
      createdDate: previous.createdDate || income.createdDate,
    };

    if (!this.isIncomeChanged(previous, immutableIncome)) {
      return {
        ...immutableIncome,
        auditTrail: previous.auditTrail ?? income.auditTrail ?? [],
      };
    }

    const effectiveStartDate = laterDate(
      immutableIncome.startDate ||
        previous.startDate ||
        incomeMonthStartDate(previous.month) ||
        incomeMonthStartDate(immutableIncome.month) ||
        monthStartDate(operationMonth),
      monthStartDate(operationMonth),
    );
    const auditVersion = this.auditVersionFromIncome(
      previous,
      'updated',
      previousDate(effectiveStartDate),
    );

    return {
      ...immutableIncome,
      month: immutableIncome.month || dateMonthKey(effectiveStartDate) || operationMonth,
      startDate: effectiveStartDate,
      auditTrail: this.appendIncomeAudit(previous.auditTrail, auditVersion),
    };
  }

  private closeIncomeRecord(previous: IncomeSource, operationMonth: string): IncomeSource {
    const effectiveEndDate = monthEndDate(operationMonth);
    if (previous.endDate && (dateMonthKey(previous.endDate) ?? '') <= operationMonth) {
      return previous;
    }

    const nextMonth = addMonths(operationMonth, 1);
    const auditVersion = this.auditVersionFromIncome(previous, 'deleted', effectiveEndDate);

    return {
      ...previous,
      endDate:
        previous.endDate && dateMonthKey(previous.endDate)! < nextMonth
          ? previous.endDate
          : effectiveEndDate,
      auditTrail: this.appendIncomeAudit(previous.auditTrail, auditVersion),
    };
  }

  private normalizeInvestmentRecord(
    investment: InvestmentEntry,
    previous: InvestmentEntry | undefined,
    operationMonth: string,
  ): InvestmentEntry {
    if (!previous) {
      return {
        ...investment,
        auditTrail: investment.auditTrail ?? [],
      };
    }

    const immutableInvestment = {
      ...investment,
      name: previous.name,
      createdDate: previous.createdDate || investment.createdDate,
    };

    if (!this.isInvestmentChanged(previous, immutableInvestment)) {
      return {
        ...immutableInvestment,
        auditTrail: previous.auditTrail ?? investment.auditTrail ?? [],
      };
    }

    const effectiveStartDate = laterDate(
      immutableInvestment.startDate ||
        immutableInvestment.date ||
        previous.startDate ||
        previous.date ||
        monthStartDate(operationMonth),
      monthStartDate(operationMonth),
    );
    const auditVersion = this.auditVersionFromInvestment(
      previous,
      'updated',
      previousDate(effectiveStartDate),
    );

    return {
      ...immutableInvestment,
      startDate: immutableInvestment.frequency === 'recurring' ? effectiveStartDate : undefined,
      date:
        immutableInvestment.frequency === 'one-time'
          ? effectiveStartDate
          : immutableInvestment.date,
      auditTrail: this.appendInvestmentAudit(previous.auditTrail, auditVersion),
    };
  }

  private closeInvestmentRecord(
    previous: InvestmentEntry,
    operationMonth: string,
  ): InvestmentEntry {
    const effectiveEndDate = monthEndDate(operationMonth);
    if (previous.endDate && (dateMonthKey(previous.endDate) ?? '') <= operationMonth) {
      return previous;
    }

    const nextMonth = addMonths(operationMonth, 1);
    const auditVersion = this.auditVersionFromInvestment(previous, 'deleted', effectiveEndDate);

    return {
      ...previous,
      endDate:
        previous.endDate && dateMonthKey(previous.endDate)! < nextMonth
          ? previous.endDate
          : effectiveEndDate,
      auditTrail: this.appendInvestmentAudit(previous.auditTrail, auditVersion),
    };
  }

  private normalizeLoanRecord(
    loan: Loan,
    previous: Loan | undefined,
    operationMonth: string,
  ): Loan {
    if (!previous) {
      return {
        ...loan,
        auditTrail: loan.auditTrail ?? [],
      };
    }

    const immutableLoan = {
      ...loan,
      lender: previous.lender,
      loanType: previous.loanType,
    };

    if (!this.isLoanChanged(previous, immutableLoan)) {
      return {
        ...immutableLoan,
        auditTrail: previous.auditTrail ?? loan.auditTrail ?? [],
      };
    }

    const effectiveStartDate =
      immutableLoan.startDate || previous.startDate || monthStartDate(operationMonth);
    const auditEndDate = previousDate(
      laterDate(effectiveStartDate, monthStartDate(operationMonth)),
    );
    const auditVersion = this.auditVersionFromLoan(previous, 'updated', auditEndDate);

    return {
      ...immutableLoan,
      startDate: effectiveStartDate,
      auditTrail: this.appendLoanAudit(previous.auditTrail, auditVersion),
    };
  }

  private closeLoanRecord(previous: Loan, operationMonth: string): Loan {
    const effectiveEndDate = monthEndDate(operationMonth);
    if (previous.endDate && (dateMonthKey(previous.endDate) ?? '') <= operationMonth) {
      return previous;
    }

    const nextMonth = addMonths(operationMonth, 1);
    const auditVersion = this.auditVersionFromLoan(previous, 'deleted', effectiveEndDate);

    return {
      ...previous,
      endDate:
        previous.endDate && dateMonthKey(previous.endDate)! < nextMonth
          ? previous.endDate
          : effectiveEndDate,
      auditTrail: this.appendLoanAudit(previous.auditTrail, auditVersion),
    };
  }

  private isIncomeChanged(previous: IncomeSource, next: IncomeSource): boolean {
    return (
      previous.amount !== next.amount ||
      (previous.categoryId || '') !== (next.categoryId || '') ||
      (previous.notes || '') !== (next.notes || '') ||
      (previous.month || '') !== (next.month || '') ||
      (previous.startDate || '') !== (next.startDate || '') ||
      (previous.endDate || '') !== (next.endDate || '')
    );
  }

  private isInvestmentChanged(previous: InvestmentEntry, next: InvestmentEntry): boolean {
    return (
      previous.amount !== next.amount ||
      (previous.categoryId || '') !== (next.categoryId || '') ||
      previous.frequency !== next.frequency ||
      (previous.date || '') !== (next.date || '') ||
      (previous.startDate || '') !== (next.startDate || '') ||
      (previous.endDate || '') !== (next.endDate || '') ||
      (previous.notes || '') !== (next.notes || '')
    );
  }

  private isLoanChanged(previous: Loan, next: Loan): boolean {
    return (
      previous.principal !== next.principal ||
      previous.outstanding !== next.outstanding ||
      previous.annualRate !== next.annualRate ||
      previous.emi !== next.emi ||
      (previous.startDate || '') !== (next.startDate || '') ||
      (previous.endDate || '') !== (next.endDate || '') ||
      (previous.notes || '') !== (next.notes || '')
    );
  }

  private auditVersionFromIncome(
    income: IncomeSource,
    operation: IncomeAuditVersion['operation'],
    effectiveEndDate: string | undefined,
  ): IncomeAuditVersion {
    return {
      id: id('audit'),
      operation,
      recordedDate: new Date().toISOString(),
      effectiveStartDate: activeStartDate(
        income.startDate,
        incomeMonthStartDate(income.month) || income.createdDate,
      ),
      effectiveEndDate,
      source: income.source,
      amount: income.amount,
      cadence: income.cadence,
      categoryId: income.categoryId,
      notes: income.notes,
      month: income.month,
      startDate: income.startDate,
      endDate: income.endDate,
    };
  }

  private auditVersionFromInvestment(
    investment: InvestmentEntry,
    operation: InvestmentAuditVersion['operation'],
    effectiveEndDate: string | undefined,
  ): InvestmentAuditVersion {
    return {
      id: id('audit'),
      operation,
      recordedDate: new Date().toISOString(),
      effectiveStartDate: activeStartDate(
        investment.startDate,
        investment.date || investment.createdDate,
      ),
      effectiveEndDate,
      name: investment.name,
      amount: investment.amount,
      categoryId: investment.categoryId,
      frequency: investment.frequency,
      date: investment.date,
      startDate: investment.startDate,
      endDate: investment.endDate,
      notes: investment.notes,
    };
  }

  private auditVersionFromLoan(
    loan: Loan,
    operation: LoanAuditVersion['operation'],
    effectiveEndDate: string | undefined,
  ): LoanAuditVersion {
    return {
      id: id('audit'),
      operation,
      recordedDate: new Date().toISOString(),
      effectiveStartDate: loan.startDate,
      effectiveEndDate,
      lender: loan.lender,
      loanType: loan.loanType,
      principal: loan.principal,
      outstanding: loan.outstanding,
      annualRate: loan.annualRate,
      emi: loan.emi,
      startDate: loan.startDate,
      endDate: loan.endDate,
      notes: loan.notes,
    };
  }

  private appendIncomeAudit(
    auditTrail: IncomeAuditVersion[] | undefined,
    auditVersion: IncomeAuditVersion,
  ): IncomeAuditVersion[] {
    return (auditTrail ?? []).some(
      (audit) =>
        audit.operation === auditVersion.operation &&
        (audit.effectiveStartDate || '') === (auditVersion.effectiveStartDate || '') &&
        (audit.effectiveEndDate || '') === (auditVersion.effectiveEndDate || '') &&
        audit.source === auditVersion.source &&
        audit.amount === auditVersion.amount &&
        audit.cadence === auditVersion.cadence &&
        (audit.categoryId || '') === (auditVersion.categoryId || '') &&
        (audit.startDate || '') === (auditVersion.startDate || '') &&
        (audit.endDate || '') === (auditVersion.endDate || ''),
    )
      ? (auditTrail ?? [])
      : [...(auditTrail ?? []), auditVersion];
  }

  private appendInvestmentAudit(
    auditTrail: InvestmentAuditVersion[] | undefined,
    auditVersion: InvestmentAuditVersion,
  ): InvestmentAuditVersion[] {
    return (auditTrail ?? []).some(
      (audit) =>
        audit.operation === auditVersion.operation &&
        (audit.effectiveStartDate || '') === (auditVersion.effectiveStartDate || '') &&
        (audit.effectiveEndDate || '') === (auditVersion.effectiveEndDate || '') &&
        audit.name === auditVersion.name &&
        audit.amount === auditVersion.amount &&
        (audit.categoryId || '') === (auditVersion.categoryId || '') &&
        audit.frequency === auditVersion.frequency &&
        (audit.date || '') === (auditVersion.date || '') &&
        (audit.startDate || '') === (auditVersion.startDate || '') &&
        (audit.endDate || '') === (auditVersion.endDate || ''),
    )
      ? (auditTrail ?? [])
      : [...(auditTrail ?? []), auditVersion];
  }

  private appendLoanAudit(
    auditTrail: LoanAuditVersion[] | undefined,
    auditVersion: LoanAuditVersion,
  ): LoanAuditVersion[] {
    return (auditTrail ?? []).some(
      (audit) =>
        audit.operation === auditVersion.operation &&
        (audit.effectiveStartDate || '') === (auditVersion.effectiveStartDate || '') &&
        (audit.effectiveEndDate || '') === (auditVersion.effectiveEndDate || '') &&
        audit.lender === auditVersion.lender &&
        audit.loanType === auditVersion.loanType &&
        audit.principal === auditVersion.principal &&
        audit.outstanding === auditVersion.outstanding &&
        audit.annualRate === auditVersion.annualRate &&
        audit.emi === auditVersion.emi &&
        (audit.startDate || '') === (auditVersion.startDate || '') &&
        (audit.endDate || '') === (auditVersion.endDate || ''),
    )
      ? (auditTrail ?? [])
      : [...(auditTrail ?? []), auditVersion];
  }

  private editableIncomesForSelectedMonth(): IncomeSource[] {
    const selectedMonth = this.selectedMonth();
    const monthScoped = this.incomes().filter((income) => income.month === selectedMonth);

    if (monthScoped.length) {
      return monthScoped;
    }

    return this.activeIncomeSources().map((income) => ({
      ...income,
      id: this.monthlyIncomeId(incomeBaseId(income.id), selectedMonth),
      month: selectedMonth,
      startDate: undefined,
      endDate: undefined,
    }));
  }

  private monthlyIncomeId(incomeId: string, month: string): string {
    return incomeId.includes(`:${month}`) ? incomeId : `${incomeBaseId(incomeId)}:${month}`;
  }

  protected clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  private async watchAuthState(): Promise<void> {
    if (!this.firebase.app) {
      this.categories.set(this.withDefaultCategories([]));
      this.isSessionChecking.set(false);
      return;
    }

    this.isSessionChecking.set(true);
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
      this.isSessionChecking.set(false);
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
      this.isSessionChecking.set(false);
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);
    this.repository = new BudgetFirestoreRepository(this.firebase.app, email);

    try {
      const subscriptions = await Promise.all([
        this.repository.listen(
          'categories',
          (records) => {
            this.categories.set(this.withDefaultCategories(records));
            this.ensureDefaultCategoryRecord(records);
          },
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
          'investments',
          (records) => this.investments.set(records),
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
      this.isSessionChecking.set(false);
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
    const protectedLoanCategoryId = this.loanEmiCategoryId([
      ...this.categories(),
      ...result.categories,
    ]);
    const deletedCategoryIds = new Set(
      result.deleted.categories.filter((categoryId) => categoryId !== protectedLoanCategoryId),
    );
    const deletedExpenseIds = new Set(result.deleted.expenses);
    const deletedIncomeIds = new Set(result.deleted.incomes);
    const deletedInvestmentIds = new Set(result.deleted.investments);
    const deletedLoanIds = new Set(result.deleted.loans);
    const deletedTemplateIds = new Set(result.deleted.templates);
    const hardDeletedTemplateIds = deletedTemplateIds;
    const selectedMonth = this.selectedMonth();
    const recurringOperationMonth = currentMonth();
    const planOperationMonth = currentMonth();

    const categories = this.withDefaultCategories(
      result.categories.filter((category) => !deletedCategoryIds.has(category.id)),
    );
    const existingIncomesById = new Map(this.incomes().map((income) => [income.id, income]));
    const existingInvestmentsById = new Map(
      this.investments().map((investment) => [investment.id, investment]),
    );
    const existingLoansById = new Map(this.loans().map((loan) => [loan.id, loan]));
    const returnedIncomeIds = new Set(result.incomes.map((income) => income.id));
    const returnedInvestmentIds = new Set(result.investments.map((investment) => investment.id));
    const returnedLoanIds = new Set(result.loans.map((loan) => loan.id));
    const incomes = [
      ...this.incomes().filter(
        (income) => !returnedIncomeIds.has(income.id) && !deletedIncomeIds.has(income.id),
      ),
      ...result.incomes
        .filter((income) => !deletedIncomeIds.has(income.id))
        .map((income) =>
          this.normalizeIncomeRecord(
            income,
            existingIncomesById.get(income.id),
            planOperationMonth,
          ),
        ),
      ...result.deleted.incomes
        .map((recordId) => existingIncomesById.get(recordId))
        .filter((income): income is IncomeSource => !!income)
        .map((income) => this.closeIncomeRecord(income, planOperationMonth)),
    ];
    let templates = result.templates.filter(
      (template) =>
        !hardDeletedTemplateIds.has(template.id) && !deletedCategoryIds.has(template.categoryId),
    );
    const investments = [
      ...this.investments().filter(
        (investment) =>
          !returnedInvestmentIds.has(investment.id) && !deletedInvestmentIds.has(investment.id),
      ),
      ...result.investments
        .filter((investment) => !deletedInvestmentIds.has(investment.id))
        .map((investment) =>
          this.normalizeInvestmentRecord(
            investment,
            existingInvestmentsById.get(investment.id),
            planOperationMonth,
          ),
        ),
      ...result.deleted.investments
        .map((recordId) => existingInvestmentsById.get(recordId))
        .filter((investment): investment is InvestmentEntry => !!investment)
        .map((investment) => this.closeInvestmentRecord(investment, planOperationMonth)),
    ];
    let expenses = result.expenses
      .filter((expense) => !deletedExpenseIds.has(expense.id))
      .map((expense) =>
        deletedCategoryIds.has(expense.categoryId)
          ? { ...expense, categoryId: '', templateId: undefined }
          : expense,
      );
    const loans = [
      ...this.loans().filter(
        (loan) => !returnedLoanIds.has(loan.id) && !deletedLoanIds.has(loan.id),
      ),
      ...result.loans
        .filter((loan) => !deletedLoanIds.has(loan.id))
        .map((loan) =>
          this.normalizeLoanRecord(loan, existingLoansById.get(loan.id), planOperationMonth),
        ),
      ...result.deleted.loans
        .map((recordId) => existingLoansById.get(recordId))
        .filter((loan): loan is Loan => !!loan)
        .map((loan) => this.closeLoanRecord(loan, planOperationMonth)),
    ];

    const existingTemplates = this.templates();
    const existingExpenses = this.expenses();
    const existingTemplatesById = new Map(
      existingTemplates.map((template) => [template.id, template]),
    );
    const preservedArchivedTemplates = existingTemplates.filter(
      (template) =>
        !!template.archivedDate &&
        !deletedCategoryIds.has(template.categoryId) &&
        !deletedTemplateIds.has(template.id),
    );
    const extraDeletedExpenseIds = new Set<string>();
    const loansById = new Map(loans.map((loan) => [loan.id, loan]));
    const changedLoanIds = new Set(
      loans
        .filter((loan) => this.isLoanChanged(existingLoansById.get(loan.id) ?? loan, loan))
        .map((loan) => loan.id),
    );

    expenses = expenses.flatMap((expense) => {
      if (!expense.templateId?.startsWith('loan:')) {
        return [expense];
      }

      const loanId = expense.templateId.slice('loan:'.length);
      const expenseMonth = entryMonthKey(expense);

      if (deletedLoanIds.has(loanId)) {
        if (expenseMonth > planOperationMonth) {
          extraDeletedExpenseIds.add(expense.id);
          return [];
        }

        return [expense];
      }

      const loan = loansById.get(loanId);
      if (!loan || !changedLoanIds.has(loanId) || expenseMonth < planOperationMonth) {
        return [expense];
      }

      if (!isMonthInRange(expenseMonth, loan.startDate, loan.endDate)) {
        extraDeletedExpenseIds.add(expense.id);
        return [];
      }

      return [
        {
          ...expense,
          date: dateInMonth(expenseMonth, loan.startDate),
          name: this.loanExpenseName(loan),
          categoryId: this.loanEmiCategoryId(),
          amount: loan.emi,
          type: 'recurring' as const,
          note: expense.note || 'Prepopulated from loan EMI',
        },
      ];
    });

    if (result.scope === 'monthly') {
      templates = [
        ...preservedArchivedTemplates,
        ...templates.map((template) =>
          this.normalizeMonthlyTemplate(
            template,
            existingTemplatesById.get(template.id),
            recurringOperationMonth,
          ),
        ),
      ];

      const skippedTemplateIds = new Set<string>();

      for (const expense of existingExpenses) {
        if (
          deletedExpenseIds.has(expense.id) &&
          expense.templateId &&
          !expense.templateId.startsWith('loan:') &&
          entryMonthKey(expense) === selectedMonth
        ) {
          skippedTemplateIds.add(expense.templateId);
        }
      }

      templates = templates.map((template) =>
        skippedTemplateIds.has(template.id)
          ? this.withSkippedTemplateMonth(template, selectedMonth)
          : template,
      );

      const templatesById = new Map(templates.map((template) => [template.id, template]));
      const templateCascadeStartMonths = new Map(
        templates.map((template) => [
          template.id,
          template.archivedDate
            ? addMonths(recurringOperationMonth, 1)
            : dateMonthKey(activeStartDate(template.startDate, template.createdDate)) ||
              recurringOperationMonth,
        ]),
      );
      const changedTemplateIds = new Set(
        templates
          .filter((template) =>
            this.isTemplateChanged(existingTemplatesById.get(template.id), template),
          )
          .map((template) => template.id),
      );
      const occurrenceKeys = new Set<string>();
      const nextExpensesById = new Map<string, ExpenseEntry>();

      const addExpense = (source: ExpenseEntry): void => {
        if (deletedExpenseIds.has(source.id) || extraDeletedExpenseIds.has(source.id)) {
          return;
        }

        let expense = deletedCategoryIds.has(source.categoryId)
          ? { ...source, categoryId: '', templateId: undefined }
          : source;
        const expenseMonth = entryMonthKey(expense);
        const templateId = expense.templateId;

        if (templateId && !templateId.startsWith('loan:')) {
          if (hardDeletedTemplateIds.has(templateId)) {
            if (expenseMonth > recurringOperationMonth) {
              extraDeletedExpenseIds.add(expense.id);
              return;
            }

            nextExpensesById.set(expense.id, { ...expense, templateId: undefined });
            return;
          }

          const template = templatesById.get(templateId);

          if (!template) {
            extraDeletedExpenseIds.add(expense.id);
            return;
          }

          if (this.isTemplateMonthSkipped(template, expenseMonth)) {
            extraDeletedExpenseIds.add(expense.id);
            return;
          }

          if (template.archivedDate && !this.templateVersionForMonth(template, expenseMonth)) {
            extraDeletedExpenseIds.add(expense.id);
            return;
          }

          const occurrenceKey = `${templateId}:${expenseMonth}`;
          if (occurrenceKeys.has(occurrenceKey)) {
            extraDeletedExpenseIds.add(expense.id);
            return;
          }
          occurrenceKeys.add(occurrenceKey);

          if (changedTemplateIds.has(templateId)) {
            const templateStartMonth = templateCascadeStartMonths.get(templateId);

            if (templateStartMonth && expenseMonth < templateStartMonth) {
              nextExpensesById.set(expense.id, expense);
              return;
            }

            if (
              !isMonthInRange(
                expenseMonth,
                activeStartDate(template.startDate, template.createdDate),
                template.endDate,
              )
            ) {
              extraDeletedExpenseIds.add(expense.id);
              return;
            }

            expense = this.expenseFromTemplate(template, expenseMonth, expense);
          }
        }

        nextExpensesById.set(expense.id, expense);
      };

      for (const expense of existingExpenses.filter(
        (expense) => entryMonthKey(expense) !== selectedMonth,
      )) {
        addExpense(expense);
      }

      for (const expense of expenses.filter(
        (expense) => entryMonthKey(expense) === selectedMonth,
      )) {
        addExpense(expense);
      }

      for (const template of templates) {
        if (this.isTemplateMonthSkipped(template, selectedMonth)) {
          continue;
        }

        const effectiveTemplate = this.templateVersionForMonth(template, selectedMonth);
        if (!effectiveTemplate) {
          continue;
        }

        const occurrenceKey = `${template.id}:${selectedMonth}`;
        if (!changedTemplateIds.has(template.id) || occurrenceKeys.has(occurrenceKey)) {
          continue;
        }

        const generatedExpense = this.expenseFromTemplate(effectiveTemplate, selectedMonth);
        occurrenceKeys.add(occurrenceKey);
        nextExpensesById.set(generatedExpense.id, generatedExpense);
      }

      expenses = [...nextExpensesById.values()];
    }

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
          ...[...hardDeletedTemplateIds].map((recordId) =>
            this.repository?.delete('templates', recordId),
          ),
          ...[...new Set([...result.deleted.expenses, ...extraDeletedExpenseIds])].map((recordId) =>
            this.repository?.delete('expenses', recordId),
          ),
        ]);

        await Promise.all([
          this.repository?.upsertMany('categories', categories),
          this.repository?.upsertMany('incomes', incomes),
          this.repository?.upsertMany('templates', templates),
          this.repository?.upsertMany('expenses', expenses),
          this.repository?.upsertMany('investments', investments),
          this.repository?.upsertMany('loans', loans),
        ]);
      },
      () => {
        this.categories.set(categories);
        this.incomes.set(incomes);
        this.templates.set(templates);
        this.expenses.set(expenses);
        this.investments.set(investments);
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
    this.isSessionChecking.set(false);
  }

  private totalByType(type: ExpenseType): number {
    return this.selectedEntries()
      .filter((expense) => this.expenseTypeLabel(expense) === type)
      .reduce((total, expense) => total + expense.amount, 0);
  }

  private ratio(value: number, total: number): number {
    return total <= 0 ? 0 : value / total;
  }

  private isMobileViewport(): boolean {
    return globalThis.matchMedia?.('(max-width: 780px)').matches ?? false;
  }

  private isSwipeIgnoredTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }

    return !!target.closest(
      'button, input, textarea, select, mat-select, .mat-mdc-tab-header, .mat-mdc-dialog-container',
    );
  }

  private clearLegacyLocalData(): void {
    for (const key of ['categories', 'incomes', 'templates', 'expenses', 'investments', 'loans']) {
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
    this.investments.set([]);
    this.loans.set([]);
  }
}
