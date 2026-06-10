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
  initializeBudgetFirebase,
  observeBudgetAuth,
  signInWithGoogle,
  signOutBudgetUser,
} from './firebase.client';
import {
  buildProcessedImportCsv,
  createBudgetImportTemplateCsv,
  parseBudgetImportCsv,
  summarizeImportRows,
  type BudgetImportRow,
  type BudgetImportSummary,
} from './budget-import.service';
import type {
  BudgetCategory,
  BudgetCollectionName,
  BudgetDataMap,
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseTemplateAuditVersion,
  ExpenseType,
  IncomeSource,
  InvestmentEntry,
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

function activeStartDate(startDate?: string, createdDate?: string): string | undefined {
  return startDate || createdDate;
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
  protected readonly processedImportCsv = signal<string | null>(null);

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
    const monthScoped = this.incomes().filter((income) => income.month === selectedMonth);

    if (monthScoped.length) {
      return monthScoped;
    }

    const latestIncomeMonth = this.incomes()
      .map((income) => income.month)
      .filter((month): month is string => !!month && month <= selectedMonth)
      .sort()
      .at(-1);

    if (latestIncomeMonth) {
      return this.incomes().filter((income) => income.month === latestIncomeMonth);
    }

    return this.incomes().filter(
      (income) =>
        !income.month &&
        isMonthInRange(
          selectedMonth,
          activeStartDate(income.startDate, income.createdDate),
          income.endDate,
        ),
    );
  });
  protected readonly activeLoans = computed(() =>
    this.loans().filter(
      (loan) => loan.emi > 0 && isMonthInRange(this.selectedMonth(), loan.startDate, loan.endDate),
    ),
  );
  protected readonly monthlyIncome = computed(() =>
    this.activeIncomeSources().reduce((total, income) => {
      if (income.cadence === 'annual') {
        return total + income.amount / 12;
      }

      return total + income.amount;
    }, 0),
  );
  protected readonly selectedEntries = computed(() =>
    this.expenses().filter(
      (expense) =>
        entryMonthKey(expense) === this.selectedMonth() &&
        (expense.type === 'recurring' || expense.type === 'one-time'),
    ),
  );
  protected readonly selectedInvestments = computed(() =>
    this.investments().filter((investment) => {
      if (investment.frequency === 'recurring') {
        return isMonthInRange(
          this.selectedMonth(),
          activeStartDate(investment.startDate, investment.date || investment.createdDate),
          investment.endDate,
        );
      }

      return (
        dateMonthKey(investment.date || investment.startDate || investment.createdDate) ===
        this.selectedMonth()
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
              ? isMonthInRange(
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

  protected downloadImportTemplate(): void {
    this.downloadCsv(createBudgetImportTemplateCsv(), 'budget-battowski-import-template.csv');
  }

  protected downloadProcessedImport(): void {
    const processedCsv = this.processedImportCsv();
    if (!processedCsv) {
      return;
    }

    this.downloadCsv(processedCsv, 'budget-battowski-import-results.csv');
  }

  protected async importBudgetFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      const rows: BudgetImportRow[] = [
        {
          rowNumber: 1,
          values: { file: file.name },
          status: 'error',
          comments: [
            'Only CSV import is currently supported. Download the CSV template and retry.',
          ],
        },
      ];
      this.processedImportCsv.set(buildProcessedImportCsv(['file', 'status', 'comments'], rows));
      this.importSummary.set(summarizeImportRows(rows));
      this.syncStatus.set('Import file type not supported');
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      const text = await file.text();
      const parsed = parseBudgetImportCsv(text, this.categories());
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

      this.processedImportCsv.set(buildProcessedImportCsv(parsed.headers, parsed.rows));
      const summary = summarizeImportRows(parsed.rows);
      this.importSummary.set(summary);
      this.syncStatus.set(
        summary.error
          ? `Import finished with ${summary.error} row issue${summary.error === 1 ? '' : 's'}`
          : `Imported ${summary.success} row${summary.success === 1 ? '' : 's'}`,
      );
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Unable to import CSV file.');
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
        incomes: scope === 'planning' ? this.editableIncomesForSelectedMonth() : this.incomes(),
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
        this.categories.update((items) => [...items, ...records.categories]);
        this.incomes.update((items) => [...items, ...records.incomes]);
        this.templates.update((items) => [...items, ...records.templates]);
        this.expenses.update((items) => [...items, ...records.expenses]);
        this.investments.update((items) => [...items, ...records.investments]);
        this.loans.update((items) => [...items, ...records.loans]);
      },
    );
  }

  private downloadCsv(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
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

    const templateEntries = this.templates()
      .filter(
        (template) =>
          !existingTemplateIds.has(template.id) && !this.isTemplateMonthSkipped(template, month),
      )
      .map((template) => this.templateVersionForMonth(template, month))
      .filter((template): template is ExpenseTemplate => !!template)
      .map<ExpenseEntry>((template) => this.expenseFromTemplate(template, month));

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
        name: `${loan.loanType || loan.lender || 'Loan'} EMI`,
        categoryId: '',
        amount: loan.emi,
        type: 'recurring',
        note: 'Prepopulated from loan EMI',
        templateId: this.loanTemplateId(loan.id),
      }));

    return [...templateEntries, ...loanEntries];
  }

  protected categoryName(categoryId: string): string {
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

  private deletedAuditVersionFromTemplate(
    template: ExpenseTemplate,
    effectiveStartDate: string,
  ): ExpenseTemplateAuditVersion {
    return {
      id: id('audit'),
      operation: 'deleted',
      recordedDate: new Date().toISOString(),
      effectiveStartDate,
      name: template.name,
      categoryId: template.categoryId,
      amount: template.amount,
      startDate: effectiveStartDate,
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

  private archiveMonthlyTemplate(
    template: ExpenseTemplate,
    selectedMonth: string,
  ): ExpenseTemplate {
    const stopMonth = addMonths(selectedMonth, 1);
    const stopDate = monthStartDate(stopMonth);
    const effectiveEndDate = previousDate(stopDate);
    const clippedAuditTrail = (template.auditTrail ?? [])
      .map((audit) => {
        if (audit.operation === 'deleted') {
          return null;
        }

        const auditStart = audit.effectiveStartDate || audit.startDate;
        const auditEnd = audit.effectiveEndDate || audit.endDate;

        if (auditStart && auditStart >= stopDate) {
          return null;
        }

        if (!auditEnd || auditEnd >= stopDate) {
          return {
            ...audit,
            effectiveEndDate,
          };
        }

        return audit;
      })
      .filter((audit): audit is ExpenseTemplateAuditVersion => {
        if (!audit) {
          return false;
        }

        const auditStart = audit.effectiveStartDate || audit.startDate;
        const auditEnd = audit.effectiveEndDate || audit.endDate;

        return !auditStart || !auditEnd || auditStart <= auditEnd;
      });

    return {
      ...template,
      endDate: effectiveEndDate,
      archivedDate: new Date().toISOString(),
      auditTrail: [...clippedAuditTrail, this.deletedAuditVersionFromTemplate(template, stopDate)],
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

  private loanTemplateId(loanId: string): string {
    return `loan:${loanId}`;
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
    const deletedCategoryIds = new Set(result.deleted.categories);
    const deletedExpenseIds = new Set(result.deleted.expenses);
    const deletedIncomeIds = new Set(result.deleted.incomes);
    const deletedInvestmentIds = new Set(result.deleted.investments);
    const deletedLoanIds = new Set(result.deleted.loans);
    const deletedTemplateIds = new Set(result.deleted.templates);
    const hardDeletedTemplateIds =
      result.scope === 'monthly' ? new Set<string>() : deletedTemplateIds;
    const selectedMonth = this.selectedMonth();

    const categories = result.categories.filter((category) => !deletedCategoryIds.has(category.id));
    const nextIncomes = result.incomes.filter((income) => !deletedIncomeIds.has(income.id));
    const incomes =
      result.scope === 'planning'
        ? [
            ...this.incomes().filter((income) => income.month !== selectedMonth),
            ...nextIncomes.map((income) => ({ ...income, month: income.month || selectedMonth })),
          ]
        : nextIncomes;
    let templates = result.templates.filter(
      (template) =>
        !hardDeletedTemplateIds.has(template.id) && !deletedCategoryIds.has(template.categoryId),
    );
    const investments = result.investments.filter(
      (investment) => !deletedInvestmentIds.has(investment.id),
    );
    let expenses = result.expenses
      .filter((expense) => !deletedExpenseIds.has(expense.id))
      .map((expense) =>
        deletedCategoryIds.has(expense.categoryId)
          ? { ...expense, categoryId: '', templateId: undefined }
          : expense,
      );
    const loans = result.loans.filter((loan) => !deletedLoanIds.has(loan.id));

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

    if (result.scope === 'monthly') {
      const archivedTemplates = existingTemplates
        .filter(
          (template) =>
            deletedTemplateIds.has(template.id) && !deletedCategoryIds.has(template.categoryId),
        )
        .map((template) => this.archiveMonthlyTemplate(template, selectedMonth));

      templates = [
        ...preservedArchivedTemplates,
        ...templates.map((template) =>
          this.normalizeMonthlyTemplate(
            template,
            existingTemplatesById.get(template.id),
            selectedMonth,
          ),
        ),
        ...archivedTemplates,
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
            ? addMonths(selectedMonth, 1)
            : dateMonthKey(activeStartDate(template.startDate, template.createdDate)) ||
              selectedMonth,
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
          const template = templatesById.get(templateId);

          if (!template || hardDeletedTemplateIds.has(templateId)) {
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
        } else if (templateId && hardDeletedTemplateIds.has(templateId)) {
          extraDeletedExpenseIds.add(expense.id);
          return;
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
          ...result.deleted.incomes.map((recordId) => this.repository?.delete('incomes', recordId)),
          ...[...hardDeletedTemplateIds].map((recordId) =>
            this.repository?.delete('templates', recordId),
          ),
          ...result.deleted.investments.map((recordId) =>
            this.repository?.delete('investments', recordId),
          ),
          ...[...new Set([...result.deleted.expenses, ...extraDeletedExpenseIds])].map((recordId) =>
            this.repository?.delete('expenses', recordId),
          ),
          ...result.deleted.loans.map((recordId) => this.repository?.delete('loans', recordId)),
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
      .filter((expense) => expense.type === type)
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
