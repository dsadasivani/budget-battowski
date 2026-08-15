import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { Injectable, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuTrigger } from '@angular/material/menu';
import type { User } from 'firebase/auth';
import { firstValueFrom } from 'rxjs';

import { BudgetFirestoreRepository } from './budget.firestore';
import { isVersionEffectiveOnDate } from './domain/effective-dating/effective-dating-engine';
import { isLoanOccurrenceInRange, loanOccurrenceDate } from './domain/loans/loan-schedule-engine';
import { scheduleForMonth } from './domain/recurrence/recurrence-engine';
import { applyEntityMutations, planEntityMutations } from './domain/mutations/mutation-planner';
import type { BudgetMutationSet } from './domain/mutations/budget-mutations';
import type { EntityMutations, VersionedRecord } from './domain/mutations/entity-mutations';
import {
  CategoryRetirementDialog,
  type CategoryRetirementData,
  type CategoryRetirementResult,
} from './category-retirement-dialog';
import type {
  BulkEditorDialog,
  BulkEditorData,
  BulkEditorResult,
  BulkEditorScope,
} from './bulk-editor-dialog';
import type {
  MonthlyReviewDialog,
  MonthlyReviewResult,
  MonthlyReviewRow,
} from './monthly-review-dialog';
import { IncomeEditorDialog, type IncomeEditorData } from './income-editor-dialog';
import {
  WorkspaceConfirmDialog,
  WorkspaceFormDialog,
  type WorkspaceConfirmData,
  type WorkspaceFormData,
  type WorkspaceFormResult,
} from './workspace-form-dialog';
import {
  observeBudgetAuth,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutBudgetUser,
} from './firebase.client';
import { FinanceStore } from './stores/finance.store';
import { OnboardingStore } from './stores/onboarding.store';
import { PaymentStore } from './stores/payment.store';
import { PlanningStore } from './stores/planning.store';
import { SessionStore } from './stores/session.store';
import { WorkspaceStore } from './stores/workspace.store';
import {
  buildProcessedImportWorkbook,
  createBudgetImportTemplateWorkbook,
  parseBudgetImportFile,
  summarizeImportRows,
  type BudgetImportRow,
  type BudgetImportSummary,
} from './budget-import.service';
import { buildWorkspaceExport, workspaceExportFilename } from './budget-export.service';
import { PAYMENT_BANK_OPTIONS } from './budget.models';
import type {
  BudgetCategory,
  BudgetCollectionName,
  BudgetDataMap,
  CategoryRemapOperation,
  Cadence,
  ExpenseEntry,
  ExpenseTemplate,
  ExpenseTemplateAuditVersion,
  ExpenseType,
  IncomeAuditVersion,
  IncomeSource,
  InvestmentAuditVersion,
  InvestmentEntry,
  InvestmentFrequency,
  Loan,
  LoanAuditVersion,
  PaymentAccount,
  PaymentBankName,
  PaymentCardType,
  PaymentMode,
  PaymentModeProvider,
  PaymentModeType,
  OnboardingProgress,
  UserProfile,
  Workspace,
  WorkspaceMember,
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

function todayDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
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
  return loanOccurrenceDate(month, sourceDate || monthStartDate(month));
}

function dateFromIso(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(startDate: string, endDate: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor(
    (dateFromIso(endDate).getTime() - dateFromIso(startDate).getTime()) / millisecondsPerDay,
  );
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

function isOneTimeInvestment(investment: Pick<InvestmentEntry, 'frequency'>): boolean {
  return investment.frequency === 'one-time';
}

function comparePaymentModes(left: PaymentMode, right: PaymentMode): number {
  const archivedRank = Number(!!left.archivedDate) - Number(!!right.archivedDate);
  if (archivedRank) {
    return archivedRank;
  }

  return left.type.localeCompare(right.type) || left.name.localeCompare(right.name);
}

function comparePaymentAccounts(left: PaymentAccount, right: PaymentAccount): number {
  const archivedRank = Number(!!left.archivedDate) - Number(!!right.archivedDate);
  if (archivedRank) {
    return archivedRank;
  }

  return left.bankName.localeCompare(right.bankName) || left.name.localeCompare(right.name);
}

type ScheduledPlan = {
  amount: number;
  frequency?: InvestmentFrequency;
  date?: string;
  startDate?: string;
  effectiveStartDate?: string;
  endDate?: string;
  createdDate?: string;
};

function planFrequency(plan: ScheduledPlan): InvestmentFrequency {
  return plan.frequency ?? 'monthly';
}

function investmentScheduleForMonth(
  investment: InvestmentEntry,
  month: string,
): { amount: number; date: string; occurrences: number } | null {
  return planScheduleForMonth(investment, month);
}

function templateScheduleForMonth(
  template: ExpenseTemplate,
  month: string,
): { amount: number; date: string; occurrences: number } | null {
  return planScheduleForMonth(template, month);
}

function planScheduleForMonth(
  plan: ScheduledPlan,
  month: string,
): { amount: number; date: string; occurrences: number } | null {
  const anchorDate = activeStartDate(plan.startDate, plan.date || plan.createdDate);
  if (!anchorDate) {
    return null;
  }
  return scheduleForMonth(
    {
      frequency: planFrequency(plan),
      startDate: anchorDate,
      endDate: plan.endDate,
      effectiveStartDate: plan.effectiveStartDate,
      amount: plan.amount,
    },
    month,
  );
}

function intendedMutationIds<T extends VersionedRecord>(
  mutations: EntityMutations<T>,
): Set<string> {
  return new Set([
    ...mutations.creates.map((record) => record.id),
    ...mutations.updates.map(({ record }) => record.id),
    ...mutations.deletes.map(({ id: recordId }) => recordId),
  ]);
}

function excludeUntouchedEditorUpdates<T extends VersionedRecord>(
  planned: EntityMutations<T>,
  openingRecords: readonly T[],
  editorIntent: EntityMutations<T>,
): EntityMutations<T> {
  const openingIds = new Set(openingRecords.map((record) => record.id));
  const intendedIds = intendedMutationIds(editorIntent);
  const openingVersions = new Map(openingRecords.map((record) => [record.id, record.version ?? 0]));
  return {
    ...planned,
    updates: planned.updates
      .filter(({ record }) => !openingIds.has(record.id) || intendedIds.has(record.id))
      .map((update) =>
        intendedIds.has(update.record.id)
          ? { ...update, expectedVersion: openingVersions.get(update.record.id) ?? 0 }
          : update,
      ),
    deletes: planned.deletes.map((deletion) =>
      intendedIds.has(deletion.id)
        ? { ...deletion, expectedVersion: openingVersions.get(deletion.id) ?? 0 }
        : deletion,
    ),
  };
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
const DEFAULT_CASH_PAYMENT_MODE: PaymentMode = {
  id: 'payment-mode-cash',
  type: 'cash',
  name: 'Cash',
  workspaceGlobal: true,
};
const PAYMENT_PROVIDER_ICONS: Record<string, string> = {
  PhonePe: '/payment-icons/phonepe.svg',
  'Apple Pay': '/payment-icons/apple-pay.svg',
  'Samsung Pay': '/payment-icons/samsung-pay.svg',
  SamsungPay: '/payment-icons/samsung-pay.svg',
  'Google Pay': '/payment-icons/google-pay.svg',
  GPay: '/payment-icons/google-pay.svg',
  Paytm: '/payment-icons/paytm.svg',
  BHIM: '/payment-icons/bhim.svg',
};
const PAYMENT_PROVIDER_TONES: Record<string, string> = {
  PhonePe: 'phonepe',
  'Apple Pay': 'applepay',
  'Samsung Pay': 'samsungpay',
  SamsungPay: 'samsungpay',
  'Google Pay': 'googlepay',
  GPay: 'googlepay',
  Paytm: 'paytm',
  BHIM: 'bhim',
};
const PAYMENT_CARD_ICONS: Record<PaymentCardType, string> = {
  rupay: '/payment-icons/cards_rupay.svg',
  maestro: '/payment-icons/cards_maestro.svg',
  'diners-club': '/payment-icons/cards_diners-club.svg',
  'master-card': '/payment-icons/cards_master-card.svg',
  'american-express': '/payment-icons/cards_american-express.svg',
  visa: '/payment-icons/cards_visa.svg',
};
const DEFAULT_CARD_ICON = '/payment-icons/cards_default.svg';
const DEFAULT_BANK_NAME: PaymentBankName = 'Default';
const DEFAULT_BANK_ICON = '/bank-icons/bank-building-icon.svg';
const PAYMENT_BANK_ICON_BY_NAME: Record<PaymentBankName, string> = Object.fromEntries(
  PAYMENT_BANK_OPTIONS.map((bank) => [bank.name, bank.iconSrc]),
) as Record<PaymentBankName, string>;
const WORKSPACE_DATA_COLLECTIONS: BudgetCollectionName[] = [
  'paymentAccounts',
  'paymentModes',
  'categories',
  'incomes',
  'templates',
  'expenses',
  'investments',
  'loans',
];

@Injectable()
export class BudgetStore implements OnDestroy {
  private readonly sessionState = inject(SessionStore);
  private readonly workspaceState = inject(WorkspaceStore);
  private readonly financeState = inject(FinanceStore);
  private readonly paymentState = inject(PaymentStore);
  private readonly planningState = inject(PlanningStore);
  private readonly onboardingState = inject(OnboardingStore);
  private readonly bottomSheet = inject(MatBottomSheet);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly dialog = inject(MatDialog);
  private readonly storagePrefix = 'budget-battowski';
  private readonly workspaceTabCount = 5;
  private readonly authUnsubscribe = signal<(() => void) | null>(null);
  private readonly tabSwipeStart = signal<{ x: number; y: number } | null>(null);
  private readonly unsubscribes = signal<Array<() => void>>([]);
  private readonly prefillAttemptedSignatures = signal(new Set<string>());
  private readonly prefillInFlightSignatures = signal(new Set<string>());
  private readonly loanEmiCategoryUpsertInFlight = signal(false);
  private readonly cashPaymentModeUpsertInFlight = signal(false);
  private authHydrationKey: string | null = null;
  private authHydrationInFlight: Promise<void> | null = null;

  readonly firebase = this.sessionState.firebase;
  private readonly repository = signal<BudgetFirestoreRepository | null>(null);
  readonly isSessionChecking = this.sessionState.isSessionChecking;
  readonly isSyncing = this.sessionState.isSyncing;
  readonly loginLoaderActive = this.sessionState.loginLoaderActive;
  readonly isWorkspaceDataLoading = this.workspaceState.isWorkspaceDataLoading;
  private readonly loadedWorkspaceCollections = signal(new Set<BudgetCollectionName>());
  readonly syncStatus = this.sessionState.syncStatus;
  readonly syncError = this.sessionState.syncError;
  readonly pendingCategoryRemapCount = signal(0);
  readonly workspaceId = this.workspaceState.workspaceId;
  readonly workspaces = this.workspaceState.workspaces;
  readonly activeWorkspaces = computed(() =>
    this.workspaces()
      .filter((workspace) => !workspace.archivedDate)
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly archivedWorkspaces = computed(() =>
    this.workspaces()
      .filter((workspace) => !!workspace.archivedDate)
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly activeWorkspace = computed(
    () => this.workspaces().find((workspace) => workspace.id === this.workspaceId()) ?? null,
  );
  readonly userName = this.sessionState.userName;
  readonly userUid = this.sessionState.userUid;
  readonly userEmail = this.sessionState.userEmail;
  readonly userPhoto = this.sessionState.userPhoto;
  readonly onboardingProgress = this.onboardingState.progress;
  readonly selectedMemberEmail = this.workspaceState.selectedMemberEmail;
  readonly selectedMonth = this.financeState.selectedMonth;
  readonly monthPickerOpen = signal(false);
  readonly monthPickerView = signal<'months' | 'years'>('months');
  readonly pickerYear = signal(monthParts(this.selectedMonth()).year);
  readonly pickerYearPageStart = signal(yearPageStart(this.pickerYear()));
  readonly activeTabIndex = signal(0);
  readonly paymentAccounts = this.paymentState.paymentAccounts;
  readonly paymentModes = this.paymentState.paymentModes;
  readonly categories = this.financeState.categories;
  readonly incomes = this.financeState.incomes;
  readonly templates = this.planningState.templates;
  readonly expenses = this.financeState.expenses;
  readonly investments = this.financeState.investments;
  readonly loans = this.financeState.loans;
  readonly importSummary = signal<BudgetImportSummary | null>(null);
  readonly processedImportFile = signal<{ blob: Blob; filename: string } | null>(null);

  readonly monthNames = MONTH_NAMES;
  readonly activeMembers = computed(() =>
    (this.activeWorkspace()?.members ?? [])
      .filter((member) => !member.archivedDate)
      .sort((left, right) =>
        this.memberDisplayName(left).localeCompare(this.memberDisplayName(right)),
      ),
  );
  readonly canManageWorkspace = computed(() => {
    const email = this.userEmail();
    const workspace = this.activeWorkspace();
    return !!email && !!workspace && workspace.ownerEmail === email;
  });
  readonly selectedMemberLabel = computed(() => {
    const selected = this.selectedMemberEmail();
    if (selected === 'ALL') {
      return 'All members';
    }

    return this.memberName(selected);
  });
  readonly selectedMonthParts = computed(() => monthParts(this.selectedMonth()));
  readonly pickerYears = computed(() =>
    Array.from({ length: 16 }, (_, index) => this.pickerYearPageStart() + index),
  );
  readonly pickerYearRangeLabel = computed(
    () => `${this.pickerYearPageStart()} - ${this.pickerYearPageStart() + 15}`,
  );
  readonly hasBudgetData = computed(
    () =>
      this.categories().length +
        this.paymentAccounts().length +
        this.paymentModes().length +
        this.incomes().length +
        this.templates().length +
        this.expenses().length +
        this.investments().length +
        this.loans().length >
      0,
  );
  readonly activePaymentAccounts = computed(() =>
    this.paymentAccounts()
      .filter(
        (paymentAccount) =>
          !paymentAccount.archivedDate && this.matchesSelectedMember(paymentAccount),
      )
      .sort(comparePaymentAccounts),
  );
  readonly archivedPaymentAccounts = computed(() =>
    this.paymentAccounts()
      .filter(
        (paymentAccount) =>
          !!paymentAccount.archivedDate && this.matchesSelectedMember(paymentAccount),
      )
      .sort(comparePaymentAccounts),
  );
  readonly activePaymentModes = computed(() =>
    this.withDefaultPaymentModes(this.paymentModes())
      .filter(
        (paymentMode) =>
          !paymentMode.archivedDate &&
          (paymentMode.type !== 'cash' || this.isWorkspaceGlobalCashMode(paymentMode)) &&
          (this.isWorkspaceGlobalCashMode(paymentMode) || this.matchesSelectedMember(paymentMode)),
      )
      .sort(comparePaymentModes),
  );
  readonly archivedPaymentModes = computed(() =>
    this.paymentModes()
      .filter(
        (paymentMode) => !!paymentMode.archivedDate && this.matchesSelectedMember(paymentMode),
      )
      .sort(comparePaymentModes),
  );
  readonly paymentAccountCards = computed(() =>
    this.activePaymentAccounts().map((paymentAccount) => {
      const usage = this.paymentAccountUsage(paymentAccount.id);
      const mappedModes = this.paymentModesForAccount(paymentAccount.id);

      return {
        ...paymentAccount,
        detail: this.paymentAccountDetail(paymentAccount),
        displayName: this.paymentAccountLabel(paymentAccount),
        iconSrc: this.paymentAccountIconSrc(paymentAccount),
        ownerTag: this.memberTag(paymentAccount.memberEmail),
        mappedModeCount: mappedModes.length,
        mappedModes,
        recordCount: usage.count,
        usageAmount: usage.amount,
      };
    }),
  );
  readonly upiPaymentModeCount = computed(
    () => this.activePaymentModes().filter((paymentMode) => paymentMode.type === 'upi').length,
  );
  readonly cardPaymentModeCount = computed(
    () =>
      this.activePaymentModes().filter(
        (paymentMode) => paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card',
      ).length,
  );
  readonly paymentModeCards = computed(() =>
    this.activePaymentModes().map((paymentMode) => {
      const usage = this.paymentModeUsage(paymentMode.id);
      const paymentAccount = this.paymentAccountForMode(paymentMode);

      return {
        ...paymentMode,
        bankIconSrc: paymentAccount
          ? this.paymentAccountIconSrc(paymentAccount)
          : paymentMode.bankName
            ? this.bankIconSrc(paymentMode.bankName)
            : undefined,
        detail: this.paymentModeDetail(paymentMode),
        displayName: this.paymentModeDisplayLabel(paymentMode),
        icon: this.paymentModeIcon(paymentMode.type),
        iconSrc: this.paymentModeIconSrc(paymentMode),
        paymentAccountDetail: paymentAccount ? this.paymentAccountDetail(paymentAccount) : '',
        paymentAccountName: paymentAccount ? this.paymentAccountLabel(paymentAccount) : '',
        providerTone: this.paymentModeVisualTone(paymentMode),
        recordCount: usage.count,
        shortLabel: this.paymentModeShortLabel(paymentMode),
        ownerTag: this.isWorkspaceGlobalCashMode(paymentMode)
          ? 'Workspace'
          : this.memberTag(this.paymentModeMemberEmail(paymentMode)),
        typeLabel: this.paymentModeTypeLabel(paymentMode.type),
        usageAmount: usage.amount,
      };
    }),
  );
  readonly filteredIncomes = computed(() =>
    this.incomes().filter((record) => this.matchesSelectedMember(record)),
  );
  readonly filteredTemplates = computed(() =>
    this.templates().filter((record) => this.matchesSelectedMember(record)),
  );
  readonly filteredExpenses = computed(() =>
    this.expenses().filter((record) => this.matchesSelectedMember(record)),
  );
  readonly filteredInvestments = computed(() =>
    this.investments().filter((record) => this.matchesSelectedMember(record)),
  );
  readonly filteredLoans = computed(() =>
    this.loans().filter((record) => this.matchesSelectedMember(record)),
  );
  readonly showPageSkeleton = computed(
    () =>
      this.firebase.mode === 'firebase' &&
      !this.loginLoaderActive() &&
      (this.isSessionChecking() || this.isWorkspaceDataLoading()),
  );
  readonly showDashboardSkeleton = computed(() => this.showPageSkeleton());
  readonly showGlobalLoader = computed(
    () => this.firebase.mode === 'firebase' && this.loginLoaderActive(),
  );
  readonly canWrite = computed(
    () => this.firebase.mode !== 'firebase' || (!!this.workspaceId() && !this.isSyncing()),
  );
  readonly canReviewMonth = computed(() => this.selectedMonth() >= currentMonth());
  readonly monthlyReviewRows = computed(() =>
    this.canReviewMonth() ? this.buildMonthlyReviewRows(this.selectedMonth()) : [],
  );
  readonly hasMonthlyReviewRows = computed(() => this.monthlyReviewRows().length > 0);
  readonly monthlyReviewStatusLabel = computed(() => {
    const count = this.monthlyReviewRows().length;

    if (!this.canReviewMonth()) {
      return 'Past month';
    }

    return count ? `${count} pending` : 'All reviewed';
  });
  readonly expenseCategories = computed(() =>
    this.categories().filter(
      (category) => !category.archivedDate && this.categoryType(category) === 'Expenses',
    ),
  );
  readonly incomeCategories = computed(() =>
    this.categories().filter(
      (category) => !category.archivedDate && this.categoryType(category) === 'Income',
    ),
  );
  readonly investmentCategories = computed(() =>
    this.categories().filter(
      (category) => !category.archivedDate && this.categoryType(category) === 'Investments',
    ),
  );
  readonly statusIcon = computed(() =>
    this.syncError()
      ? 'sync_problem'
      : this.isSyncing()
        ? 'sync'
        : this.firebase.mode === 'firebase' && this.workspaceId()
          ? 'cloud_done'
          : 'cloud_off',
  );
  readonly statusTone = computed(() =>
    this.syncError()
      ? 'danger'
      : this.firebase.mode === 'firebase' && this.workspaceId()
        ? 'success'
        : 'neutral',
  );
  readonly monthLabel = computed(() => monthLabel(this.selectedMonth()));
  readonly activeIncomeSources = computed(() => {
    const selectedMonth = this.selectedMonth();
    const activeIncomes = this.filteredIncomes().filter((income) => {
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
  readonly activeLoans = computed(() =>
    this.filteredLoans().filter(
      (loan) =>
        loan.emi > 0 && isLoanOccurrenceInRange(this.selectedMonth(), loan.startDate, loan.endDate),
    ),
  );
  readonly investmentPlans = computed(() =>
    this.filteredInvestments().filter(
      (investment) =>
        !investment.sourceInvestmentId &&
        !!investmentScheduleForMonth(investment, this.selectedMonth()),
    ),
  );
  readonly monthlyIncome = computed(() =>
    this.activeIncomeSources().reduce(
      (total, income) => total + this.monthlyIncomeAmount(income),
      0,
    ),
  );
  readonly selectedEntries = computed(() =>
    this.filteredExpenses().filter(
      (expense) =>
        entryMonthKey(expense) === this.selectedMonth() &&
        normalizedExpenseType(expense) !== 'investment',
    ),
  );
  readonly selectedInvestments = computed(() =>
    this.confirmedInvestmentsForMonth(this.selectedMonth()),
  );
  readonly incomeRows = computed(() =>
    this.activeIncomeSources()
      .map((income) => ({
        ...income,
        categoryName: income.categoryId ? this.categoryName(income.categoryId) : 'Uncategorized',
        memberName: this.memberName(income.memberEmail),
      }))
      .sort((left, right) => right.amount - left.amount),
  );
  readonly incomeHistoryRows = computed(() => {
    const months = Array.from({ length: 12 }, (_, index) =>
      addMonths(this.selectedMonth(), index - 11),
    );
    return months.map((month) => ({
      month,
      label: monthLabel(month),
      amount: this.incomeTotalForMonth(month),
    }));
  });
  readonly previousMonthIncome = computed(() => this.incomeHistoryRows().at(-2)?.amount ?? 0);
  readonly incomeGrowthRate = computed(() => {
    const previous = this.previousMonthIncome();
    return previous ? (this.monthlyIncome() - previous) / previous : 0;
  });
  readonly legacyInvestmentEntries = computed(() =>
    this.filteredExpenses().filter(
      (expense) =>
        entryMonthKey(expense) === this.selectedMonth() &&
        legacyExpenseType(expense) === 'investment',
    ),
  );
  readonly recurringTotal = computed(() => this.totalByType('recurring'));
  readonly oneTimeTotal = computed(() => this.totalByType('one-time'));
  readonly investmentTotal = computed(
    () =>
      this.selectedInvestments().reduce(
        (total, investment) =>
          total + (investmentScheduleForMonth(investment, this.selectedMonth())?.amount ?? 0),
        0,
      ) + this.legacyInvestmentEntries().reduce((total, expense) => total + expense.amount, 0),
  );
  readonly outflowTotal = computed(() =>
    this.selectedEntries().reduce((total, expense) => total + expense.amount, 0),
  );
  readonly remainingFunds = computed(
    () => this.monthlyIncome() - this.outflowTotal() - this.investmentTotal(),
  );
  readonly burnoutRatio = computed(() => this.ratio(this.outflowTotal(), this.monthlyIncome()));
  readonly savingsRatio = computed(() =>
    this.ratio(this.investmentTotal() + Math.max(0, this.remainingFunds()), this.monthlyIncome()),
  );
  readonly debtEmiTotal = computed(() =>
    this.activeLoans().reduce((total, loan) => total + loan.emi, 0),
  );
  readonly debtRatio = computed(() => this.ratio(this.debtEmiTotal(), this.monthlyIncome()));
  readonly categoryStats = computed(() =>
    this.expenseCategories().map((category) => {
      const monthlyBudget = this.categoryBudgetForMonth(category, this.selectedMonth());
      const spent = this.selectedEntries()
        .filter((expense) => expense.categoryId === category.id)
        .reduce((total, expense) => total + expense.amount, 0);

      return {
        ...category,
        monthlyBudget,
        spent,
        remaining: monthlyBudget - spent,
        used: this.ratio(spent, monthlyBudget),
      };
    }),
  );
  readonly trendRows = computed(() => {
    const months = Array.from({ length: 6 }, (_, index) =>
      addMonths(this.selectedMonth(), index - 5),
    );

    return months.map((month) => {
      const entries = this.filteredExpenses().filter(
        (expense) =>
          entryMonthKey(expense) === month &&
          ((expense as ExpenseEntry & { type: string }).type === 'recurring' ||
            (expense as ExpenseEntry & { type: string }).type === 'one-time'),
      );
      const outflow = entries.reduce((total, expense) => total + expense.amount, 0);
      const invested =
        this.confirmedInvestmentsForMonth(month).reduce(
          (total, investment) =>
            total + (investmentScheduleForMonth(investment, month)?.amount ?? investment.amount),
          0,
        ) +
        this.filteredExpenses()
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
  readonly loanPlans = computed(() =>
    this.activeLoans().map((loan) => {
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
  readonly totalDebt = computed(() =>
    this.activeLoans().reduce((total, loan) => total + loan.outstanding, 0),
  );
  readonly donutStyle = computed(() => {
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
  readonly suggestions = computed(() => {
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
  readonly leadingCategory = computed(() => {
    const [category] = [...this.categoryStats()].sort((a, b) => b.spent - a.spent);
    return category ?? null;
  });
  readonly runwayLabel = computed(() => {
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
  readonly recurringEntries = computed(() =>
    this.selectedEntries()
      .filter((expense) => this.expenseTypeLabel(expense) === 'recurring')
      .sort((left, right) => this.recordDate(left).localeCompare(this.recordDate(right))),
  );
  readonly oneTimeEntries = computed(() =>
    this.selectedEntries()
      .filter((expense) => this.expenseTypeLabel(expense) === 'one-time')
      .sort((left, right) => this.recordDate(left).localeCompare(this.recordDate(right))),
  );
  readonly expenseRows = computed(() =>
    this.selectedEntries()
      .map((expense) => ({
        ...expense,
        categoryName: this.categoryName(expense.categoryId),
        categoryColor: this.categoryColor(expense.categoryId),
        dayLabel: this.shortDateLabel(this.recordDate(expense)),
        memberInitial: this.memberInitial(expense.memberEmail),
        memberName: this.memberName(expense.memberEmail),
        paymentModeMeta: this.paymentModeMeta(expense.paymentModeId),
        paymentModeLabel: this.paymentModeLabel(expense.paymentModeId),
        paymentModeTone: this.paymentModeTone(expense.paymentModeId),
        typeLabel: this.expenseTypeLabel(expense),
      }))
      .sort((left, right) => this.recordDate(left).localeCompare(this.recordDate(right))),
  );
  readonly spendingBreakdownRows = computed(() => {
    const total = this.outflowTotal();

    return this.categoryStats()
      .filter((category) => category.spent > 0)
      .map((category) => ({
        ...category,
        share: this.ratio(category.spent, total),
      }))
      .sort((left, right) => right.spent - left.spent);
  });
  readonly categoryCards = computed(() =>
    this.categoryStats().map((category) => ({
      ...category,
      icon: this.categoryIcon(category.name),
      percent: this.clampPercent(category.used),
      statusLabel: this.categoryStatusLabel(category.used),
      statusTone: this.categoryStatusTone(category.used),
      tone: this.categoryTone(category.name),
    })),
  );
  readonly overBudgetCategoryCount = computed(
    () => this.categoryStats().filter((category) => category.used > 1).length,
  );
  readonly withinBudgetCategoryCount = computed(
    () => this.categoryStats().filter((category) => category.used <= 1).length,
  );
  readonly topSpenders = computed(() => {
    const totals = new Map<string, number>();
    for (const expense of this.selectedEntries()) {
      const key = expense.memberEmail || 'UNASSIGNED';
      totals.set(key, (totals.get(key) ?? 0) + expense.amount);
    }

    return [...totals.entries()]
      .map(([memberEmail, amount]) => ({
        amount,
        memberEmail,
        name: memberEmail === 'UNASSIGNED' ? 'Unassigned' : this.memberName(memberEmail),
        initial: memberEmail === 'UNASSIGNED' ? 'U' : this.memberInitial(memberEmail),
        share: this.ratio(amount, this.outflowTotal()),
      }))
      .sort((left, right) => right.amount - left.amount);
  });
  readonly recurringPlanRows = computed(() =>
    this.filteredTemplates()
      .flatMap((template) => {
        if (this.isTemplateMonthSkipped(template, this.selectedMonth())) {
          return [];
        }

        const effectiveTemplate = this.templateVersionForMonth(template, this.selectedMonth());
        const schedule = effectiveTemplate
          ? templateScheduleForMonth(effectiveTemplate, this.selectedMonth())
          : null;
        if (!effectiveTemplate || !schedule) {
          return [];
        }

        return [
          {
            ...effectiveTemplate,
            amount: schedule.amount,
            categoryName: this.categoryName(effectiveTemplate.categoryId),
            categoryColor: this.categoryColor(effectiveTemplate.categoryId),
            icon: this.categoryIcon(this.categoryName(effectiveTemplate.categoryId)),
            memberName: this.memberName(effectiveTemplate.memberEmail),
          },
        ];
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly oneTimePlannedRows = computed(() =>
    this.oneTimeEntries().map((expense) => ({
      ...expense,
      categoryName: this.categoryName(expense.categoryId),
      memberName: this.memberName(expense.memberEmail),
      status:
        expense.date && expense.date <= new Date().toISOString().slice(0, 10) ? 'Done' : 'Planned',
    })),
  );
  readonly budgetAllocationRows = computed(() => {
    const totalBudget = this.expenseCategories().reduce(
      (total, category) => total + category.monthlyBudget,
      0,
    );

    return this.expenseCategories()
      .filter((category) => category.monthlyBudget > 0)
      .map((category) => ({
        ...category,
        icon: this.categoryIcon(category.name),
        share: this.ratio(category.monthlyBudget, totalBudget),
      }))
      .sort((left, right) => right.monthlyBudget - left.monthlyBudget);
  });
  readonly planningTimelineRows = computed(() => {
    const rows: Array<{
      amount: number;
      color: string;
      date: string;
      label: string;
      tone: 'income' | 'expense' | 'investment' | 'loan';
    }> = [];
    const month = this.selectedMonth();

    for (const income of this.activeIncomeSources()) {
      rows.push({
        amount: this.monthlyIncomeAmount(income),
        color: '#10b981',
        date: monthStartDate(month),
        label: income.source,
        tone: 'income',
      });
    }

    for (const plan of this.recurringPlanRows()) {
      rows.push({
        amount: plan.amount,
        color: plan.categoryColor,
        date: dateInMonth(month, plan.startDate),
        label: plan.name,
        tone: 'expense',
      });
    }

    for (const investment of this.selectedInvestments()) {
      const schedule = investmentScheduleForMonth(investment, month);
      rows.push({
        amount: schedule?.amount ?? investment.amount,
        color: '#14b8a6',
        date: schedule?.date ?? dateInMonth(month, investment.date || investment.startDate),
        label: investment.name,
        tone: 'investment',
      });
    }

    for (const loan of this.activeLoans()) {
      rows.push({
        amount: loan.emi,
        color: '#f97316',
        date: loanOccurrenceDate(month, loan.startDate),
        label: `${loan.loanType} due`,
        tone: 'loan',
      });
    }

    return rows.sort((left, right) => left.date.localeCompare(right.date));
  });
  readonly portfolioRows = computed(() =>
    this.investmentPlans()
      .map((investment) => {
        const monthlySchedule = investmentScheduleForMonth(investment, this.selectedMonth());

        return {
          ...investment,
          categoryName: investment.categoryId
            ? this.categoryName(investment.categoryId)
            : 'Uncategorized',
          memberInitial: this.memberInitial(investment.memberEmail),
          memberName: this.memberName(investment.memberEmail),
          monthlyAmount: monthlySchedule?.amount ?? 0,
          paymentModeMeta: this.paymentModeMeta(investment.paymentModeId),
          paymentModeLabel: this.paymentModeLabel(investment.paymentModeId),
          paymentModeTone: this.paymentModeTone(investment.paymentModeId),
          totalInvested: this.scheduledInvestmentTotalThrough(investment, this.selectedMonth()),
        };
      })
      .sort((left, right) => right.monthlyAmount - left.monthlyAmount),
  );
  readonly confirmedInvestmentRows = computed(() =>
    this.selectedInvestments()
      .map((investment) => ({
        ...investment,
        categoryName: investment.categoryId
          ? this.categoryName(investment.categoryId)
          : 'Uncategorized',
        monthlyAmount: investment.amount,
        paymentModeMeta: this.paymentModeMeta(investment.paymentModeId),
      }))
      .sort((left, right) => right.monthlyAmount - left.monthlyAmount),
  );
  readonly portfolioValue = computed(() =>
    this.portfolioRows().reduce((total, investment) => total + investment.totalInvested, 0),
  );
  readonly investmentMemberAllocationRows = computed(() => {
    const totals = new Map<string, number>();
    for (const investment of this.portfolioRows()) {
      const key = investment.memberEmail || 'BOTH';
      totals.set(key, (totals.get(key) ?? 0) + investment.monthlyAmount);
    }

    return [...totals.entries()]
      .map(([memberEmail, amount]) => ({
        amount,
        initial: memberEmail === 'BOTH' ? 'B' : this.memberInitial(memberEmail),
        memberEmail,
        name: memberEmail === 'BOTH' ? 'Both' : this.memberName(memberEmail),
        share: this.ratio(amount, this.investmentTotal()),
      }))
      .sort((left, right) => right.amount - left.amount);
  });
  readonly projectedLoanClosure = computed(() => {
    const payoff = this.loanPlans()
      .map((loan) => loan.payoff)
      .sort((left, right) => right.getTime() - left.getTime())[0];

    return payoff ?? null;
  });
  readonly totalLoanPrincipal = computed(() =>
    this.activeLoans().reduce((total, loan) => total + loan.principal, 0),
  );
  readonly loanRepaymentRows = computed(() =>
    this.loanPlans()
      .map((loan) => ({
        ...loan,
        color: this.loanColor(loan.id),
        paymentModeMeta: this.paymentModeMeta(loan.paymentModeId),
        paymentModeLabel: this.paymentModeLabel(loan.paymentModeId),
        paymentModeTone: this.paymentModeTone(loan.paymentModeId),
        share: this.ratio(loan.emi, this.debtEmiTotal()),
      }))
      .sort((left, right) => right.emi - left.emi),
  );
  readonly loanCalendarDays = computed(() => {
    const { year, monthIndex } = this.selectedMonthParts();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const day = dayIndex + 1;
      const date = `${this.selectedMonth()}-${String(day).padStart(2, '0')}`;
      const items = this.activeLoans()
        .filter(
          (loan) =>
            Number(loanOccurrenceDate(this.selectedMonth(), loan.startDate).slice(-2)) === day,
        )
        .map((loan) => ({
          id: loan.id,
          color: this.loanColor(loan.id),
          label: this.loanExpenseName(loan),
          amount: loan.emi,
        }));

      return {
        date,
        day,
        items,
        muted: false,
      };
    });
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
    this.authUnsubscribe()?.();
    this.stopFirestoreListeners();
  }

  async loginWithGoogle(): Promise<void> {
    if (!this.firebase.app) {
      this.syncStatus.set('Firebase config needed');
      return;
    }

    this.loginLoaderActive.set(true);
    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      this.syncStatus.set('Signing in');
      const user = await signInWithGoogle(this.firebase.app);
      await this.handleAuthUser(user);
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Google sign-in failed.');
      this.loginLoaderActive.set(false);
    } finally {
      this.isSyncing.set(false);
    }
  }

  async loginWithEmailPassword(email: string, password: string): Promise<void> {
    if (!this.firebase.app) {
      this.syncStatus.set('Firebase config needed');
      return;
    }

    this.loginLoaderActive.set(true);
    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      this.syncStatus.set('Signing in');
      const user = await signInWithEmailPassword(this.firebase.app, email, password);
      await this.handleAuthUser(user);
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Email and password sign-in failed.',
      );
      this.loginLoaderActive.set(false);
    } finally {
      this.isSyncing.set(false);
    }
  }

  async logout(): Promise<void> {
    if (!this.firebase.app) {
      return;
    }

    this.loginLoaderActive.set(false);
    this.isWorkspaceDataLoading.set(false);
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

  openMonthPicker(): void {
    const { year } = this.selectedMonthParts();
    this.pickerYear.set(year);
    this.pickerYearPageStart.set(yearPageStart(year));
    this.monthPickerView.set('months');
    this.monthPickerOpen.set(true);
  }

  closeMonthPicker(): void {
    this.monthPickerOpen.set(false);
  }

  showYearPicker(event: MouseEvent): void {
    event.stopPropagation();
    this.monthPickerView.set('years');
    this.pickerYearPageStart.set(yearPageStart(this.pickerYear()));
  }

  shiftMonthPicker(event: MouseEvent, offset: number): void {
    event.stopPropagation();

    if (this.monthPickerView() === 'years') {
      this.pickerYearPageStart.update((start) => start + offset * 16);
      return;
    }

    this.pickerYear.update((year) => year + offset);
  }

  selectPickerYear(event: MouseEvent, year: number): void {
    event.stopPropagation();
    this.pickerYear.set(year);
    this.monthPickerView.set('months');
  }

  selectPickerMonth(monthIndex: number, trigger: MatMenuTrigger): void {
    this.selectedMonth.set(monthKeyFromParts(this.pickerYear(), monthIndex));
    trigger.closeMenu();
  }

  setSelectedMonth(month: string): void {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return;
    }

    const { year, monthIndex } = monthParts(month);
    if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      return;
    }

    this.selectedMonth.set(month);
  }

  moveMonth(offset: number): void {
    this.selectedMonth.update((month) => addMonths(month, offset));
  }

  setSelectedMember(memberEmail: string): void {
    this.selectedMemberEmail.set(memberEmail);
  }

  async selectWorkspace(workspaceId: string): Promise<void> {
    if (!this.firebase.app) {
      return;
    }

    const workspace = this.workspaces().find((item) => item.id === workspaceId);
    if (workspace?.archivedDate) {
      this.syncStatus.set('Archived workspaces cannot be opened');
      return;
    }

    this.stopFirestoreListeners();
    this.clearAppData();
    this.loadedWorkspaceCollections.set(new Set());
    this.isWorkspaceDataLoading.set(true);
    this.workspaceId.set(workspaceId);
    this.selectedMemberEmail.set('ALL');
    const uid = this.userUid();
    const email = this.userEmail();
    this.repository.set(
      new BudgetFirestoreRepository(
        this.firebase.app,
        workspaceId,
        uid && email ? { uid, email } : undefined,
      ),
    );
    await this.resumeCategoryRemaps();
    await this.listenToWorkspaceData();
  }

  async createWorkspace(): Promise<void> {
    const ownerProfile = this.currentUserProfile();
    if (!this.firebase.app || !ownerProfile) {
      return;
    }

    const result = await this.openWorkspaceForm({
      mode: 'create',
      ownerProfile,
      existingMembers: [],
      lookupUserProfile: (email) => this.findUserProfile(email),
    });
    if (!result?.name.trim()) {
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      const workspace = await BudgetFirestoreRepository.createWorkspace(
        this.firebase.app,
        ownerProfile,
        result.name,
        result.members,
      );
      this.workspaces.update((workspaces) =>
        [...workspaces, workspace].sort((left, right) => left.name.localeCompare(right.name)),
      );
      await this.selectWorkspace(workspace.id);
      this.syncStatus.set('Workspace created');
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Unable to create workspace.');
    } finally {
      this.isSyncing.set(false);
    }
  }

  async addWorkspaceMember(): Promise<void> {
    const workspace = this.activeWorkspace();
    const repository = this.repository();
    const ownerProfile = this.currentUserProfile();
    if (!workspace || !repository || !this.canManageWorkspace() || !ownerProfile) {
      return;
    }

    const result = await this.openWorkspaceForm({
      mode: 'add-member',
      ownerProfile,
      workspaceName: workspace.name,
      existingMembers: workspace.members,
      lookupUserProfile: (email) => this.findUserProfile(email),
    });
    if (!result?.members.length) {
      return;
    }

    await this.saveWorkspace(
      this.workspaceWithEditorProfiles(workspace, result.members),
      'Member access updated',
    );
  }

  async renameWorkspace(): Promise<void> {
    const workspace = this.activeWorkspace();
    const ownerProfile = this.currentUserProfile();
    if (!workspace || !this.canManageWorkspace() || !ownerProfile) {
      return;
    }

    const result = await this.openWorkspaceForm({
      mode: 'rename',
      ownerProfile,
      workspaceName: workspace.name,
      existingMembers: workspace.members,
      lookupUserProfile: (email) => this.findUserProfile(email),
    });
    const name = result?.name.trim();
    if (!name || name === workspace.name) {
      return;
    }

    await this.saveWorkspace(
      {
        ...workspace,
        name,
        updatedDate: new Date().toISOString(),
      },
      'Workspace renamed',
    );
  }

  async archiveWorkspace(): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace || !this.canManageWorkspace()) {
      return;
    }

    const confirmed = await this.openWorkspaceConfirm({
      title: 'Archive Workspace',
      message: `Archive ${workspace.name}? You can switch to another workspace after this one is hidden.`,
      confirmLabel: 'Archive',
      icon: 'archive',
    });
    if (!confirmed) {
      return;
    }

    const today = new Date().toISOString();
    const archivedWorkspace: Workspace = {
      ...workspace,
      archivedDate: today,
      updatedDate: today,
    };

    await this.saveWorkspace(archivedWorkspace, 'Workspace archived');
    const remainingWorkspaces = this.activeWorkspaces();

    if (remainingWorkspaces[0]) {
      await this.selectWorkspace(remainingWorkspaces[0].id);
      return;
    }

    this.stopFirestoreListeners();
    this.repository.set(null);
    this.workspaceId.set(null);
    this.clearAppData();
    this.isWorkspaceDataLoading.set(false);
    this.syncStatus.set('Workspace archived. Create a workspace to continue.');
  }

  canManageWorkspaceRecord(workspace: Workspace | null | undefined): boolean {
    const email = this.userEmail();
    return !!email && !!workspace && workspace.ownerEmail === email;
  }

  async retryCategoryRemaps(): Promise<void> {
    await this.resumeCategoryRemaps(true);
  }

  async openIncomeEditor(income?: IncomeSource): Promise<void> {
    const dialogRef = this.dialog.open<IncomeEditorDialog, IncomeEditorData, IncomeSource>(
      IncomeEditorDialog,
      {
        autoFocus: 'first-tabbable',
        data: {
          categories: this.incomeCategories(),
          income,
          memberEmail: this.actingMemberEmail(),
          selectedMonth: this.selectedMonth(),
        },
        maxWidth: '94vw',
        width: 'min(680px, 94vw)',
      },
    );
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) {
      return;
    }
    const previous = this.incomes().find((item) => item.id === result.id);
    const normalized = this.normalizeIncomeRecord(
      {
        ...result,
        memberEmail: previous?.memberEmail ?? result.memberEmail ?? this.actingMemberEmail(),
      },
      previous,
      todayDate(),
    );
    const saved = await this.saveRecords('incomes', [normalized], () =>
      this.incomes.update((items) => [
        ...items.filter((item) => item.id !== normalized.id),
        normalized,
      ]),
    );
    if (saved) {
      this.syncStatus.set(this.repository() ? 'Income saved to Firebase' : 'Income saved');
    }
  }

  async deleteArchivedWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.workspaces().find((item) => item.id === workspaceId);
    if (!workspace?.archivedDate || !this.canManageWorkspaceRecord(workspace)) {
      return;
    }

    const confirmed = await this.openWorkspaceConfirm({
      title: 'Delete Archived Workspace',
      message: `Permanently delete ${workspace.name}? This removes the archived workspace and its budget records.`,
      confirmLabel: 'Delete',
      icon: 'delete_forever',
    });
    if (!confirmed) {
      return;
    }

    if (this.firebase.mode === 'firebase' && !this.firebase.app) {
      this.syncStatus.set('Sign in required to delete workspace');
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      if (this.firebase.app) {
        await BudgetFirestoreRepository.deleteWorkspace(this.firebase.app, workspace.id);
      }
      this.workspaces.update((workspaces) => workspaces.filter((item) => item.id !== workspace.id));
      this.syncStatus.set('Archived workspace deleted');
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Workspace delete failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }

  async archiveWorkspaceMember(memberEmail: string): Promise<void> {
    const workspace = this.activeWorkspace();
    if (!workspace || !this.canManageWorkspace() || memberEmail === workspace.ownerEmail) {
      return;
    }

    const member = workspace.members.find((item) => item.email === memberEmail);
    if (!member || member.archivedDate) {
      return;
    }

    const confirmed = await this.openWorkspaceConfirm({
      title: 'Remove Workspace Access',
      message: `Remove access for ${this.memberName(memberEmail)}?`,
      confirmLabel: 'Remove',
      icon: 'person_remove',
    });
    if (!confirmed) {
      return;
    }

    const today = new Date().toISOString();
    const nextWorkspace: Workspace = {
      ...workspace,
      updatedDate: today,
      members: workspace.members.map((item) =>
        item.email === memberEmail ? { ...item, archivedDate: today } : item,
      ),
    };

    await this.saveWorkspace(nextWorkspace, 'Member access removed');
    if (this.selectedMemberEmail() === memberEmail) {
      this.selectedMemberEmail.set('ALL');
    }
  }

  setActiveTab(index: number): void {
    this.activeTabIndex.set(Math.max(0, Math.min(this.workspaceTabCount - 1, index)));
  }

  startTabSwipe(event: TouchEvent): void {
    if (
      event.touches.length !== 1 ||
      !this.isMobileViewport() ||
      this.isSwipeIgnoredTarget(event.target)
    ) {
      this.tabSwipeStart.set(null);
      return;
    }

    const [touch] = event.touches;
    this.tabSwipeStart.set({
      x: touch.clientX,
      y: touch.clientY,
    });
  }

  finishTabSwipe(event: TouchEvent): void {
    const start = this.tabSwipeStart();
    this.tabSwipeStart.set(null);

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

  cancelTabSwipe(): void {
    this.tabSwipeStart.set(null);
  }

  async downloadImportTemplate(): Promise<void> {
    this.downloadBlob(
      await createBudgetImportTemplateWorkbook(this.categories()),
      'budget-battowski-import-template.xlsx',
    );
  }

  downloadWorkspaceExport(): void {
    const workspace = this.activeWorkspace();
    if (!workspace) {
      this.syncStatus.set('Select a workspace before exporting');
      return;
    }
    const exportedAt = new Date().toISOString();
    const workspaceExport = buildWorkspaceExport(
      workspace,
      {
        paymentAccounts: this.paymentAccounts(),
        paymentModes: this.withDefaultPaymentModes(this.paymentModes()),
        categories: this.categories(),
        incomes: this.incomes(),
        templates: this.templates(),
        expenses: this.expenses(),
        investments: this.investments(),
        loans: this.loans(),
      },
      exportedAt,
    );
    this.downloadBlob(
      new Blob([JSON.stringify(workspaceExport, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
      workspaceExportFilename(workspace, exportedAt),
    );
    this.syncStatus.set('Workspace export downloaded');
  }

  downloadProcessedImport(): void {
    const processedFile = this.processedImportFile();
    if (!processedFile) {
      return;
    }

    this.downloadBlob(processedFile.blob, processedFile.filename);
  }

  async importBudgetFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      const parsed = await parseBudgetImportFile(
        file,
        this.categories(),
        this.activeMembers(),
        this.paymentModes(),
      );
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

  async openBulkEditor(
    scope: BulkEditorScope,
    initialTabIndex = 0,
    initialEditingRowId?: string,
  ): Promise<void> {
    const { BulkEditorDialog: bulkEditorComponent } = await import('./bulk-editor-dialog');
    const data = {
      scope,
      initialTabIndex,
      initialEditingRowId,
      selectedMonth: this.selectedMonth(),
      members: this.activeMembers(),
      selectedMemberEmail: this.selectedMemberEmail(),
      actingMemberEmail: this.actingMemberEmail(),
      paymentAccounts: this.paymentAccounts(),
      paymentModes: this.paymentModes(),
      categories: this.categories().filter((category) => !category.archivedDate),
      incomes: this.filteredIncomes(),
      templates: this.filteredTemplates(),
      expenses: this.filteredExpenses(),
      investments: this.investmentPlans(),
      loans: this.filteredLoans(),
    };

    if (this.breakpointObserver.isMatched('(max-width: 760px)')) {
      const bottomSheetRef = this.bottomSheet.open<BulkEditorDialog, typeof data, BulkEditorResult>(
        bulkEditorComponent,
        {
          ariaLabel: 'Bulk editor',
          autoFocus: false,
          data,
          maxHeight: 'calc(100dvh - 44px)',
          panelClass: 'bulk-editor-sheet-panel',
          restoreFocus: true,
        },
      );

      bottomSheetRef.afterDismissed().subscribe((result) => {
        if (result) {
          void this.applyBulkChanges(result, data);
        }
      });
      return;
    }

    const dialogRef = this.dialog.open(bulkEditorComponent, {
      autoFocus: false,
      data,
      maxHeight: '100dvh',
      maxWidth: '98vw',
      panelClass: 'bulk-editor-panel',
      width: 'min(1540px, 98vw)',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        void this.applyBulkChanges(result, data);
      }
    });
  }

  async openMonthlyReview(): Promise<void> {
    if (!this.canReviewMonth()) {
      this.syncStatus.set('Review is available for current and future months only');
      return;
    }

    const { MonthlyReviewDialog: monthlyReviewComponent } = await import('./monthly-review-dialog');
    const data = {
      monthLabel: this.monthLabel(),
      rows: this.monthlyReviewRows(),
    };

    if (this.breakpointObserver.isMatched('(max-width: 760px)')) {
      const bottomSheetRef = this.bottomSheet.open<
        MonthlyReviewDialog,
        typeof data,
        MonthlyReviewResult
      >(monthlyReviewComponent, {
        ariaLabel: 'Review expected records',
        autoFocus: false,
        data,
        maxHeight: 'calc(100dvh - 16px)',
        panelClass: 'monthly-review-sheet-panel',
        restoreFocus: true,
      });

      bottomSheetRef.afterDismissed().subscribe((result) => {
        if (result) {
          void this.applyMonthlyReview(result);
        }
      });
      return;
    }

    const dialogRef = this.dialog.open(monthlyReviewComponent, {
      autoFocus: false,
      data,
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

  buildMonthlyReviewRows(month: string): MonthlyReviewRow[] {
    const existingExpensesByTemplateId = new Map(
      this.expenses()
        .filter((expense) => entryMonthKey(expense) === month && expense.templateId)
        .map((expense) => [expense.templateId!, expense]),
    );
    const expenseRows = this.templates()
      .filter((template) => !this.isTemplateMonthSkipped(template, month))
      .map((template) => this.templateVersionForMonth(template, month))
      .filter((template): template is ExpenseTemplate => !!template)
      .filter((template) => !!templateScheduleForMonth(template, month))
      .filter((template) => !existingExpensesByTemplateId.has(template.id))
      .map<MonthlyReviewRow>((template) => {
        const schedule = templateScheduleForMonth(template, month);

        return {
          id: `expense:${template.id}`,
          sourceId: template.id,
          sourceType: 'expense',
          label: template.name,
          categoryName: this.categoryName(template.categoryId),
          memberName: this.memberName(template.memberEmail),
          amount: schedule?.amount ?? template.amount,
        };
      });

    const existingInvestmentsByPlanId = new Map(
      this.investments()
        .filter(
          (investment) =>
            isOneTimeInvestment(investment) &&
            dateMonthKey(investment.date || investment.startDate || investment.createdDate) ===
              month &&
            investment.sourceInvestmentId,
        )
        .map((investment) => [investment.sourceInvestmentId!, investment]),
    );
    const investmentRows = this.investments()
      .filter(
        (investment) =>
          !investment.sourceInvestmentId &&
          !existingInvestmentsByPlanId.has(investment.id) &&
          !this.investments().some(
            (record) => record.id === this.reviewedInvestmentId(investment.id, month),
          ) &&
          !this.isInvestmentMonthSkipped(investment, month) &&
          (!isOneTimeInvestment(investment) || month > currentMonth()) &&
          !!investmentScheduleForMonth(investment, month),
      )
      .map<MonthlyReviewRow>((investment) => {
        const schedule = investmentScheduleForMonth(investment, month);

        return {
          id: `investment:${investment.id}`,
          sourceId: investment.id,
          sourceType: 'investment',
          label: investment.name,
          categoryName: investment.categoryId
            ? this.categoryName(investment.categoryId)
            : 'Investments',
          memberName: this.memberName(investment.memberEmail),
          amount: schedule?.amount ?? investment.amount,
        };
      });

    return [...expenseRows, ...investmentRows];
  }

  async applyMonthlyReview(result: MonthlyReviewResult): Promise<void> {
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
          memberEmail: existing?.memberEmail ?? effectiveTemplate.memberEmail,
        });
        continue;
      }

      const plan = investmentsById.get(row.sourceId);
      if (!plan) {
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
        date:
          investmentScheduleForMonth(plan, month)?.date ??
          dateInMonth(month, activeStartDate(plan.startDate, plan.date || plan.createdDate)),
        notes: plan.notes || 'Approved from recurring investment plan',
        createdDate: existing?.createdDate || new Date().toISOString(),
        sourceInvestmentId: plan.id,
        memberEmail: existing?.memberEmail ?? plan.memberEmail,
        ownerUid: existing?.ownerUid ?? plan.ownerUid,
        paymentModeId: plan.paymentModeId,
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

    const mutations: BudgetMutationSet = {
      templates: planEntityMutations(this.templates(), templates),
      expenses: planEntityMutations(this.expenses(), expenses, [...deletedExpenseIds]),
      investments: planEntityMutations(this.investments(), investments, [...deletedInvestmentIds]),
    };
    const saved = await this.runFirebaseWrite(
      async () => {
        const repository = this.repository();
        if (!repository) {
          return;
        }
        await repository.executeMutations(mutations);
      },
      () => {
        this.templates.set(applyEntityMutations(this.templates(), mutations.templates!));
        this.expenses.set(applyEntityMutations(this.expenses(), mutations.expenses!));
        this.investments.set(applyEntityMutations(this.investments(), mutations.investments!));
      },
    );

    if (saved) {
      this.syncStatus.set(
        this.repository() ? 'Monthly review saved to Firebase' : 'Monthly review saved',
      );
    }
  }

  private async applyImportRows(rows: BudgetImportRow[]): Promise<boolean> {
    const importerEmail = this.actingMemberEmail();
    const records = {
      paymentAccounts: rows
        .filter((row) => row.collectionName === 'paymentAccounts')
        .map((row) => ({ ...(row.record as PaymentAccount), memberEmail: importerEmail })),
      paymentModes: rows
        .filter((row) => row.collectionName === 'paymentModes')
        .map((row) => ({ ...(row.record as PaymentMode), memberEmail: importerEmail })),
      categories: rows
        .filter((row) => row.collectionName === 'categories')
        .map((row) => row.record as BudgetCategory),
      incomes: rows
        .filter((row) => row.collectionName === 'incomes')
        .map((row) => ({ ...(row.record as IncomeSource), memberEmail: importerEmail })),
      templates: rows
        .filter((row) => row.collectionName === 'templates')
        .map((row) => ({ ...(row.record as ExpenseTemplate), memberEmail: importerEmail })),
      expenses: rows
        .filter((row) => row.collectionName === 'expenses')
        .map((row) => ({ ...(row.record as ExpenseEntry), memberEmail: importerEmail })),
      investments: rows
        .filter((row) => row.collectionName === 'investments')
        .map((row) => ({ ...(row.record as InvestmentEntry), memberEmail: importerEmail })),
      loans: rows
        .filter((row) => row.collectionName === 'loans')
        .map((row) => ({ ...(row.record as Loan), memberEmail: importerEmail })),
    } satisfies { [TName in BudgetCollectionName]: BudgetDataMap[TName][] };

    const availableAccounts = [...this.paymentAccounts(), ...records.paymentAccounts];
    const availableModes = [...this.paymentModes(), ...records.paymentModes];
    const invalidImportedMode = records.paymentModes.some((mode) => {
      if (!mode.paymentAccountId) {
        return false;
      }
      const account = availableAccounts.find((item) => item.id === mode.paymentAccountId);
      return !account || account.memberEmail !== mode.memberEmail;
    });
    const importedFinancialRecords = [
      ...records.templates,
      ...records.expenses,
      ...records.investments,
      ...records.loans,
    ];
    const invalidImportedRecord = importedFinancialRecords.some((record) => {
      if (!record.paymentModeId) {
        return false;
      }
      const mode = availableModes.find((item) => item.id === record.paymentModeId);
      const account = mode?.paymentAccountId
        ? availableAccounts.find((item) => item.id === mode.paymentAccountId)
        : undefined;
      return (
        !mode ||
        (!this.isWorkspaceGlobalCashMode(mode) && mode.memberEmail !== record.memberEmail) ||
        (!!mode.paymentAccountId &&
          (!account ||
            account.memberEmail !== mode.memberEmail ||
            account.memberEmail !== record.memberEmail))
      );
    });
    if (invalidImportedMode || invalidImportedRecord) {
      this.syncStatus.set(
        'Imported accounts, payment modes, and financial records must have the same owner',
      );
      return false;
    }

    return this.runFirebaseWrite(
      async () => {
        const repository = this.repository();
        if (!repository) {
          return;
        }

        await Promise.all([
          repository.upsertMany('paymentAccounts', records.paymentAccounts),
          repository.upsertMany('paymentModes', records.paymentModes),
          repository.upsertMany('categories', records.categories),
          repository.upsertMany('incomes', records.incomes),
          repository.upsertMany('templates', records.templates),
          repository.upsertMany('expenses', records.expenses),
          repository.upsertMany('investments', records.investments),
          repository.upsertMany('loans', records.loans),
        ]);
      },
      () => {
        this.paymentAccounts.update((items) =>
          [...items, ...records.paymentAccounts].sort(comparePaymentAccounts),
        );
        this.paymentModes.update((items) =>
          [...items, ...records.paymentModes].sort(comparePaymentModes),
        );
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
      .join('|')}:${this.selectedMemberEmail()}`;

    if (
      this.prefillAttemptedSignatures().has(signature) ||
      this.prefillInFlightSignatures().has(signature)
    ) {
      return;
    }

    this.prefillInFlightSignatures.update((signatures) => new Set(signatures).add(signature));

    try {
      const saved = await this.saveRecords('expenses', newEntries, () =>
        this.expenses.update((items) => [...items, ...newEntries]),
      );
      if (saved) {
        this.prefillAttemptedSignatures.update((signatures) => new Set(signatures).add(signature));
      }
    } finally {
      this.prefillInFlightSignatures.update((signatures) => {
        const next = new Set(signatures);
        next.delete(signature);
        return next;
      });
    }
  }

  buildDefaultMonthEntries(month: string): ExpenseEntry[] {
    const existingTemplateIds = new Set(
      this.filteredExpenses()
        .filter((expense) => entryMonthKey(expense) === month && expense.templateId)
        .map((expense) => expense.templateId),
    );

    const templateEntries =
      month < currentMonth()
        ? this.filteredTemplates()
            .filter(
              (template) =>
                !existingTemplateIds.has(template.id) &&
                !this.isTemplateMonthSkipped(template, month),
            )
            .map((template) => this.templateVersionForMonth(template, month))
            .filter((template): template is ExpenseTemplate => !!template)
            .filter((template) => !!templateScheduleForMonth(template, month))
            .map<ExpenseEntry>((template) => this.expenseFromTemplate(template, month))
        : [];

    const loanEntries = this.filteredLoans()
      .filter((loan) => {
        const templateId = this.loanTemplateId(loan.id);
        return (
          loan.emi > 0 &&
          !existingTemplateIds.has(templateId) &&
          isLoanOccurrenceInRange(month, loan.startDate, loan.endDate)
        );
      })
      .map<ExpenseEntry>((loan) => ({
        id: `review:loan:${loan.id}:${month}`,
        month,
        date: loanOccurrenceDate(month, loan.startDate),
        name: this.loanExpenseName(loan),
        categoryId: this.loanEmiCategoryId(),
        amount: loan.emi,
        type: 'recurring',
        note: 'Prepopulated from loan EMI',
        templateId: this.loanTemplateId(loan.id),
        sourceLoanId: loan.id,
        memberEmail: loan.memberEmail,
        ownerUid: loan.ownerUid,
        paymentModeId: loan.paymentModeId,
      }));

    return [...templateEntries, ...loanEntries];
  }

  categoryName(categoryId: string): string {
    if (categoryId === DEFAULT_LOAN_EMI_CATEGORY.id || categoryId === '__loan_emi__') {
      return 'Loan EMI';
    }

    return (
      this.categories().find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
    );
  }

  paymentModeLabel(paymentModeId: string | undefined): string {
    if (!paymentModeId) {
      return '';
    }

    const paymentMode = this.withDefaultPaymentModes(this.paymentModes()).find(
      (mode) => mode.id === paymentModeId,
    );
    if (!paymentMode) {
      return 'Saved payment mode';
    }

    return this.paymentModeDisplayLabel(paymentMode);
  }

  paymentModeDetail(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return paymentMode.lastFour
        ? `xxxx xxxx xxxx ${paymentMode.lastFour}`
        : 'xxxx xxxx xxxx ----';
    }

    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    if (paymentMode.type === 'internet-banking') {
      const paymentAccount = this.paymentAccountForMode(paymentMode);
      return paymentAccount
        ? this.paymentAccountDetail(paymentAccount)
        : (paymentMode.bankName ?? DEFAULT_BANK_NAME);
    }

    return (
      this.paymentProviderLabel(paymentMode.provider) ?? this.paymentModeTypeLabel(paymentMode.type)
    );
  }

  paymentModeTypeLabel(type: PaymentModeType): string {
    const labels: Record<PaymentModeType, string> = {
      cash: 'Cash',
      upi: 'UPI',
      'credit-card': 'Credit Card',
      'debit-card': 'Debit Card',
      'internet-banking': 'Internet Banking',
    };

    return labels[type] ?? 'Payment Mode';
  }

  paymentModeIcon(type: PaymentModeType): string {
    if (type === 'cash') {
      return 'payments';
    }

    if (type === 'upi') {
      return 'qr_code_2';
    }

    if (type === 'internet-banking') {
      return 'account_balance';
    }

    return 'credit_card';
  }

  paymentModeIconSrc(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'internet-banking') {
      const paymentAccount = this.paymentAccountForMode(paymentMode);
      return paymentAccount
        ? this.paymentAccountIconSrc(paymentAccount)
        : this.bankIconSrc(paymentMode.bankName);
    }

    if (paymentMode.type === 'cash') {
      return '/payment-icons/cash.svg';
    }

    if (paymentMode.provider) {
      return PAYMENT_PROVIDER_ICONS[paymentMode.provider] ?? '/payment-icons/cash.svg';
    }

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return paymentMode.cardType
        ? (PAYMENT_CARD_ICONS[paymentMode.cardType] ?? DEFAULT_CARD_ICON)
        : DEFAULT_CARD_ICON;
    }

    return DEFAULT_CARD_ICON;
  }

  paymentAccountDetail(paymentAccount: Pick<PaymentAccount, 'lastFour'>): string {
    return paymentAccount.lastFour ? `xxxx ${paymentAccount.lastFour}` : 'xxxx ----';
  }

  paymentAccountIconSrc(paymentAccount: Pick<PaymentAccount, 'bankName'>): string {
    return this.bankIconSrc(paymentAccount.bankName);
  }

  paymentAccountLabel(paymentAccount: Pick<PaymentAccount, 'bankName'>): string {
    return paymentAccount.bankName;
  }

  paymentModeDisplayLabel(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    const paymentAccount = this.paymentAccountForMode(paymentMode);

    if (paymentMode.type === 'upi') {
      return (
        this.paymentProviderLabel(paymentMode.provider) ??
        this.paymentModeTypeLabel(paymentMode.type)
      );
    }

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return this.paymentModeTypeLabel(paymentMode.type);
    }

    if (paymentMode.type === 'internet-banking') {
      return paymentAccount?.bankName ?? 'Internet Banking';
    }

    return paymentMode.name?.trim() || this.paymentModeTypeLabel(paymentMode.type);
  }

  paymentModeShortLabel(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    const paymentAccount = this.paymentAccountForMode(paymentMode);
    const ownerTag = this.memberTag(this.paymentModeMemberEmail(paymentMode));

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return `${ownerTag} ${this.lastFourLabel(paymentMode.lastFour)}`;
    }

    if (paymentMode.type === 'internet-banking') {
      return `${ownerTag} ${this.lastFourLabel(paymentAccount?.lastFour)}`;
    }

    return ownerTag;
  }

  paymentModeOwnerTag(paymentMode: PaymentMode): string {
    return this.memberTag(this.paymentModeMemberEmail(paymentMode));
  }

  paymentModeMeta(paymentModeId: string | undefined): {
    iconSrc: string;
    label: string;
    tone: string;
    typeLabel: string;
  } | null {
    if (!paymentModeId) {
      return null;
    }

    const paymentMode = this.withDefaultPaymentModes(this.paymentModes()).find(
      (mode) => mode.id === paymentModeId,
    );
    if (!paymentMode) {
      return {
        iconSrc: DEFAULT_CARD_ICON,
        label: 'Saved payment mode',
        tone: 'neutral',
        typeLabel: 'Payment mode',
      };
    }

    return {
      iconSrc: this.paymentModeIconSrc(paymentMode),
      label: this.paymentModeShortLabel(paymentMode),
      tone: this.paymentModeVisualTone(paymentMode),
      typeLabel: this.paymentModeTypeLabel(paymentMode.type),
    };
  }

  paymentProviderTone(provider: PaymentModeProvider | string | undefined): string {
    return provider ? (PAYMENT_PROVIDER_TONES[provider] ?? 'card') : 'card';
  }

  paymentModesForAccount(paymentAccountId: string): PaymentMode[] {
    return this.activePaymentModes().filter(
      (paymentMode) => paymentMode.paymentAccountId === paymentAccountId,
    );
  }

  canArchivePaymentAccount(paymentAccountId: string): boolean {
    return this.paymentModesForAccount(paymentAccountId).length === 0;
  }

  paymentAccountUsage(paymentAccountId: string): { amount: number; count: number } {
    return this.paymentModesForAccount(paymentAccountId).reduce(
      (total, paymentMode) => {
        const usage = this.paymentModeUsage(paymentMode.id);
        return {
          amount: total.amount + usage.amount,
          count: total.count + usage.count,
        };
      },
      { amount: 0, count: 0 },
    );
  }

  private paymentProviderLabel(
    provider: PaymentModeProvider | string | undefined,
  ): string | undefined {
    if (provider === 'GPay') {
      return 'Google Pay';
    }

    if (provider === 'SamsungPay') {
      return 'Samsung Pay';
    }

    return provider;
  }

  private paymentAccountForMode(paymentMode: PaymentMode): PaymentAccount | undefined {
    if (!paymentMode.paymentAccountId) {
      return undefined;
    }

    return this.paymentAccounts().find((account) => account.id === paymentMode.paymentAccountId);
  }

  private paymentModeMemberEmail(paymentMode: PaymentMode): string | undefined {
    return paymentMode.memberEmail ?? this.paymentAccountForMode(paymentMode)?.memberEmail;
  }

  private lastFourLabel(lastFour: string | undefined): string {
    return lastFour?.replace(/\D/g, '').slice(-4) || '----';
  }

  private withDerivedPaymentModeName(paymentMode: PaymentMode): PaymentMode {
    return {
      ...paymentMode,
      name: this.paymentModeDisplayLabel(paymentMode),
    };
  }

  private bankIconSrc(bankName: PaymentBankName | string | undefined): string {
    return bankName && bankName in PAYMENT_BANK_ICON_BY_NAME
      ? PAYMENT_BANK_ICON_BY_NAME[bankName as PaymentBankName]
      : DEFAULT_BANK_ICON;
  }

  private paymentBankNameValue(bankName: PaymentBankName | string | undefined): PaymentBankName {
    return bankName && bankName in PAYMENT_BANK_ICON_BY_NAME
      ? (bankName as PaymentBankName)
      : DEFAULT_BANK_NAME;
  }

  private shortMemberName(name: string): string {
    const [firstName, secondName] = name.split(/\s+/).filter(Boolean);
    if (!firstName) {
      return 'Unassigned';
    }

    return secondName ? `${firstName} ${secondName[0].toUpperCase()}` : firstName;
  }

  private paymentModeVisualTone(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'internet-banking') {
      return 'bank';
    }

    if (paymentMode.provider) {
      return this.paymentProviderTone(paymentMode.provider);
    }

    if (paymentMode.type === 'cash') {
      return 'cash';
    }

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return 'card';
    }

    return paymentMode.type;
  }

  paymentModeTone(paymentModeId: string | undefined): string {
    const paymentMode = this.withDefaultPaymentModes(this.paymentModes()).find(
      (mode) => mode.id === paymentModeId,
    );
    if (!paymentMode) {
      return 'neutral';
    }

    return this.paymentModeVisualTone(paymentMode);
  }

  paymentModeUsage(paymentModeId: string): { amount: number; count: number } {
    let amount = 0;
    let count = 0;

    for (const expense of this.selectedEntries()) {
      if (expense.paymentModeId === paymentModeId) {
        amount += expense.amount;
        count += 1;
      }
    }

    for (const expense of this.legacyInvestmentEntries()) {
      if (expense.paymentModeId === paymentModeId) {
        amount += expense.amount;
        count += 1;
      }
    }

    for (const investment of this.selectedInvestments()) {
      if (investment.paymentModeId === paymentModeId) {
        amount += investmentScheduleForMonth(investment, this.selectedMonth())?.amount ?? 0;
        count += 1;
      }
    }

    return { amount, count };
  }

  async saveOnboardingProgress(progress: OnboardingProgress): Promise<void> {
    this.onboardingProgress.set(progress);
    const email = this.userEmail();
    const uid = this.userUid();
    if (!email || !uid || !this.firebase.app) {
      return;
    }

    await BudgetFirestoreRepository.upsertUserProfile(this.firebase.app, {
      email,
      uid,
      displayName: this.userName() || email,
      photoUrl: this.userPhoto() || undefined,
      updatedDate: new Date().toISOString(),
      onboarding: progress,
    }).catch(() => {
      this.syncStatus.set('Onboarding progress will retry on the next update');
    });
  }

  async savePaymentMode(paymentMode: PaymentMode): Promise<boolean> {
    const normalized = this.normalizePaymentMode(paymentMode);
    if (normalized.type === 'cash' && !this.isWorkspaceGlobalCashMode(normalized)) {
      this.syncStatus.set('Cash is a workspace-global mode and cannot be created per member');
      return false;
    }
    const linkedAccount = normalized.paymentAccountId
      ? this.paymentAccounts().find((account) => account.id === normalized.paymentAccountId)
      : undefined;
    if (
      normalized.paymentAccountId &&
      (!linkedAccount ||
        !!linkedAccount.archivedDate ||
        linkedAccount.memberEmail !== normalized.memberEmail)
    ) {
      this.syncStatus.set(
        'A payment mode can only link to an active account owned by the same member',
      );
      return false;
    }

    const saved = await this.saveRecords('paymentModes', [normalized], () => {
      this.paymentModes.update((paymentModes) => {
        const others = paymentModes.filter((mode) => mode.id !== normalized.id);
        return [...others, normalized].sort(comparePaymentModes);
      });
    });

    if (saved) {
      this.syncStatus.set(
        this.repository() ? 'Payment mode saved to Firebase' : 'Payment mode saved',
      );
    }

    return saved;
  }

  async archivePaymentMode(paymentModeId: string): Promise<boolean> {
    if (paymentModeId === DEFAULT_CASH_PAYMENT_MODE.id) {
      return false;
    }

    const paymentMode = this.paymentModes().find((mode) => mode.id === paymentModeId);
    if (!paymentMode) {
      return false;
    }

    return this.savePaymentMode({
      ...paymentMode,
      archivedDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    });
  }

  async restorePaymentMode(paymentModeId: string): Promise<boolean> {
    const paymentMode = this.paymentModes().find((mode) => mode.id === paymentModeId);
    if (!paymentMode?.archivedDate) {
      return false;
    }

    return this.savePaymentMode({
      ...paymentMode,
      archivedDate: undefined,
      updatedDate: new Date().toISOString(),
    });
  }

  async deleteArchivedPaymentMode(paymentModeId: string): Promise<boolean> {
    if (paymentModeId === DEFAULT_CASH_PAYMENT_MODE.id) {
      return false;
    }

    const paymentMode = this.paymentModes().find((mode) => mode.id === paymentModeId);
    if (!paymentMode?.archivedDate) {
      return false;
    }

    const isReferenced =
      this.expenses().some((record) => record.paymentModeId === paymentModeId) ||
      this.templates().some((record) => record.paymentModeId === paymentModeId) ||
      this.investments().some((record) => record.paymentModeId === paymentModeId) ||
      this.loans().some((record) => record.paymentModeId === paymentModeId);
    if (isReferenced) {
      this.syncStatus.set('This payment mode is retained because financial records reference it');
      return false;
    }

    const confirmed = await this.openWorkspaceConfirm({
      title: 'Delete Payment Mode',
      message: `Permanently delete ${this.paymentModeDisplayLabel(paymentMode)}?`,
      confirmLabel: 'Delete',
      icon: 'delete_forever',
    });
    if (!confirmed) {
      return false;
    }

    const deleted = await this.runFirebaseWrite(
      async () => {
        await this.repository()?.delete('paymentModes', paymentMode.id);
      },
      () => {
        this.paymentModes.update((paymentModes) =>
          paymentModes.filter((mode) => mode.id !== paymentMode.id),
        );
      },
    );

    if (deleted) {
      this.syncStatus.set('Archived payment mode deleted');
    }

    return deleted;
  }

  async savePaymentAccount(paymentAccount: PaymentAccount): Promise<boolean> {
    const normalized = this.normalizePaymentAccount(paymentAccount);
    const saved = await this.saveRecords('paymentAccounts', [normalized], () => {
      this.paymentAccounts.update((paymentAccounts) => {
        const others = paymentAccounts.filter((account) => account.id !== normalized.id);
        return [...others, normalized].sort(comparePaymentAccounts);
      });
    });

    if (saved) {
      this.syncStatus.set(
        this.repository() ? 'Payment account saved to Firebase' : 'Payment account saved',
      );
    }

    return saved;
  }

  async archivePaymentAccount(paymentAccountId: string): Promise<boolean> {
    if (!this.canArchivePaymentAccount(paymentAccountId)) {
      this.syncStatus.set('Remove mapped payment modes before archiving this account');
      return false;
    }

    const paymentAccount = this.paymentAccounts().find(
      (account) => account.id === paymentAccountId,
    );
    if (!paymentAccount) {
      return false;
    }

    return this.savePaymentAccount({
      ...paymentAccount,
      archivedDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    });
  }

  async restorePaymentAccount(paymentAccountId: string): Promise<boolean> {
    const paymentAccount = this.paymentAccounts().find(
      (account) => account.id === paymentAccountId,
    );
    if (!paymentAccount?.archivedDate) {
      return false;
    }

    return this.savePaymentAccount({
      ...paymentAccount,
      archivedDate: undefined,
      updatedDate: new Date().toISOString(),
    });
  }

  async deleteArchivedPaymentAccount(paymentAccountId: string): Promise<boolean> {
    const paymentAccount = this.paymentAccounts().find(
      (account) => account.id === paymentAccountId,
    );
    if (!paymentAccount?.archivedDate) {
      return false;
    }

    if (
      this.paymentModes().some((paymentMode) => paymentMode.paymentAccountId === paymentAccount.id)
    ) {
      this.syncStatus.set('This account is retained because payment modes reference it');
      return false;
    }

    const confirmed = await this.openWorkspaceConfirm({
      title: 'Delete Payment Account',
      message: `Permanently delete ${this.paymentAccountLabel(paymentAccount)}?`,
      confirmLabel: 'Delete',
      icon: 'delete_forever',
    });
    if (!confirmed) {
      return false;
    }

    const deleted = await this.runFirebaseWrite(
      async () => {
        await this.repository()?.delete('paymentAccounts', paymentAccount.id);
      },
      () => {
        this.paymentAccounts.update((paymentAccounts) =>
          paymentAccounts.filter((account) => account.id !== paymentAccount.id),
        );
      },
    );

    if (deleted) {
      this.syncStatus.set('Archived payment account deleted');
    }

    return deleted;
  }

  memberName(memberEmail: string | undefined): string {
    if (!memberEmail) {
      return 'Unassigned';
    }

    const member = this.activeWorkspace()?.members.find((item) => item.email === memberEmail);
    return member ? this.memberDisplayName(member) : memberEmail;
  }

  memberDisplayName(member: WorkspaceMember): string {
    return member.displayName || member.email;
  }

  memberInitial(memberEmail: string | undefined): string {
    const name = this.memberName(memberEmail);
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  memberTag(memberEmail: string | undefined): string {
    return memberEmail ? this.shortMemberName(this.memberName(memberEmail)) : 'Legacy';
  }

  actingMemberEmail(): string | undefined {
    if (this.userEmail()) {
      return this.userEmail() ?? undefined;
    }

    const selected = this.selectedMemberEmail();
    return selected === 'ALL' ? undefined : selected;
  }

  isWorkspaceGlobalCashMode(paymentMode: Pick<PaymentMode, 'id' | 'type'>): boolean {
    return paymentMode.id === DEFAULT_CASH_PAYMENT_MODE.id && paymentMode.type === 'cash';
  }

  paymentAccountsForPaymentMode(
    paymentMode?: Pick<PaymentMode, 'memberEmail' | 'paymentAccountId'>,
  ): PaymentAccount[] {
    const ownerEmail = paymentMode?.memberEmail ?? this.actingMemberEmail();
    return this.paymentAccounts()
      .filter(
        (account) =>
          (!account.archivedDate && !!ownerEmail && account.memberEmail === ownerEmail) ||
          account.id === paymentMode?.paymentAccountId,
      )
      .sort(comparePaymentAccounts);
  }

  categoryColor(categoryId: string): string {
    if (categoryId === DEFAULT_LOAN_EMI_CATEGORY.id || categoryId === '__loan_emi__') {
      return DEFAULT_LOAN_EMI_CATEGORY.color;
    }

    return this.categories().find((category) => category.id === categoryId)?.color ?? '#64748b';
  }

  categoryIcon(categoryName: string): string {
    const normalized = categoryName.toLowerCase();
    if (
      normalized.includes('housing') ||
      normalized.includes('home') ||
      normalized.includes('rent')
    ) {
      return 'home';
    }

    if (normalized.includes('food') || normalized.includes('grocery')) {
      return 'shopping_cart';
    }

    if (normalized.includes('utilit') || normalized.includes('electric')) {
      return 'bolt';
    }

    if (normalized.includes('health') || normalized.includes('gym')) {
      return 'favorite';
    }

    if (
      normalized.includes('transport') ||
      normalized.includes('travel') ||
      normalized.includes('car')
    ) {
      return 'directions_car';
    }

    if (normalized.includes('entertain') || normalized.includes('netflix')) {
      return 'movie';
    }

    if (normalized.includes('shopping')) {
      return 'local_mall';
    }

    if (normalized.includes('education')) {
      return 'school';
    }

    if (normalized.includes('loan') || normalized.includes('emi')) {
      return 'account_balance';
    }

    if (normalized.includes('invest')) {
      return 'trending_up';
    }

    return 'more_horiz';
  }

  categoryTone(categoryName: string): string {
    const normalized = categoryName.toLowerCase();
    if (
      normalized.includes('housing') ||
      normalized.includes('home') ||
      normalized.includes('rent')
    ) {
      return 'blue';
    }

    if (normalized.includes('food') || normalized.includes('grocery')) {
      return 'orange';
    }

    if (
      normalized.includes('health') ||
      normalized.includes('loan') ||
      normalized.includes('emi')
    ) {
      return 'red';
    }

    if (normalized.includes('shopping') || normalized.includes('entertain')) {
      return 'purple';
    }

    if (
      normalized.includes('transport') ||
      normalized.includes('travel') ||
      normalized.includes('invest')
    ) {
      return 'teal';
    }

    if (normalized.includes('education')) {
      return 'indigo';
    }

    return 'slate';
  }

  categoryStatusLabel(used: number): string {
    if (used > 1) {
      return 'Over Budget';
    }

    if (used >= 0.75) {
      return 'Near Limit';
    }

    return 'Healthy';
  }

  categoryStatusTone(used: number): string {
    if (used > 1) {
      return 'danger';
    }

    if (used >= 0.75) {
      return 'warning';
    }

    return 'success';
  }

  recordDate(record: Pick<ExpenseEntry, 'date' | 'month'>): string {
    return record.date || monthStartDate(entryMonthKey(record));
  }

  shortDateLabel(date: string): string {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(
      dateFromIso(date),
    );
  }

  monthDayLabel(date: string): string {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
      dateFromIso(date),
    );
  }

  private matchesSelectedMember(record: { memberEmail?: string }): boolean {
    const selected = this.selectedMemberEmail();
    if (selected === 'ALL') {
      return true;
    }

    return record.memberEmail === selected;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  expenseTypeLabel(expense: ExpenseEntry): ExpenseType {
    return normalizedExpenseType(expense) === 'recurring' ? 'recurring' : 'one-time';
  }

  investmentFrequencyLabel(investment: { frequency?: InvestmentFrequency }): string {
    return investment.frequency ?? 'monthly';
  }

  private monthlyIncomeAmount(income: IncomeSource): number {
    if (income.cadence === 'one-time') {
      const incomeMonth = income.month ?? dateMonthKey(income.startDate || income.createdDate);
      return incomeMonth === this.selectedMonth() ? income.amount : 0;
    }

    return income.amount;
  }

  private incomeTotalForMonth(month: string): number {
    return this.filteredIncomes().reduce((total, income) => {
      const version = this.incomeVersionForMonth(income, month);
      if (!version) {
        return total;
      }
      if (version.cadence === 'one-time') {
        const incomeMonth = version.month ?? dateMonthKey(version.startDate || income.createdDate);
        return total + (incomeMonth === month ? version.amount : 0);
      }
      return total + version.amount;
    }, 0);
  }

  private incomeVersionForMonth(income: IncomeSource, month: string): IncomeSource | null {
    const monthStart = monthStartDate(month);
    const monthEnd = monthEndDate(month);
    const audit = [...(income.auditTrail ?? [])]
      .filter(
        (version) =>
          (!version.effectiveStartDate || version.effectiveStartDate <= monthEnd) &&
          (!version.effectiveEndDate || version.effectiveEndDate >= monthStart),
      )
      .sort((left, right) =>
        (right.effectiveStartDate || '').localeCompare(left.effectiveStartDate || ''),
      )[0];
    if (audit) {
      return {
        ...income,
        source: audit.source,
        amount: audit.amount,
        cadence: audit.cadence,
        categoryId: audit.categoryId,
        notes: audit.notes ?? '',
        month: audit.month,
        startDate: audit.startDate,
        endDate: audit.endDate,
        memberEmail: audit.memberEmail,
      };
    }

    const startDate = activeStartDate(
      income.startDate,
      incomeMonthStartDate(income.month) || income.createdDate,
    );
    return isMonthInRange(month, startDate, income.endDate) ? income : null;
  }

  private confirmedInvestmentsForMonth(month: string): InvestmentEntry[] {
    return this.filteredInvestments().filter((investment) => {
      if (investment.sourceInvestmentId) {
        return (
          dateMonthKey(investment.date || investment.startDate || investment.createdDate) === month
        );
      }

      if (!isOneTimeInvestment(investment)) {
        return false;
      }

      const scheduledMonth = dateMonthKey(
        investment.date || investment.startDate || investment.createdDate,
      );
      return !!scheduledMonth && scheduledMonth <= currentMonth() && scheduledMonth === month;
    });
  }

  private categoryBudgetForMonth(category: BudgetCategory, month: string): number {
    const effectiveVersion = [...(category.budgetVersions ?? [])]
      .filter((version) => version.effectiveMonth <= month)
      .sort((left, right) => right.effectiveMonth.localeCompare(left.effectiveMonth))[0];

    return effectiveVersion?.monthlyBudget ?? category.monthlyBudget;
  }

  private scheduledInvestmentTotalThrough(investment: InvestmentEntry, endMonth: string): number {
    const startMonth =
      dateMonthKey(investment.startDate || investment.date || investment.createdDate) ?? endMonth;
    let cursor = startMonth;
    let total = 0;
    let guard = 0;

    while (cursor <= endMonth && guard < 180) {
      total += investmentScheduleForMonth(investment, cursor)?.amount ?? 0;
      cursor = addMonths(cursor, 1);
      guard += 1;
    }

    return total;
  }

  private loanColor(loanId: string): string {
    const colors = ['#2f80ed', '#ff6b00', '#ff2f4f', '#14b8a6', '#7c3aed'];
    const index = Math.abs(
      [...loanId].reduce((total, character) => total + character.charCodeAt(0), 0),
    );

    return colors[index % colors.length];
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

  private findCashPaymentMode(paymentModes: PaymentMode[]): PaymentMode | undefined {
    return paymentModes.find((paymentMode) => paymentMode.id === DEFAULT_CASH_PAYMENT_MODE.id);
  }

  private withDefaultPaymentModes(paymentModes: PaymentMode[]): PaymentMode[] {
    if (this.findCashPaymentMode(paymentModes)) {
      return paymentModes.map((paymentMode) =>
        paymentMode.id === DEFAULT_CASH_PAYMENT_MODE.id
          ? { ...paymentMode, ...DEFAULT_CASH_PAYMENT_MODE, memberEmail: undefined }
          : paymentMode,
      );
    }

    return [...paymentModes, DEFAULT_CASH_PAYMENT_MODE];
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
    const repository = this.repository();
    if (
      !repository ||
      this.findLoanEmiCategory(categories) ||
      this.loanEmiCategoryUpsertInFlight()
    ) {
      return;
    }

    this.loanEmiCategoryUpsertInFlight.set(true);
    void repository
      .upsert('categories', DEFAULT_LOAN_EMI_CATEGORY)
      .catch((error: unknown) =>
        this.handleSyncError(
          error instanceof Error ? error.message : 'Unable to create Loan EMI category.',
        ),
      )
      .finally(() => {
        this.loanEmiCategoryUpsertInFlight.set(false);
      });
  }

  private ensureDefaultPaymentModeRecord(paymentModes: PaymentMode[]): void {
    const repository = this.repository();
    if (
      !repository ||
      this.findCashPaymentMode(paymentModes)?.workspaceGlobal === true ||
      this.cashPaymentModeUpsertInFlight()
    ) {
      return;
    }

    this.cashPaymentModeUpsertInFlight.set(true);
    void repository
      .upsert('paymentModes', DEFAULT_CASH_PAYMENT_MODE)
      .catch((error: unknown) =>
        this.handleSyncError(
          error instanceof Error ? error.message : 'Unable to create Cash payment mode.',
        ),
      )
      .finally(() => {
        this.cashPaymentModeUpsertInFlight.set(false);
      });
  }

  private expenseFromTemplate(
    template: ExpenseTemplate,
    month: string,
    existing?: ExpenseEntry,
  ): ExpenseEntry {
    return {
      id: existing?.id ?? `review:expense:${template.id}:${month}`,
      month,
      date:
        templateScheduleForMonth(template, month)?.date ?? dateInMonth(month, template.startDate),
      name: template.name,
      categoryId: template.categoryId,
      amount: templateScheduleForMonth(template, month)?.amount ?? template.amount,
      type: 'recurring',
      note: existing?.note || 'Prepopulated from recurring plan',
      templateId: template.id,
      memberEmail: template.memberEmail,
      ownerUid: existing?.ownerUid ?? template.ownerUid,
      paymentModeId: template.paymentModeId,
    };
  }

  templateVersionForMonth(template: ExpenseTemplate, month: string): ExpenseTemplate | null {
    if (
      template.archivedDate &&
      template.endDate &&
      month > (dateMonthKey(template.endDate) ?? '')
    ) {
      return null;
    }

    const auditVersion = (template.auditTrail ?? []).find((audit) => {
      if (audit.operation === 'deleted') {
        return false;
      }
      const auditTemplate: ExpenseTemplate = {
        ...template,
        name: audit.name,
        categoryId: audit.categoryId,
        amount: audit.amount,
        frequency: audit.frequency ?? 'monthly',
        startDate: audit.startDate,
        effectiveStartDate: audit.effectiveStartDate,
        endDate: audit.endDate,
      };
      const occurrence = templateScheduleForMonth(auditTemplate, month);
      return !!occurrence && isVersionEffectiveOnDate(audit, occurrence.date);
    });

    if (auditVersion) {
      return {
        ...template,
        name: auditVersion.name,
        categoryId: auditVersion.categoryId,
        amount: auditVersion.amount,
        frequency: auditVersion.frequency ?? template.frequency ?? 'monthly',
        startDate: auditVersion.startDate,
        effectiveStartDate: auditVersion.effectiveStartDate,
        endDate: auditVersion.endDate,
        memberEmail: auditVersion.memberEmail ?? template.memberEmail,
        paymentModeId: auditVersion.paymentModeId ?? template.paymentModeId,
      };
    }

    const currentOccurrence = templateScheduleForMonth(template, month);
    if (
      currentOccurrence &&
      (!template.effectiveStartDate || currentOccurrence.date >= template.effectiveStartDate)
    ) {
      return template;
    }

    return null;
  }

  private isTemplateChanged(previous: ExpenseTemplate | undefined, next: ExpenseTemplate): boolean {
    return (
      !previous ||
      previous.amount !== next.amount ||
      (previous.frequency ?? 'monthly') !== (next.frequency ?? 'monthly') ||
      (previous.startDate || '') !== (next.startDate || '') ||
      (previous.endDate || '') !== (next.endDate || '') ||
      (previous.memberEmail || '') !== (next.memberEmail || '') ||
      (previous.paymentModeId || '') !== (next.paymentModeId || '')
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
      effectiveStartDate:
        template.effectiveStartDate ?? activeStartDate(template.startDate, template.createdDate),
      effectiveEndDate,
      name: template.name,
      categoryId: template.categoryId,
      amount: template.amount,
      frequency: template.frequency ?? 'monthly',
      startDate: template.startDate,
      endDate: template.endDate,
      memberEmail: template.memberEmail,
      paymentModeId: template.paymentModeId,
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
        (audit.frequency ?? 'monthly') === (auditVersion.frequency ?? 'monthly') &&
        (audit.startDate || '') === (auditVersion.startDate || '') &&
        (audit.endDate || '') === (auditVersion.endDate || '') &&
        (audit.memberEmail || '') === (auditVersion.memberEmail || '') &&
        (audit.paymentModeId || '') === (auditVersion.paymentModeId || ''),
    );
  }

  private createdAuditVersion(template: ExpenseTemplate): ExpenseTemplateAuditVersion {
    return {
      id: id('audit'),
      operation: 'created',
      recordedDate: new Date().toISOString(),
      effectiveStartDate:
        template.effectiveStartDate ?? activeStartDate(template.startDate, template.createdDate),
      name: template.name,
      categoryId: template.categoryId,
      amount: template.amount,
      frequency: template.frequency ?? 'monthly',
      startDate: template.startDate,
      endDate: template.endDate,
      memberEmail: template.memberEmail,
      paymentModeId: template.paymentModeId,
    };
  }

  normalizeMonthlyTemplate(
    template: ExpenseTemplate,
    previous: ExpenseTemplate | undefined,
    operationDate: string,
  ): ExpenseTemplate {
    operationDate = operationDate.length === 7 ? monthStartDate(operationDate) : operationDate;
    if (!previous) {
      return {
        ...template,
        frequency: template.frequency ?? 'monthly',
        startDate: template.startDate || operationDate,
        effectiveStartDate: template.effectiveStartDate || template.startDate || operationDate,
        auditTrail: template.auditTrail ?? [],
      };
    }

    const immutableTemplate = {
      ...template,
      name: previous.name,
      categoryId: previous.categoryId,
      memberEmail: previous.memberEmail,
    };

    if (!this.isTemplateChanged(previous, immutableTemplate)) {
      return {
        ...immutableTemplate,
        frequency: immutableTemplate.frequency ?? 'monthly',
        createdDate: previous.createdDate || template.createdDate,
        auditTrail: previous.auditTrail ?? template.auditTrail ?? [],
      };
    }

    const effectiveStartDate = laterDate(
      immutableTemplate.startDate || operationDate,
      operationDate,
    );
    const effectiveEndDate = previousDate(effectiveStartDate);
    const auditVersion = this.auditVersionFromTemplate(previous, 'updated', effectiveEndDate);
    const auditTrail = this.hasMatchingTemplateAudit(previous.auditTrail, auditVersion)
      ? (previous.auditTrail ?? [])
      : [...(previous.auditTrail ?? []), auditVersion];

    return {
      ...immutableTemplate,
      frequency: immutableTemplate.frequency ?? 'monthly',
      createdDate: previous.createdDate || template.createdDate,
      startDate: immutableTemplate.startDate || previous.startDate,
      effectiveStartDate,
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
    operationDate: string,
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
      memberEmail: previous.memberEmail,
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
        operationDate,
      operationDate,
    );
    const auditVersion = this.auditVersionFromIncome(
      previous,
      'updated',
      previousDate(effectiveStartDate),
    );

    return {
      ...immutableIncome,
      month: immutableIncome.month || dateMonthKey(effectiveStartDate) || currentMonth(),
      startDate: effectiveStartDate,
      auditTrail: this.appendIncomeAudit(previous.auditTrail, auditVersion),
    };
  }

  private closeIncomeRecord(previous: IncomeSource, operationDate: string): IncomeSource {
    const effectiveEndDate = previousDate(operationDate);
    if (previous.endDate && previous.endDate < operationDate) {
      return previous;
    }
    const auditVersion = this.auditVersionFromIncome(previous, 'deleted', effectiveEndDate);

    return {
      ...previous,
      endDate:
        previous.endDate && previous.endDate < operationDate ? previous.endDate : effectiveEndDate,
      auditTrail: this.appendIncomeAudit(previous.auditTrail, auditVersion),
    };
  }

  private normalizeInvestmentRecord(
    investment: InvestmentEntry,
    previous: InvestmentEntry | undefined,
    operationDate: string,
  ): InvestmentEntry {
    if (!previous) {
      return {
        ...investment,
        effectiveStartDate:
          investment.effectiveStartDate || investment.startDate || investment.date,
        auditTrail: investment.auditTrail ?? [],
      };
    }

    const immutableInvestment = {
      ...investment,
      name: previous.name,
      createdDate: previous.createdDate || investment.createdDate,
      memberEmail: previous.memberEmail,
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
        operationDate,
      operationDate,
    );
    const auditVersion = this.auditVersionFromInvestment(
      previous,
      'updated',
      previousDate(effectiveStartDate),
    );

    return {
      ...immutableInvestment,
      startDate: !isOneTimeInvestment(immutableInvestment)
        ? immutableInvestment.startDate || previous.startDate
        : undefined,
      effectiveStartDate,
      date: isOneTimeInvestment(immutableInvestment)
        ? effectiveStartDate
        : immutableInvestment.date,
      auditTrail: this.appendInvestmentAudit(previous.auditTrail, auditVersion),
    };
  }

  private closeInvestmentRecord(previous: InvestmentEntry, operationDate: string): InvestmentEntry {
    const effectiveEndDate = previousDate(operationDate);
    if (previous.endDate && previous.endDate < operationDate) {
      return previous;
    }
    const auditVersion = this.auditVersionFromInvestment(previous, 'deleted', effectiveEndDate);

    return {
      ...previous,
      endDate:
        previous.endDate && previous.endDate < operationDate ? previous.endDate : effectiveEndDate,
      auditTrail: this.appendInvestmentAudit(previous.auditTrail, auditVersion),
    };
  }

  private normalizeLoanRecord(loan: Loan, previous: Loan | undefined, operationDate: string): Loan {
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
      memberEmail: previous.memberEmail,
    };

    if (!this.isLoanChanged(previous, immutableLoan)) {
      return {
        ...immutableLoan,
        auditTrail: previous.auditTrail ?? loan.auditTrail ?? [],
      };
    }

    const auditEndDate = previousDate(operationDate);
    const auditVersion = this.auditVersionFromLoan(previous, 'updated', auditEndDate);

    return {
      ...immutableLoan,
      startDate: immutableLoan.startDate,
      auditTrail: this.appendLoanAudit(previous.auditTrail, auditVersion),
    };
  }

  private closeLoanRecord(previous: Loan, operationDate: string): Loan {
    const effectiveEndDate = previousDate(operationDate);
    if (previous.endDate && previous.endDate < operationDate) {
      return previous;
    }
    const auditVersion = this.auditVersionFromLoan(previous, 'deleted', effectiveEndDate);

    return {
      ...previous,
      endDate:
        previous.endDate && previous.endDate < operationDate ? previous.endDate : effectiveEndDate,
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
      (previous.endDate || '') !== (next.endDate || '') ||
      (previous.memberEmail || '') !== (next.memberEmail || '')
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
      (previous.notes || '') !== (next.notes || '') ||
      (previous.memberEmail || '') !== (next.memberEmail || '') ||
      (previous.paymentModeId || '') !== (next.paymentModeId || '')
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
      (previous.notes || '') !== (next.notes || '') ||
      (previous.memberEmail || '') !== (next.memberEmail || '') ||
      (previous.paymentModeId || '') !== (next.paymentModeId || '')
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
      memberEmail: income.memberEmail,
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
        investment.effectiveStartDate || investment.startDate,
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
      memberEmail: investment.memberEmail,
      paymentModeId: investment.paymentModeId,
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
      memberEmail: loan.memberEmail,
      paymentModeId: loan.paymentModeId,
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
        (audit.endDate || '') === (auditVersion.endDate || '') &&
        (audit.memberEmail || '') === (auditVersion.memberEmail || ''),
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
        (audit.endDate || '') === (auditVersion.endDate || '') &&
        (audit.memberEmail || '') === (auditVersion.memberEmail || '') &&
        (audit.paymentModeId || '') === (auditVersion.paymentModeId || ''),
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
        (audit.endDate || '') === (auditVersion.endDate || '') &&
        (audit.memberEmail || '') === (auditVersion.memberEmail || '') &&
        (audit.paymentModeId || '') === (auditVersion.paymentModeId || ''),
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

  clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value * 100)));
  }

  private async watchAuthState(): Promise<void> {
    if (!this.firebase.app) {
      this.paymentAccounts.set([]);
      this.paymentModes.set(this.withDefaultPaymentModes([]));
      this.categories.set(this.withDefaultCategories([]));
      this.isSessionChecking.set(false);
      this.isWorkspaceDataLoading.set(false);
      return;
    }

    this.isSessionChecking.set(true);
    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      this.authUnsubscribe.set(
        await observeBudgetAuth(this.firebase.app, (user) => {
          void this.handleAuthUser(user);
        }),
      );
      this.syncStatus.set('Sign in with Google');
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Unable to initialize Firebase login.',
      );
      this.isSessionChecking.set(false);
      this.loginLoaderActive.set(false);
    } finally {
      this.isSyncing.set(false);
    }
  }

  private async handleAuthUser(user: User | null): Promise<void> {
    const authKey = user?.uid ?? 'signed-out';
    if (this.authHydrationInFlight && this.authHydrationKey === authKey) {
      await this.authHydrationInFlight;
      return;
    }

    this.authHydrationKey = authKey;
    this.authHydrationInFlight = this.hydrateAuthUser(user);

    try {
      await this.authHydrationInFlight;
    } finally {
      if (this.authHydrationKey === authKey) {
        this.authHydrationInFlight = null;
      }
    }
  }

  private async hydrateAuthUser(user: User | null): Promise<void> {
    if (this.firebase.mode !== 'firebase') {
      this.isWorkspaceDataLoading.set(false);
      this.isSessionChecking.set(false);
      this.loginLoaderActive.set(false);
      this.isSyncing.set(false);
      return;
    }

    this.stopFirestoreListeners();
    this.repository.set(null);
    const email = user?.email ?? null;
    this.workspaceId.set(null);
    this.userName.set(user?.displayName ?? null);
    this.userUid.set(user?.uid ?? null);
    this.userEmail.set(email);
    this.userPhoto.set(user?.photoURL ?? null);
    this.onboardingProgress.set(null);

    if (!user || !this.firebase.app || !email) {
      this.workspaces.set([]);
      this.clearAppData();
      this.syncStatus.set(
        this.firebase.mode === 'firebase' ? 'Sign in with Google' : 'Firebase config needed',
      );
      this.isWorkspaceDataLoading.set(false);
      this.isSessionChecking.set(false);
      this.loginLoaderActive.set(false);
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      const existingProfile =
        (await BudgetFirestoreRepository.findUserProfile(this.firebase.app, user.uid)) ??
        (await BudgetFirestoreRepository.findLegacyUserProfile(this.firebase.app, email));
      const userProfile: UserProfile = {
        uid: user.uid,
        email,
        displayName: user.displayName ?? email,
        photoUrl: user.photoURL ?? undefined,
        updatedDate: new Date().toISOString(),
        onboarding: existingProfile?.onboarding,
      };
      this.onboardingProgress.set(existingProfile?.onboarding ?? null);
      void BudgetFirestoreRepository.upsertUserProfile(this.firebase.app, userProfile).catch(() => {
        // Profile sync is helpful for member lookup, but it should never block login.
      });
      const legacyWorkspace = await BudgetFirestoreRepository.ensureLegacyWorkspace(
        this.firebase.app,
        user.uid,
        email,
        userProfile.displayName,
        userProfile.photoUrl,
      );
      const accessibleWorkspaces = await BudgetFirestoreRepository.listAccessibleWorkspaces(
        this.firebase.app,
        { uid: user.uid, email },
      );
      const workspaceMap = new Map(
        [legacyWorkspace, ...accessibleWorkspaces].map((workspace) => [workspace.id, workspace]),
      );
      const workspaces = [...workspaceMap.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      this.workspaces.set(workspaces);
      const activeWorkspace = workspaces.find((workspace) => !workspace.archivedDate);
      if (activeWorkspace) {
        await this.selectWorkspace(activeWorkspace.id);
        this.syncStatus.set('Synced with Firebase');
      } else {
        this.clearAppData();
        this.isWorkspaceDataLoading.set(false);
        this.syncStatus.set('Create a workspace to continue');
      }
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Unable to connect to Firebase.',
      );
    } finally {
      this.isSyncing.set(false);
      this.isSessionChecking.set(false);
      this.loginLoaderActive.set(false);
    }
  }

  private async saveRecords<TName extends BudgetCollectionName>(
    collectionName: TName,
    records: BudgetDataMap[TName][],
    applyLocal: () => void,
  ): Promise<boolean> {
    return this.runFirebaseWrite(async () => {
      await this.repository()?.upsertMany(collectionName, records);
    }, applyLocal);
  }

  private normalizePaymentMode(paymentMode: PaymentMode): PaymentMode {
    const now = new Date().toISOString();
    const workspaceGlobal = this.isWorkspaceGlobalCashMode(paymentMode);
    const memberEmail = workspaceGlobal
      ? undefined
      : (paymentMode.memberEmail ?? this.actingMemberEmail());
    const paymentAccountId = this.isAccountBackedPaymentMode(paymentMode)
      ? paymentMode.paymentAccountId
      : undefined;
    const paymentAccount = paymentAccountId
      ? this.paymentAccounts().find((account) => account.id === paymentAccountId)
      : undefined;
    const base = {
      id: paymentMode.id || id('payment-mode'),
      type: paymentMode.type,
      name: paymentMode.name?.trim() || this.paymentModeTypeLabel(paymentMode.type),
      paymentAccountId,
      memberEmail,
      workspaceGlobal: workspaceGlobal || undefined,
      createdDate: paymentMode.createdDate || now,
      updatedDate: paymentMode.updatedDate || now,
      archivedDate: workspaceGlobal ? undefined : paymentMode.archivedDate,
    };

    if (paymentMode.type === 'upi') {
      return this.withDerivedPaymentModeName({
        ...base,
        provider: paymentMode.provider,
      });
    }

    if (paymentMode.type === 'internet-banking') {
      return this.withDerivedPaymentModeName({
        ...base,
        bankName: paymentAccount
          ? paymentAccount.bankName
          : this.paymentBankNameValue(paymentMode.bankName),
      });
    }

    if (paymentMode.type === 'cash') {
      return base;
    }

    return this.withDerivedPaymentModeName({
      ...base,
      cardType: paymentMode.cardType,
      lastFour: paymentMode.lastFour?.replace(/\D/g, '').slice(-4),
    });
  }

  private normalizePaymentAccount(paymentAccount: PaymentAccount): PaymentAccount {
    const now = new Date().toISOString();
    const lastFour = paymentAccount.lastFour.replace(/\D/g, '').slice(-4);
    const memberEmail = paymentAccount.memberEmail ?? this.actingMemberEmail();
    const normalized = {
      id: paymentAccount.id || id('payment-account'),
      name: paymentAccount.name.trim() || 'Bank account',
      bankName: this.paymentBankNameValue(paymentAccount.bankName),
      lastFour,
      memberEmail,
      createdDate: paymentAccount.createdDate || now,
      updatedDate: paymentAccount.updatedDate || now,
      archivedDate: paymentAccount.archivedDate,
    };

    return {
      ...normalized,
      name: this.paymentAccountLabel(normalized),
    };
  }

  private isAccountBackedPaymentMode(paymentMode: Pick<PaymentMode, 'type'>): boolean {
    return (
      paymentMode.type === 'upi' ||
      paymentMode.type === 'credit-card' ||
      paymentMode.type === 'debit-card' ||
      paymentMode.type === 'internet-banking'
    );
  }

  private currentUserProfile(): UserProfile | null {
    const email = this.userEmail();
    if (!email) {
      return null;
    }

    return {
      uid: this.userUid() ?? undefined,
      email,
      displayName: this.userName() || email,
      photoUrl: this.userPhoto() ?? undefined,
      updatedDate: new Date().toISOString(),
    };
  }

  private async findUserProfile(email: string): Promise<UserProfile | null> {
    if (!this.firebase.app) {
      return null;
    }

    return BudgetFirestoreRepository.findUserProfileByEmail(
      this.firebase.app,
      this.normalizeEmail(email),
    );
  }

  private workspaceWithEditorProfiles(workspace: Workspace, profiles: UserProfile[]): Workspace {
    const today = new Date().toISOString();
    const editorProfiles = profiles.filter((profile) => profile.email !== workspace.ownerEmail);
    let members = workspace.members;

    for (const profile of editorProfiles) {
      const existingMember = members.find((member) => member.email === profile.email);
      members = existingMember
        ? members.map((member) =>
            member.email === profile.email
              ? {
                  ...member,
                  uid: profile.uid ?? member.uid,
                  displayName: profile.displayName || profile.email,
                  photoUrl: profile.photoUrl,
                  role: 'editor',
                  archivedDate: undefined,
                }
              : member,
          )
        : [
            ...members,
            {
              uid: profile.uid,
              email: profile.email,
              displayName: profile.displayName || profile.email,
              photoUrl: profile.photoUrl,
              role: 'editor',
              createdDate: today,
            },
          ];
    }

    return {
      ...workspace,
      updatedDate: today,
      members,
    };
  }

  private async openWorkspaceForm(
    data: WorkspaceFormData,
  ): Promise<WorkspaceFormResult | undefined> {
    if (this.breakpointObserver.isMatched('(max-width: 780px)')) {
      const bottomSheetRef = this.bottomSheet.open<
        WorkspaceFormDialog,
        WorkspaceFormData,
        WorkspaceFormResult
      >(WorkspaceFormDialog, {
        ariaLabel: data.mode === 'create' ? 'Create workspace' : 'Manage workspace members',
        autoFocus: false,
        data,
        maxHeight: 'calc(100dvh - 44px)',
        panelClass: 'workspace-form-sheet-panel',
        restoreFocus: true,
      });

      return firstValueFrom(bottomSheetRef.afterDismissed());
    }

    const dialogRef = this.dialog.open<WorkspaceFormDialog, WorkspaceFormData, WorkspaceFormResult>(
      WorkspaceFormDialog,
      {
        ariaLabel: data.mode === 'create' ? 'Create workspace' : 'Manage workspace members',
        autoFocus: false,
        data,
        maxWidth: '94vw',
        panelClass: 'workspace-form-panel',
        restoreFocus: true,
        width: 'min(640px, 94vw)',
      },
    );

    return firstValueFrom(dialogRef.afterClosed());
  }

  private async openWorkspaceConfirm(data: WorkspaceConfirmData): Promise<boolean> {
    if (this.breakpointObserver.isMatched('(max-width: 780px)')) {
      const bottomSheetRef = this.bottomSheet.open<
        WorkspaceConfirmDialog,
        WorkspaceConfirmData,
        boolean
      >(WorkspaceConfirmDialog, {
        ariaLabel: data.title,
        autoFocus: false,
        data,
        panelClass: 'workspace-form-sheet-panel',
        restoreFocus: true,
      });

      return (await firstValueFrom(bottomSheetRef.afterDismissed())) === true;
    }

    const dialogRef = this.dialog.open<WorkspaceConfirmDialog, WorkspaceConfirmData, boolean>(
      WorkspaceConfirmDialog,
      {
        ariaLabel: data.title,
        autoFocus: false,
        data,
        maxWidth: '94vw',
        panelClass: 'workspace-form-panel',
        restoreFocus: true,
        width: 'min(460px, 94vw)',
      },
    );

    return (await firstValueFrom(dialogRef.afterClosed())) === true;
  }

  private async saveWorkspace(workspace: Workspace, message: string): Promise<void> {
    const repository = this.repository();
    if (!repository) {
      return;
    }

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      await repository.upsertWorkspace(workspace);
      this.workspaces.update((workspaces) =>
        workspaces
          .map((item) => (item.id === workspace.id ? workspace : item))
          .sort((left, right) => left.name.localeCompare(right.name)),
      );
      this.syncStatus.set(message);
    } catch (error) {
      this.handleSyncError(error instanceof Error ? error.message : 'Workspace update failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }

  private async listenToWorkspaceData(): Promise<void> {
    const repository = this.repository();
    if (!repository) {
      this.isWorkspaceDataLoading.set(false);
      return;
    }
    const workspaceId = this.workspaceId();

    try {
      const subscriptions = await Promise.all([
        repository.listen(
          'paymentAccounts',
          (records) => {
            this.paymentAccounts.set(records);
            this.markWorkspaceCollectionLoaded('paymentAccounts', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'paymentModes',
          (records) => {
            this.paymentModes.set(this.withDefaultPaymentModes(records));
            this.ensureDefaultPaymentModeRecord(records);
            this.markWorkspaceCollectionLoaded('paymentModes', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'categories',
          (records) => {
            this.categories.set(this.withDefaultCategories(records));
            this.ensureDefaultCategoryRecord(records);
            this.markWorkspaceCollectionLoaded('categories', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'incomes',
          (records) => {
            this.incomes.set(records);
            this.markWorkspaceCollectionLoaded('incomes', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'templates',
          (records) => {
            this.templates.set(records);
            this.markWorkspaceCollectionLoaded('templates', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'expenses',
          (records) => {
            this.expenses.set(records);
            this.markWorkspaceCollectionLoaded('expenses', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'investments',
          (records) => {
            this.investments.set(records);
            this.markWorkspaceCollectionLoaded('investments', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
        repository.listen(
          'loans',
          (records) => {
            this.loans.set(records);
            this.markWorkspaceCollectionLoaded('loans', workspaceId);
          },
          (message) => this.handleSyncError(message),
        ),
      ]);

      this.unsubscribes.update((unsubscribes) => [...unsubscribes, ...subscriptions]);
    } catch (error) {
      this.isWorkspaceDataLoading.set(false);
      throw error;
    }
  }

  private async resumeCategoryRemaps(reportStatus = false): Promise<void> {
    const repository = this.repository();
    if (!repository) {
      this.pendingCategoryRemapCount.set(0);
      return;
    }

    try {
      const operations = await repository.pendingCategoryRemapOperations();
      this.pendingCategoryRemapCount.set(operations.length);
      for (const operation of operations) {
        await repository.executeCategoryRemapOperation(operation);
        this.pendingCategoryRemapCount.update((count) => Math.max(0, count - 1));
      }
      if (reportStatus && operations.length) {
        this.syncStatus.set('Pending category remaps completed');
      }
    } catch (error) {
      this.handleSyncError(
        error instanceof Error ? error.message : 'Unable to resume category remapping.',
      );
    }
  }

  private markWorkspaceCollectionLoaded(
    collectionName: BudgetCollectionName,
    workspaceId: string | null,
  ): void {
    if (this.workspaceId() !== workspaceId) {
      return;
    }

    const loadedCollections = new Set(this.loadedWorkspaceCollections());
    loadedCollections.add(collectionName);
    this.loadedWorkspaceCollections.set(loadedCollections);
    this.isWorkspaceDataLoading.set(
      !WORKSPACE_DATA_COLLECTIONS.every((name) => loadedCollections.has(name)),
    );
  }

  private async openCategoryRetirement(
    category: BudgetCategory,
  ): Promise<CategoryRetirementResult | undefined> {
    const data: CategoryRetirementData = {
      category,
      candidates: this.categories().filter(
        (candidate) =>
          candidate.id !== category.id &&
          !candidate.archivedDate &&
          this.categoryType(candidate) === this.categoryType(category),
      ),
      usage: {
        expenses: this.expenses().filter((expense) => expense.categoryId === category.id).length,
        recurringExpenses: this.templates().filter(
          (template) => template.categoryId === category.id,
        ).length,
        incomes: this.incomes().filter((income) => income.categoryId === category.id).length,
        investments: this.investments().filter(
          (investment) => investment.categoryId === category.id,
        ).length,
        totalAmount:
          this.expenses()
            .filter((expense) => expense.categoryId === category.id)
            .reduce((total, expense) => total + expense.amount, 0) +
          this.investments()
            .filter((investment) => investment.categoryId === category.id)
            .reduce((total, investment) => total + investment.amount, 0),
      },
    };
    const dialogRef = this.dialog.open<
      CategoryRetirementDialog,
      CategoryRetirementData,
      CategoryRetirementResult
    >(CategoryRetirementDialog, {
      autoFocus: 'first-tabbable',
      data,
      maxWidth: '94vw',
      width: 'min(560px, 94vw)',
    });

    return (await firstValueFrom(dialogRef.afterClosed())) ?? undefined;
  }

  private normalizeCategoryBudget(
    category: BudgetCategory,
    previous: BudgetCategory | undefined,
    effectiveMonth: string,
  ): BudgetCategory {
    if (this.categoryType(category) !== 'Expenses') {
      return { ...category, monthlyBudget: 0, budgetVersions: [] };
    }

    if (!previous) {
      return {
        ...category,
        budgetVersions:
          this.categoryType(category) === 'Expenses'
            ? [
                {
                  effectiveMonth,
                  monthlyBudget: category.monthlyBudget,
                  recordedDate: new Date().toISOString(),
                },
              ]
            : [],
      };
    }

    if (category.monthlyBudget === previous.monthlyBudget) {
      return { ...category, budgetVersions: previous.budgetVersions ?? [] };
    }

    const version = {
      effectiveMonth,
      monthlyBudget: category.monthlyBudget,
      recordedDate: new Date().toISOString(),
    };
    const priorVersions = previous.budgetVersions?.length
      ? previous.budgetVersions
      : [
          {
            effectiveMonth: '0000-01',
            monthlyBudget: previous.monthlyBudget,
            recordedDate: version.recordedDate,
          },
        ];
    return {
      ...category,
      budgetVersions: [
        ...priorVersions.filter((item) => item.effectiveMonth !== effectiveMonth),
        version,
      ].sort((left, right) => left.effectiveMonth.localeCompare(right.effectiveMonth)),
    };
  }

  private async applyBulkChanges(
    result: BulkEditorResult,
    openingSnapshot?: BulkEditorData,
  ): Promise<void> {
    const protectedLoanCategoryId = this.loanEmiCategoryId([
      ...this.categories(),
      ...result.categories,
    ]);
    const requestedCategoryIds = new Set(
      result.deleted.categories.filter((categoryId) => categoryId !== protectedLoanCategoryId),
    );
    const retiredCategories: BudgetCategory[] = [];
    const categoryRemaps = new Map<string, string>();
    const createdReplacementCategories: BudgetCategory[] = [];

    for (const categoryId of requestedCategoryIds) {
      const category = this.categories().find((item) => item.id === categoryId);
      if (!category) {
        continue;
      }

      const decision = await this.openCategoryRetirement(category);
      if (!decision) {
        retiredCategories.push(category);
        continue;
      }

      retiredCategories.push({ ...category, archivedDate: new Date().toISOString() });
      if (decision.action === 'remap') {
        if ('replacementCategoryId' in decision) {
          categoryRemaps.set(categoryId, decision.replacementCategoryId);
        } else {
          const replacement: BudgetCategory = {
            id: id('category'),
            name: decision.newCategoryName,
            monthlyBudget: category.monthlyBudget,
            color: category.color,
            type: category.type,
            budgetVersions: category.budgetVersions ?? [],
          };
          createdReplacementCategories.push(replacement);
          categoryRemaps.set(categoryId, replacement.id);
        }
      }
    }
    const categoryRemapOperations: CategoryRemapOperation[] = [...categoryRemaps].map(
      ([sourceCategoryId, replacementCategoryId]) => {
        const createdDate = new Date().toISOString();
        return {
          id: id('category-remap'),
          sourceCategoryId,
          replacementCategoryId,
          replacementCategory: createdReplacementCategories.find(
            (category) => category.id === replacementCategoryId,
          ),
          sourceArchivedDate:
            retiredCategories.find((category) => category.id === sourceCategoryId)?.archivedDate ??
            createdDate,
          createdBy: this.actingMemberEmail(),
          createdDate,
          updatedDate: createdDate,
          status: 'pending',
          completedSteps: [],
          attempts: 0,
        };
      },
    );
    const deletedCategoryIds = new Set<string>();
    const deletedExpenseIds = new Set(result.deleted.expenses);
    const deletedIncomeIds = new Set(result.deleted.incomes);
    const deletedInvestmentIds = new Set(result.deleted.investments);
    const deletedLoanIds = new Set(result.deleted.loans);
    const deletedTemplateIds = new Set(result.deleted.templates);
    const hardDeletedTemplateIds = deletedTemplateIds;
    const selectedMonth = this.selectedMonth();
    const operationDate = todayDate();
    const recurringOperationMonth = currentMonth();
    const planOperationMonth = currentMonth();

    const effectiveBudgetMonth = this.selectedMonth();
    const categories = this.withDefaultCategories([
      ...this.categories().filter((category) => !!category.archivedDate),
      ...result.categories.map((category) =>
        this.normalizeCategoryBudget(
          category,
          this.categories().find((item) => item.id === category.id),
          effectiveBudgetMonth,
        ),
      ),
      ...retiredCategories,
      ...createdReplacementCategories,
    ]);
    const existingIncomesById = new Map(this.incomes().map((income) => [income.id, income]));
    const existingInvestmentsById = new Map(
      this.investments().map((investment) => [investment.id, investment]),
    );
    const existingLoansById = new Map(this.loans().map((loan) => [loan.id, loan]));
    const returnedIncomeIds = new Set(result.incomes.map((income) => income.id));
    const returnedTemplateIds = new Set(result.templates.map((template) => template.id));
    const returnedInvestmentIds = new Set(result.investments.map((investment) => investment.id));
    const returnedLoanIds = new Set(result.loans.map((loan) => loan.id));
    let incomes = [
      ...this.incomes().filter(
        (income) => !returnedIncomeIds.has(income.id) && !deletedIncomeIds.has(income.id),
      ),
      ...result.incomes
        .filter((income) => !deletedIncomeIds.has(income.id))
        .map((income) => ({
          ...income,
          categoryId: income.categoryId
            ? (categoryRemaps.get(income.categoryId) ?? income.categoryId)
            : undefined,
        }))
        .map((income) =>
          this.normalizeIncomeRecord(income, existingIncomesById.get(income.id), operationDate),
        ),
      ...result.deleted.incomes
        .map((recordId) => existingIncomesById.get(recordId))
        .filter((income): income is IncomeSource => !!income)
        .map((income) => this.closeIncomeRecord(income, operationDate)),
    ];
    let templates = [
      ...this.templates().filter(
        (template) =>
          !returnedTemplateIds.has(template.id) &&
          !hardDeletedTemplateIds.has(template.id) &&
          !deletedCategoryIds.has(template.categoryId),
      ),
      ...result.templates
        .filter(
          (template) =>
            !hardDeletedTemplateIds.has(template.id) &&
            !deletedCategoryIds.has(template.categoryId),
        )
        .map((template) => ({
          ...template,
          categoryId: categoryRemaps.get(template.categoryId) ?? template.categoryId,
        })),
    ];
    let investments = [
      ...this.investments().filter(
        (investment) =>
          !returnedInvestmentIds.has(investment.id) && !deletedInvestmentIds.has(investment.id),
      ),
      ...result.investments
        .filter((investment) => !deletedInvestmentIds.has(investment.id))
        .map((investment) => ({
          ...investment,
          categoryId: investment.categoryId
            ? (categoryRemaps.get(investment.categoryId) ?? investment.categoryId)
            : undefined,
        }))
        .map((investment) =>
          this.normalizeInvestmentRecord(
            investment,
            existingInvestmentsById.get(investment.id),
            operationDate,
          ),
        ),
      ...result.deleted.investments
        .map((recordId) => existingInvestmentsById.get(recordId))
        .filter((investment): investment is InvestmentEntry => !!investment)
        .map((investment) => this.closeInvestmentRecord(investment, operationDate)),
    ];
    let expenses = result.expenses
      .filter((expense) => !deletedExpenseIds.has(expense.id))
      .map((expense) => ({
        ...expense,
        categoryId: categoryRemaps.get(expense.categoryId) ?? expense.categoryId,
      }));
    const loans = [
      ...this.loans().filter(
        (loan) => !returnedLoanIds.has(loan.id) && !deletedLoanIds.has(loan.id),
      ),
      ...result.loans
        .filter((loan) => !deletedLoanIds.has(loan.id))
        .map((loan) =>
          this.normalizeLoanRecord(loan, existingLoansById.get(loan.id), operationDate),
        ),
      ...result.deleted.loans
        .map((recordId) => existingLoansById.get(recordId))
        .filter((loan): loan is Loan => !!loan)
        .map((loan) => this.closeLoanRecord(loan, operationDate)),
    ];

    const remapCategoryId = (categoryId: string | undefined): string | undefined =>
      categoryId ? (categoryRemaps.get(categoryId) ?? categoryId) : undefined;
    incomes = incomes.map((income) => ({
      ...income,
      categoryId: remapCategoryId(income.categoryId),
    }));
    templates = templates.map((template) => ({
      ...template,
      categoryId: remapCategoryId(template.categoryId) ?? template.categoryId,
    }));
    investments = investments.map((investment) => ({
      ...investment,
      categoryId: remapCategoryId(investment.categoryId),
    }));
    expenses = expenses.map((expense) => ({
      ...expense,
      categoryId: remapCategoryId(expense.categoryId) ?? expense.categoryId,
    }));

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

    const investmentPlansById = new Map(
      investments
        .filter((investment) => !investment.sourceInvestmentId)
        .map((investment) => [investment.id, investment]),
    );
    const changedInvestmentIds = new Set(
      [...investmentPlansById.values()]
        .filter((investment) =>
          this.isInvestmentChanged(
            existingInvestmentsById.get(investment.id) ?? investment,
            investment,
          ),
        )
        .map((investment) => investment.id),
    );
    investments = investments.map((investment) => {
      const sourceId = investment.sourceInvestmentId;
      const occurrenceDate =
        investment.date || investment.startDate || investment.createdDate || '';
      if (!sourceId || !changedInvestmentIds.has(sourceId) || occurrenceDate < operationDate) {
        return investment;
      }

      const source = investmentPlansById.get(sourceId);
      const occurrenceMonth = dateMonthKey(occurrenceDate);
      const schedule =
        source && occurrenceMonth ? investmentScheduleForMonth(source, occurrenceMonth) : null;
      if (!source || !schedule) {
        return investment;
      }

      return {
        ...investment,
        name: source.name,
        amount: schedule.amount,
        categoryId: source.categoryId,
        date: schedule.date,
        notes: source.notes,
        memberEmail: source.memberEmail,
        paymentModeId: source.paymentModeId,
      };
    });

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
      if (
        !loan ||
        !changedLoanIds.has(loanId) ||
        expenseMonth < planOperationMonth ||
        this.recordDate(expense) < operationDate
      ) {
        return [expense];
      }

      if (!isLoanOccurrenceInRange(expenseMonth, loan.startDate, loan.endDate)) {
        extraDeletedExpenseIds.add(expense.id);
        return [];
      }

      return [
        {
          ...expense,
          date: loanOccurrenceDate(expenseMonth, loan.startDate),
          name: this.loanExpenseName(loan),
          categoryId: this.loanEmiCategoryId(),
          amount: loan.emi,
          type: 'recurring' as const,
          note: expense.note || 'Prepopulated from loan EMI',
          paymentModeId: loan.paymentModeId,
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
            operationDate,
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

        let expense = {
          ...source,
          categoryId: remapCategoryId(source.categoryId) ?? source.categoryId,
        };
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

          const effectiveTemplate = this.templateVersionForMonth(template, expenseMonth);
          if (!effectiveTemplate || !templateScheduleForMonth(effectiveTemplate, expenseMonth)) {
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

            if (
              (templateStartMonth && expenseMonth < templateStartMonth) ||
              this.recordDate(expense) < operationDate
            ) {
              nextExpensesById.set(expense.id, expense);
              return;
            }

            expense = this.expenseFromTemplate(effectiveTemplate, expenseMonth, expense);
          }
        }

        nextExpensesById.set(expense.id, expense);
      };

      for (const expense of existingExpenses.filter(
        (expense) =>
          entryMonthKey(expense) !== selectedMonth || !this.matchesSelectedMember(expense),
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
        if (!effectiveTemplate || !templateScheduleForMonth(effectiveTemplate, selectedMonth)) {
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

    const openingCategories = openingSnapshot?.categories ?? this.categories();
    const openingIncomes = openingSnapshot?.incomes ?? this.incomes();
    const openingTemplates = openingSnapshot?.templates ?? this.templates();
    const openingExpenses = openingSnapshot?.expenses ?? this.expenses();
    const openingInvestments = openingSnapshot?.investments ?? this.investments();
    const openingLoans = openingSnapshot?.loans ?? this.loans();
    const mutations: BudgetMutationSet = {
      categories: excludeUntouchedEditorUpdates(
        planEntityMutations(this.categories(), categories),
        openingCategories,
        planEntityMutations(openingCategories, result.categories, result.deleted.categories),
      ),
      incomes: excludeUntouchedEditorUpdates(
        planEntityMutations(this.incomes(), incomes),
        openingIncomes,
        planEntityMutations(openingIncomes, result.incomes, result.deleted.incomes),
      ),
      templates: excludeUntouchedEditorUpdates(
        planEntityMutations(this.templates(), templates, [...hardDeletedTemplateIds]),
        openingTemplates,
        planEntityMutations(openingTemplates, result.templates, result.deleted.templates),
      ),
      expenses: excludeUntouchedEditorUpdates(
        planEntityMutations(this.expenses(), expenses, [
          ...new Set([...result.deleted.expenses, ...extraDeletedExpenseIds]),
        ]),
        openingExpenses,
        planEntityMutations(openingExpenses, result.expenses, result.deleted.expenses),
      ),
      investments: excludeUntouchedEditorUpdates(
        planEntityMutations(this.investments(), investments),
        openingInvestments,
        planEntityMutations(openingInvestments, result.investments, result.deleted.investments),
      ),
      loans: excludeUntouchedEditorUpdates(
        planEntityMutations(this.loans(), loans),
        openingLoans,
        planEntityMutations(openingLoans, result.loans, result.deleted.loans),
      ),
    };
    const changedTemplateSourceIds = new Set(
      templates
        .filter((template) =>
          this.isTemplateChanged(existingTemplatesById.get(template.id), template),
        )
        .map((template) => template.id),
    );
    const plannedExpenseUpdates = planEntityMutations(this.expenses(), expenses, [
      ...new Set([...result.deleted.expenses, ...extraDeletedExpenseIds]),
    ]).updates;
    const retainedExpenseUpdateIds = new Set(
      mutations.expenses!.updates.map(({ record }) => record.id),
    );
    for (const update of plannedExpenseUpdates) {
      const previous = this.expenses().find((expense) => expense.id === update.record.id);
      const templateId = previous?.templateId;
      const isTemplateCascade =
        !!templateId &&
        (hardDeletedTemplateIds.has(templateId) || changedTemplateSourceIds.has(templateId));
      const isLoanCascade =
        !!templateId?.startsWith('loan:') &&
        (changedLoanIds.has(templateId.slice('loan:'.length)) ||
          deletedLoanIds.has(templateId.slice('loan:'.length)));
      const isCategoryCascade = !!previous && categoryRemaps.has(previous.categoryId);
      if (
        !retainedExpenseUpdateIds.has(update.record.id) &&
        (isTemplateCascade || isLoanCascade || isCategoryCascade)
      ) {
        mutations.expenses!.updates.push(update);
      }
    }

    const saved = await this.runFirebaseWrite(
      async () => {
        const repository = this.repository();
        if (!repository) {
          return;
        }

        for (const operation of categoryRemapOperations) {
          await repository.saveCategoryRemapOperation(operation);
          this.pendingCategoryRemapCount.update((count) => count + 1);
          await repository.executeCategoryRemapOperation(operation);
          this.pendingCategoryRemapCount.update((count) => Math.max(0, count - 1));
        }

        await repository.executeMutations(mutations);
      },
      () => {
        this.categories.set(applyEntityMutations(this.categories(), mutations.categories!));
        this.incomes.set(applyEntityMutations(this.incomes(), mutations.incomes!));
        this.templates.set(applyEntityMutations(this.templates(), mutations.templates!));
        this.expenses.set(applyEntityMutations(this.expenses(), mutations.expenses!));
        this.investments.set(applyEntityMutations(this.investments(), mutations.investments!));
        this.loans.set(applyEntityMutations(this.loans(), mutations.loans!));
      },
    );

    if (saved) {
      this.syncStatus.set(
        this.repository() ? 'Bulk changes saved to Firebase' : 'Bulk changes saved',
      );
    }
  }

  private async runFirebaseWrite(
    action: () => Promise<void>,
    applyLocal: () => void,
  ): Promise<boolean> {
    if (!this.repository()) {
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
    this.loginLoaderActive.set(false);
    this.isWorkspaceDataLoading.set(false);
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
    for (const key of [
      'paymentAccounts',
      'paymentModes',
      'categories',
      'incomes',
      'templates',
      'expenses',
      'investments',
      'loans',
    ]) {
      localStorage.removeItem(`${this.storagePrefix}:${key}`);
    }
  }

  private stopFirestoreListeners(): void {
    const unsubscribes = this.unsubscribes();
    while (unsubscribes.length) {
      unsubscribes.pop()?.();
    }
    this.unsubscribes.set([]);
  }

  private clearAppData(): void {
    this.pendingCategoryRemapCount.set(0);
    this.paymentAccounts.set([]);
    this.paymentModes.set([]);
    this.categories.set([]);
    this.incomes.set([]);
    this.templates.set([]);
    this.expenses.set([]);
    this.investments.set([]);
    this.loans.set([]);
  }
}
