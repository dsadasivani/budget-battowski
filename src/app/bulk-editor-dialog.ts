import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { provideNativeDateAdapter } from '@angular/material/core';

import { PAYMENT_BANK_OPTIONS } from './budget.models';
import type {
  BudgetCategory,
  Cadence,
  CategoryType,
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
  PaymentMode,
  WorkspaceMember,
} from './budget.models';

type DraftRow<T extends { id: string }> = T & { isNew?: boolean; pendingDelete?: boolean };
type EditableDraftRow = {
  id: string;
  isNew?: boolean;
  isSuggested?: boolean;
  pendingDelete?: boolean;
};
type DraftExpense = DraftRow<ExpenseEntry> & {
  endDate?: string;
  isSuggested?: boolean;
  suggestionMonth?: string;
  startDate?: string;
};
type DraftTemplate = DraftRow<ExpenseTemplate>;
type RecurringAuditRow = {
  id: string;
  amount: number;
  categoryId: string;
  endDate?: string;
  label: string;
  name: string;
  operation: string;
  recordedDate?: string;
  startDate?: string;
};
type AuditDisplayRow = {
  id: string;
  amount: number;
  endDate?: string;
  name: string;
  operation: string;
  recordedDate?: string;
  startDate?: string;
};
type PaymentModeMeta = {
  iconSrc: string;
  label: string;
};
type BulkTableKey = 'expenses' | 'templates' | 'incomes' | 'categories' | 'loans' | 'investments';
type SortDirection = 'asc' | 'desc';
type RowStatusFilter = 'all' | 'active' | 'new' | 'suggested' | 'marked-delete';
type BulkSortColumn =
  | ''
  | 'amount'
  | 'annualRate'
  | 'cadence'
  | 'category'
  | 'color'
  | 'date'
  | 'emi'
  | 'endDate'
  | 'frequency'
  | 'lender'
  | 'loanType'
  | 'monthlyBudget'
  | 'month'
  | 'name'
  | 'note'
  | 'outstanding'
  | 'paymentMode'
  | 'principal'
  | 'source'
  | 'startDate'
  | 'status'
  | 'type';
type BulkFilterKey = keyof BulkTableFilterState;
type BulkDisplayRow =
  | DraftExpense
  | DraftTemplate
  | DraftRow<IncomeSource>
  | DraftRow<BudgetCategory>
  | DraftRow<Loan>
  | DraftRow<InvestmentEntry>;
type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};
type BulkTableFilterState = {
  cadence: Cadence | '';
  categoryId: string;
  categoryType: CategoryType | '';
  expenseType: ExpenseType | '';
  frequency: InvestmentFrequency | '';
  paymentModeId: string;
  query: string;
  status: RowStatusFilter;
};
type BulkTableSortState = {
  column: BulkSortColumn;
  direction: SortDirection;
};
type SortOption = SelectOption<`${Exclude<BulkSortColumn, ''>}:${SortDirection}` | ''>;
export type BulkEditorScope = 'monthly' | 'planning' | 'loans';

export interface BulkEditorData {
  scope: BulkEditorScope;
  initialTabIndex?: number;
  initialEditingRowId?: string;
  selectedMonth: string;
  members?: WorkspaceMember[];
  selectedMemberEmail?: string;
  actingMemberEmail?: string;
  paymentAccounts?: PaymentAccount[];
  paymentModes?: PaymentMode[];
  categories: BudgetCategory[];
  incomes: IncomeSource[];
  templates: ExpenseTemplate[];
  expenses: ExpenseEntry[];
  investments: InvestmentEntry[];
  loans: Loan[];
}

export interface BulkEditorResult {
  scope: BulkEditorScope;
  categories: BudgetCategory[];
  incomes: IncomeSource[];
  templates: ExpenseTemplate[];
  expenses: ExpenseEntry[];
  investments: InvestmentEntry[];
  loans: Loan[];
  deleted: {
    categories: string[];
    incomes: string[];
    templates: string[];
    expenses: string[];
    investments: string[];
    loans: string[];
  };
}

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function toNumber(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function optionalDate(value: string | undefined): string | undefined {
  return dateValue(value);
}

function dateValue(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return typeof value === 'string' ? value || undefined : undefined;
}

function requiredDate(value: unknown): string {
  return dateValue(value) ?? '';
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartDate(month: string): string {
  return `${month}-01`;
}

function addMonths(month: string, offset: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const shifted = new Date(year, monthIndex - 1 + offset, 1);

  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthStartDate(): string {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return monthStartDate(month);
}

function dateMonthKey(date?: string): string | undefined {
  const [year, month] = (date ?? '').split('-');
  return year && month ? `${year}-${month.padStart(2, '0')}` : undefined;
}

function expenseMonthKey(expense: Pick<ExpenseEntry, 'date' | 'month'>): string {
  return dateMonthKey(expense.date) ?? expense.month;
}

function expenseSuggestionKey(expense: Pick<ExpenseEntry, 'name' | 'categoryId'>): string {
  return `${expense.name.trim().toLowerCase()}::${expense.categoryId}`;
}

function isOneTimeExpense(expense: ExpenseEntry): boolean {
  const runtimeType = (expense as unknown as { type?: string }).type;
  return !expense.templateId && runtimeType !== 'recurring' && runtimeType !== 'investment';
}

function isOneTimeInvestment(investment: Pick<InvestmentEntry, 'frequency'>): boolean {
  return investment.frequency === 'one-time';
}

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
const PAYMENT_CARD_ICONS: Record<string, string> = {
  rupay: '/payment-icons/cards_rupay.svg',
  maestro: '/payment-icons/cards_maestro.svg',
  'diners-club': '/payment-icons/cards_diners-club.svg',
  'master-card': '/payment-icons/cards_master-card.svg',
  'american-express': '/payment-icons/cards_american-express.svg',
  visa: '/payment-icons/cards_visa.svg',
};
const DEFAULT_CARD_ICON = '/payment-icons/cards_default.svg';
const DEFAULT_BANK_ICON = '/bank-icons/bank-building-icon.svg';
const UNCATEGORIZED_FILTER_VALUE = '__uncategorized';
const NO_PAYMENT_MODE_FILTER_VALUE = '__none';
const PAYMENT_BANK_ICON_BY_NAME = new Map(
  PAYMENT_BANK_OPTIONS.map((bank) => [bank.name, bank.iconSrc] as const),
);
const BULK_SORT_COLUMNS: ReadonlySet<string> = new Set<BulkSortColumn>([
  '',
  'amount',
  'annualRate',
  'cadence',
  'category',
  'color',
  'date',
  'emi',
  'endDate',
  'frequency',
  'lender',
  'loanType',
  'monthlyBudget',
  'month',
  'name',
  'note',
  'outstanding',
  'paymentMode',
  'principal',
  'source',
  'startDate',
  'status',
  'type',
]);
const STATUS_FILTER_OPTIONS: Record<
  'base' | 'suggested',
  readonly SelectOption<RowStatusFilter>[]
> = {
  base: [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'new', label: 'New' },
    { value: 'marked-delete', label: 'Marked delete' },
  ],
  suggested: [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'new', label: 'New' },
    { value: 'suggested', label: 'Suggested' },
    { value: 'marked-delete', label: 'Marked delete' },
  ],
};
const TABLE_SORT_OPTIONS = {
  expenses: [
    { value: '', label: 'Default order' },
    { value: 'name:asc', label: 'Name A-Z' },
    { value: 'name:desc', label: 'Name Z-A' },
    { value: 'date:desc', label: 'Date newest' },
    { value: 'date:asc', label: 'Date oldest' },
    { value: 'amount:desc', label: 'Amount high-low' },
    { value: 'amount:asc', label: 'Amount low-high' },
    { value: 'category:asc', label: 'Category A-Z' },
    { value: 'paymentMode:asc', label: 'Paid via A-Z' },
  ],
  templates: [
    { value: '', label: 'Default order' },
    { value: 'name:asc', label: 'Name A-Z' },
    { value: 'name:desc', label: 'Name Z-A' },
    { value: 'amount:desc', label: 'Amount high-low' },
    { value: 'amount:asc', label: 'Amount low-high' },
    { value: 'category:asc', label: 'Category A-Z' },
    { value: 'frequency:asc', label: 'Frequency A-Z' },
    { value: 'startDate:asc', label: 'Start oldest' },
    { value: 'startDate:desc', label: 'Start newest' },
  ],
  incomes: [
    { value: '', label: 'Default order' },
    { value: 'source:asc', label: 'Source A-Z' },
    { value: 'source:desc', label: 'Source Z-A' },
    { value: 'amount:desc', label: 'Amount high-low' },
    { value: 'amount:asc', label: 'Amount low-high' },
    { value: 'category:asc', label: 'Category A-Z' },
    { value: 'cadence:asc', label: 'Cadence A-Z' },
    { value: 'month:desc', label: 'Month newest' },
  ],
  categories: [
    { value: '', label: 'Default order' },
    { value: 'name:asc', label: 'Name A-Z' },
    { value: 'name:desc', label: 'Name Z-A' },
    { value: 'type:asc', label: 'Type A-Z' },
    { value: 'monthlyBudget:desc', label: 'Budget high-low' },
    { value: 'monthlyBudget:asc', label: 'Budget low-high' },
  ],
  loans: [
    { value: '', label: 'Default order' },
    { value: 'lender:asc', label: 'Lender A-Z' },
    { value: 'lender:desc', label: 'Lender Z-A' },
    { value: 'outstanding:desc', label: 'Outstanding high-low' },
    { value: 'outstanding:asc', label: 'Outstanding low-high' },
    { value: 'emi:desc', label: 'EMI high-low' },
    { value: 'emi:asc', label: 'EMI low-high' },
    { value: 'startDate:asc', label: 'Start oldest' },
    { value: 'endDate:asc', label: 'End soonest' },
  ],
  investments: [
    { value: '', label: 'Default order' },
    { value: 'name:asc', label: 'Name A-Z' },
    { value: 'name:desc', label: 'Name Z-A' },
    { value: 'amount:desc', label: 'Amount high-low' },
    { value: 'amount:asc', label: 'Amount low-high' },
    { value: 'category:asc', label: 'Category A-Z' },
    { value: 'frequency:asc', label: 'Frequency A-Z' },
    { value: 'date:desc', label: 'Date newest' },
    { value: 'paymentMode:asc', label: 'Paid via A-Z' },
  ],
} satisfies Record<BulkTableKey, readonly SortOption[]>;

function isBulkSortColumn(value: string): value is BulkSortColumn {
  return BULK_SORT_COLUMNS.has(value);
}

function defaultFilterState(): BulkTableFilterState {
  return {
    cadence: '',
    categoryId: '',
    categoryType: '',
    expenseType: '',
    frequency: '',
    paymentModeId: '',
    query: '',
    status: 'all',
  };
}

function defaultTableFilters(): Record<BulkTableKey, BulkTableFilterState> {
  return {
    expenses: defaultFilterState(),
    templates: defaultFilterState(),
    incomes: defaultFilterState(),
    categories: defaultFilterState(),
    loans: defaultFilterState(),
    investments: defaultFilterState(),
  };
}

function defaultTableSorts(): Record<BulkTableKey, BulkTableSortState> {
  return {
    expenses: { column: '', direction: 'asc' },
    templates: { column: '', direction: 'asc' },
    incomes: { column: '', direction: 'asc' },
    categories: { column: '', direction: 'asc' },
    loans: { column: '', direction: 'asc' },
    investments: { column: '', direction: 'asc' },
  };
}

@Component({
  selector: 'app-bulk-editor-dialog',
  imports: [
    CommonModule,
    FormsModule,
    NgOptimizedImage,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './bulk-editor-dialog.html',
  styleUrl: './bulk-editor-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkEditorDialog {
  private readonly dialogRef = inject<MatDialogRef<BulkEditorDialog, BulkEditorResult>>(
    MatDialogRef,
    { optional: true },
  );
  private readonly bottomSheetRef = inject<MatBottomSheetRef<BulkEditorDialog, BulkEditorResult>>(
    MatBottomSheetRef,
    {
      optional: true,
    },
  );
  private readonly dialogData = inject<BulkEditorData>(MAT_DIALOG_DATA, { optional: true });
  private readonly bottomSheetData = inject<BulkEditorData>(MAT_BOTTOM_SHEET_DATA, {
    optional: true,
  });
  protected readonly data = this.resolveData();

  protected readonly incomeCadences: Cadence[] = [
    'daily',
    'weekly',
    'bi-weekly',
    'monthly',
    'quarterly',
    'half-yearly',
    'annual',
    'one-time',
  ];
  protected readonly expenseTypes: ExpenseType[] = ['one-time', 'recurring'];
  protected readonly investmentFrequencies: InvestmentFrequency[] = [
    'weekly',
    'monthly',
    'quarterly',
    'half-yearly',
    'annual',
    'one-time',
  ];
  protected readonly recurringFrequencies: InvestmentFrequency[] = this.investmentFrequencies;
  protected readonly categoryTypes: CategoryType[] = ['Income', 'Investments', 'Expenses'];
  protected readonly members = this.data.members ?? [];
  protected readonly paymentAccounts = this.data.paymentAccounts ?? [];
  protected readonly paymentModes = this.data.paymentModes ?? [];
  protected readonly activePaymentModes = this.paymentModes.filter(
    (paymentMode) => !paymentMode.archivedDate,
  );

  private readonly sourceTemplates = cloneRows(this.data.templates);
  private readonly originalIncomesById = new Map(
    this.data.incomes.map((income) => [income.id, { ...income }]),
  );
  private readonly originalInvestmentsById = new Map(
    this.data.investments.map((investment) => [investment.id, { ...investment }]),
  );
  private readonly originalLoansById = new Map(
    this.data.loans.map((loan) => [loan.id, { ...loan }]),
  );
  private readonly originalTemplatesById = new Map(
    this.sourceTemplates.map((template) => [template.id, template]),
  );

  protected readonly categories = signal<Array<DraftRow<BudgetCategory>>>(
    cloneRows(this.data.categories).map((category) => ({
      ...category,
      type: category.type || 'Expenses',
    })),
  );
  protected readonly incomes = signal<Array<DraftRow<IncomeSource>>>(
    cloneRows(this.data.incomes).map((income) => ({
      ...income,
      month: income.month
        ? monthStartDate(dateMonthKey(income.month) ?? income.month)
        : income.month,
    })),
  );
  protected readonly templates = signal<DraftTemplate[]>(
    this.sourceTemplates
      .filter((template) => !template.archivedDate)
      .map((template) => ({
        ...template,
        frequency: template.frequency || 'monthly',
        startDate: template.startDate || currentMonthStartDate(),
      })),
  );
  protected readonly expenses = signal<DraftExpense[]>(this.buildExpenseRows());
  protected readonly investments = signal<Array<DraftRow<InvestmentEntry>>>(
    cloneRows(this.data.investments).map((investment) => ({
      ...investment,
      date: investment.date || monthStartDate(this.data.selectedMonth),
      frequency: investment.frequency || 'one-time',
    })),
  );
  protected readonly loans = signal<Array<DraftRow<Loan>>>(cloneRows(this.data.loans));
  protected readonly editingRowIds = signal(this.initialEditingRowIds());
  protected readonly title = computed(() =>
    this.data.scope === 'monthly'
      ? 'Monthly Entry Editor'
      : this.data.scope === 'planning'
        ? 'Income & Budget Editor'
        : 'Loans & EMI Editor',
  );
  protected readonly subtitle = computed(() =>
    this.data.scope === 'monthly'
      ? 'Bulk edit monthly expenses and entries'
      : this.data.scope === 'planning'
        ? 'Planning scope · bulk edit spreadsheet'
        : 'Bulk edit loan accounts and repayment schedules',
  );
  protected readonly scopeIcon = computed(() =>
    this.data.scope === 'loans'
      ? 'account_balance'
      : this.data.scope === 'planning'
        ? 'grid_view'
        : 'dashboard',
  );
  protected readonly selectedMonthLabel = computed(() =>
    this.auditMonthLabel(monthStartDate(this.data.selectedMonth), this.data.selectedMonth),
  );
  protected readonly showMonthlyTables = computed(() => this.data.scope === 'monthly');
  protected readonly showPlanningTables = computed(() => this.data.scope === 'planning');
  protected readonly showLoanTables = computed(() => this.data.scope === 'loans');
  protected readonly initialTabIndex = computed(() => this.data.initialTabIndex ?? 0);
  protected readonly memberLocked = computed(() => this.isMemberLocked());
  protected readonly expandedTemplateIds = signal(new Set<string>());
  protected readonly expandedAuditIds = signal(new Set<string>());
  protected readonly validationError = signal('');
  protected readonly tableFilters = signal(defaultTableFilters());
  protected readonly tableSorts = signal(defaultTableSorts());
  protected readonly filteredExpenses = computed(() => this.tableRows('expenses', this.expenses()));
  protected readonly filteredTemplates = computed(() =>
    this.tableRows('templates', this.templates()),
  );
  protected readonly filteredIncomes = computed(() => this.tableRows('incomes', this.incomes()));
  protected readonly filteredCategories = computed(() =>
    this.tableRows('categories', this.categories()),
  );
  protected readonly filteredLoans = computed(() => this.tableRows('loans', this.loans()));
  protected readonly filteredInvestments = computed(() =>
    this.tableRows('investments', this.investments()),
  );

  private buildExpenseRows(): DraftExpense[] {
    const currentMonthExpenses = cloneRows(this.data.expenses)
      .filter((expense) => expenseMonthKey(expense) === this.data.selectedMonth)
      .map<DraftExpense>((expense) => ({
        ...expense,
        date: expense.date || monthStartDate(expense.month || this.data.selectedMonth),
      }));
    const currentExpenseKeys = new Set(
      currentMonthExpenses
        .filter((expense) => isOneTimeExpense(expense))
        .map((expense) => expenseSuggestionKey(expense)),
    );
    const suggestedExpensesByKey = new Map<string, DraftExpense>();
    const earliestSuggestionMonth = addMonths(this.data.selectedMonth, -3);

    for (const expense of this.data.expenses) {
      const expenseMonth = expenseMonthKey(expense);
      if (
        !isOneTimeExpense(expense) ||
        !expenseMonth ||
        expenseMonth < earliestSuggestionMonth ||
        expenseMonth >= this.data.selectedMonth ||
        !expense.name.trim()
      ) {
        continue;
      }

      const suggestionKey = expenseSuggestionKey(expense);
      const existingSuggestion = suggestedExpensesByKey.get(suggestionKey);
      if (currentExpenseKeys.has(suggestionKey)) {
        continue;
      }

      if (existingSuggestion && (existingSuggestion.suggestionMonth ?? '') >= expenseMonth) {
        continue;
      }

      suggestedExpensesByKey.set(suggestionKey, {
        id: id('expense-suggestion'),
        month: this.data.selectedMonth,
        date: monthStartDate(this.data.selectedMonth),
        name: expense.name,
        categoryId: expense.categoryId,
        amount: undefined as unknown as number,
        type: 'one-time',
        note: '',
        memberEmail: this.defaultMemberEmail(),
        paymentModeId: '',
        isSuggested: true,
        suggestionMonth: expenseMonth,
      });
    }

    return [...currentMonthExpenses, ...suggestedExpensesByKey.values()];
  }

  protected addExpense(): void {
    this.expenses.update((expenses) => [
      {
        id: id('expense'),
        month: this.data.selectedMonth,
        date: monthStartDate(this.data.selectedMonth),
        name: '',
        categoryId: '',
        amount: undefined as unknown as number,
        type: 'one-time',
        note: '',
        memberEmail: this.defaultMemberEmail(),
        paymentModeId: '',
        isNew: true,
      },
      ...expenses,
    ]);
  }

  protected addRecurringExpense(): void {
    this.templates.update((templates) => [
      {
        id: id('fixed'),
        name: '',
        categoryId: '',
        amount: undefined as unknown as number,
        type: 'recurring',
        frequency: 'monthly',
        createdDate: todayDate(),
        startDate: currentMonthStartDate(),
        endDate: '',
        skippedMonths: [],
        memberEmail: this.defaultMemberEmail(),
        paymentModeId: '',
        isNew: true,
      },
      ...templates,
    ]);
  }

  protected addIncome(): void {
    this.incomes.update((incomes) => [
      {
        id: id('income'),
        source: '',
        amount: undefined as unknown as number,
        cadence: '' as Cadence,
        categoryId: '',
        notes: '',
        month: this.data.selectedMonth,
        createdDate: todayDate(),
        startDate: '',
        endDate: '',
        memberEmail: this.defaultMemberEmail(),
        isNew: true,
      },
      ...incomes,
    ]);
  }

  protected addCategory(): void {
    this.categories.update((categories) => [
      {
        id: id('category'),
        name: '',
        monthlyBudget: undefined as unknown as number,
        color: '',
        type: 'Expenses',
        isNew: true,
      },
      ...categories,
    ]);
  }

  protected addLoan(): void {
    this.loans.update((loans) => [
      {
        id: id('loan'),
        lender: '',
        loanType: '',
        principal: undefined as unknown as number,
        outstanding: undefined as unknown as number,
        annualRate: undefined as unknown as number,
        emi: undefined as unknown as number,
        startDate: '',
        endDate: '',
        notes: '',
        memberEmail: this.defaultMemberEmail(),
        paymentModeId: '',
        isNew: true,
      },
      ...loans,
    ]);
  }

  protected addInvestment(): void {
    this.investments.update((investments) => [
      {
        id: id('investment'),
        name: '',
        amount: undefined as unknown as number,
        categoryId: '',
        frequency: 'one-time',
        date: monthStartDate(this.data.selectedMonth),
        startDate: '',
        endDate: '',
        notes: '',
        createdDate: todayDate(),
        memberEmail: this.defaultMemberEmail(),
        paymentModeId: '',
        isNew: true,
      },
      ...investments,
    ]);
  }

  protected tableQuery(table: BulkTableKey): string {
    return this.tableFilters()[table].query;
  }

  protected filterValue(table: BulkTableKey, key: BulkFilterKey): string {
    return this.tableFilters()[table][key];
  }

  protected setTableQuery(table: BulkTableKey, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    this.setTableFilter(table, 'query', event.target.value);
  }

  protected setTableFilter(table: BulkTableKey, key: BulkFilterKey, value: string): void {
    this.tableFilters.update((filters) => ({
      ...filters,
      [table]: {
        ...filters[table],
        [key]: value,
      } as BulkTableFilterState,
    }));
  }

  protected clearTableFilters(table: BulkTableKey): void {
    this.tableFilters.update((filters) => ({
      ...filters,
      [table]: defaultFilterState(),
    }));
  }

  protected hasActiveFilters(table: BulkTableKey): boolean {
    const filters = this.tableFilters()[table];
    const defaults = defaultFilterState();

    return (Object.keys(defaults) as BulkFilterKey[]).some((key) => filters[key] !== defaults[key]);
  }

  protected statusFilterOptions(table: BulkTableKey): readonly SelectOption<RowStatusFilter>[] {
    return table === 'expenses' ? STATUS_FILTER_OPTIONS.suggested : STATUS_FILTER_OPTIONS.base;
  }

  protected tableSortOptions(table: BulkTableKey): readonly SortOption[] {
    return TABLE_SORT_OPTIONS[table];
  }

  protected sortValue(table: BulkTableKey): string {
    const sort = this.tableSorts()[table];
    return sort.column ? `${sort.column}:${sort.direction}` : '';
  }

  protected setSortFromValue(table: BulkTableKey, value: string): void {
    if (!value) {
      this.tableSorts.update((sorts) => ({
        ...sorts,
        [table]: { column: '', direction: 'asc' },
      }));
      return;
    }

    const [column, direction] = value.split(':');
    if (!isBulkSortColumn(column) || (direction !== 'asc' && direction !== 'desc')) {
      return;
    }

    this.tableSorts.update((sorts) => ({
      ...sorts,
      [table]: { column, direction },
    }));
  }

  protected toggleSort(table: BulkTableKey, column: BulkSortColumn): void {
    this.tableSorts.update((sorts) => {
      const current = sorts[table];
      const direction: SortDirection =
        current.column === column && current.direction === 'asc' ? 'desc' : 'asc';

      return {
        ...sorts,
        [table]: { column, direction },
      };
    });
  }

  protected isSorted(table: BulkTableKey, column: BulkSortColumn): boolean {
    return this.tableSorts()[table].column === column;
  }

  protected sortAria(
    table: BulkTableKey,
    column: BulkSortColumn,
  ): 'ascending' | 'descending' | null {
    const sort = this.tableSorts()[table];
    if (sort.column !== column) {
      return null;
    }

    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(table: BulkTableKey, column: BulkSortColumn): string {
    const sort = this.tableSorts()[table];
    if (sort.column !== column) {
      return 'swap_vert';
    }

    return sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  protected sortButtonLabel(table: BulkTableKey, label: string, column: BulkSortColumn): string {
    const sort = this.tableSorts()[table];
    if (sort.column !== column) {
      return `Sort by ${label}`;
    }

    return `Sort by ${label}, currently ${sort.direction === 'asc' ? 'ascending' : 'descending'}`;
  }

  protected emptyTableMessage(table: BulkTableKey): string {
    if (this.hasActiveFilters(table)) {
      return 'No rows match these filters.';
    }

    const labels: Record<BulkTableKey, string> = {
      expenses: 'No expenses available.',
      templates: 'No recurring expenses available.',
      incomes: 'No income sources available.',
      categories: 'No categories available.',
      loans: 'No loan accounts available.',
      investments: 'No investments available.',
    };

    return labels[table];
  }

  protected visibleRowCount(): number {
    return this.visibleRows().length;
  }

  protected activeRowCount(): number {
    return this.visibleRows().filter((row) => !row.pendingDelete).length;
  }

  protected deletedRowCount(): number {
    return this.visibleRows().filter((row) => row.pendingDelete).length;
  }

  protected toggleDelete(row: DraftRow<{ id: string }>): void {
    row.pendingDelete = !row.pendingDelete;
    if (row.pendingDelete) {
      this.editingRowIds.update((ids) => {
        const next = new Set(ids);
        next.delete(row.id);
        return next;
      });
    }
    this.refreshRows();
  }

  protected isRowEditing(row: EditableDraftRow): boolean {
    return (
      !row.pendingDelete && !!(row.isNew || row.isSuggested || this.editingRowIds().has(row.id))
    );
  }

  protected toggleRowEditing(row: EditableDraftRow, event: Event): void {
    if (row.pendingDelete) {
      return;
    }

    if (row.isNew || row.isSuggested) {
      this.focusEditableRow(event);
      return;
    }

    let shouldFocus = false;
    this.editingRowIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.add(row.id);
        shouldFocus = true;
      }
      return next;
    });

    if (shouldFocus) {
      this.focusEditableRow(event);
    }
  }

  protected toggleRowEditingFromEvent(event: Event): void {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    const container = trigger.closest<HTMLElement>('[data-row-id]');
    const rowId = container?.dataset['rowId'];
    if (!container || !rowId || container.classList.contains('marked-delete')) {
      return;
    }

    const isExplicitlyEditing = this.editingRowIds().has(rowId);
    if (container.classList.contains('row-editing') && !isExplicitlyEditing) {
      this.focusEditableRow(event);
      return;
    }

    this.editingRowIds.update((ids) => {
      const next = new Set(ids);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });

    if (!isExplicitlyEditing) {
      this.focusEditableRow(event);
    }
  }

  private refreshRows(): void {
    this.categories.update((rows) => [...rows]);
    this.incomes.update((rows) => [...rows]);
    this.templates.update((rows) => [...rows]);
    this.expenses.update((rows) => [...rows]);
    this.investments.update((rows) => [...rows]);
    this.loans.update((rows) => [...rows]);
  }

  protected toggleTemplateAudit(templateId: string): void {
    this.expandedTemplateIds.update((ids) => {
      const next = new Set(ids);
      next.has(templateId) ? next.delete(templateId) : next.add(templateId);
      return next;
    });
  }

  protected isTemplateAuditExpanded(templateId: string): boolean {
    return this.expandedTemplateIds().has(templateId);
  }

  protected toggleAudit(recordId: string): void {
    this.expandedAuditIds.update((ids) => {
      const next = new Set(ids);
      next.has(recordId) ? next.delete(recordId) : next.add(recordId);
      return next;
    });
  }

  protected isAuditExpanded(recordId: string): boolean {
    return this.expandedAuditIds().has(recordId);
  }

  protected recurringAuditRows(template: ExpenseTemplate): RecurringAuditRow[] {
    return (template.auditTrail ?? [])
      .filter((audit) => this.isHistoricalAuditVersion(audit))
      .map((audit) => this.auditRowFromVersion(audit))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected incomeAuditRows(income: IncomeSource): AuditDisplayRow[] {
    return (income.auditTrail ?? [])
      .filter((audit) => this.isVisibleAuditOperation(audit.operation))
      .map((audit) => ({
        id: audit.id,
        operation: this.auditOperationLabel(audit.operation),
        name: audit.source,
        amount: audit.amount,
        recordedDate: audit.recordedDate,
        startDate: audit.effectiveStartDate || audit.startDate || audit.month,
        endDate: audit.effectiveEndDate || audit.endDate,
      }))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected investmentAuditRows(investment: InvestmentEntry): AuditDisplayRow[] {
    return (investment.auditTrail ?? [])
      .filter((audit) => this.isVisibleAuditOperation(audit.operation))
      .map((audit) => ({
        id: audit.id,
        operation: this.auditOperationLabel(audit.operation),
        name: audit.name,
        amount: audit.amount,
        recordedDate: audit.recordedDate,
        startDate:
          audit.effectiveStartDate ||
          audit.startDate ||
          audit.date ||
          monthStartDate(this.data.selectedMonth),
        endDate: audit.effectiveEndDate || audit.endDate,
      }))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected loanAuditRows(loan: Loan): AuditDisplayRow[] {
    return (loan.auditTrail ?? [])
      .filter((audit) => this.isVisibleAuditOperation(audit.operation))
      .map((audit) => ({
        id: audit.id,
        operation: this.auditOperationLabel(audit.operation),
        name: `${audit.lender} ${audit.loanType}`.trim(),
        amount: audit.emi,
        recordedDate: audit.recordedDate,
        startDate: audit.effectiveStartDate || audit.startDate,
        endDate: audit.effectiveEndDate || audit.endDate,
      }))
      .filter((audit) => !audit.startDate || !audit.endDate || audit.startDate <= audit.endDate)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }

  protected categoryName(categoryId: string | undefined): string {
    return (
      this.categories().find((category) => category.id === categoryId)?.name ?? 'Uncategorized'
    );
  }

  protected categoriesByType(type: CategoryType): Array<DraftRow<BudgetCategory>> {
    return this.categories().filter((category) => (category.type ?? 'Expenses') === type);
  }

  protected memberName(email: string | undefined): string {
    if (!email) {
      return 'Unassigned';
    }

    return this.members.find((member) => member.email === email)?.displayName || email;
  }

  protected paymentModeName(paymentModeId: string | undefined): string {
    if (!paymentModeId) {
      return 'Not set';
    }

    const paymentMode = this.paymentModes.find((mode) => mode.id === paymentModeId);
    return paymentMode ? this.paymentModeDisplayLabel(paymentMode) : 'Saved payment mode';
  }

  protected paymentModeIconSrc(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'internet-banking') {
      const account = this.paymentAccountForMode(paymentMode);
      return account
        ? this.paymentAccountIconSrc(account)
        : (PAYMENT_BANK_ICON_BY_NAME.get(paymentMode.bankName ?? 'Default') ?? DEFAULT_BANK_ICON);
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

  protected paymentModeMeta(paymentModeId: string | undefined): PaymentModeMeta | null {
    if (!paymentModeId) {
      return null;
    }

    const paymentMode = this.paymentModes.find((mode) => mode.id === paymentModeId);
    if (!paymentMode) {
      return {
        iconSrc: DEFAULT_CARD_ICON,
        label: 'Saved payment mode',
      };
    }

    return {
      iconSrc: this.paymentModeIconSrc(paymentMode),
      label: this.paymentModeShortLabel(paymentMode),
    };
  }

  protected paymentModeDisplayLabel(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    const account = this.paymentAccountForMode(paymentMode);
    const ownerTag = this.memberTag(paymentMode.memberEmail ?? account?.memberEmail);

    if (paymentMode.type === 'upi' || paymentMode.type === 'wallet') {
      return `${this.paymentProviderLabel(paymentMode.provider) ?? paymentMode.type} ${ownerTag}`;
    }

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return `${ownerTag} ${this.lastFourLabel(paymentMode.lastFour)}`;
    }

    if (paymentMode.type === 'internet-banking') {
      return `${ownerTag} ${this.lastFourLabel(account?.lastFour)}`;
    }

    return ownerTag;
  }

  protected paymentModeShortLabel(paymentMode: PaymentMode): string {
    if (paymentMode.type === 'cash') {
      return 'Cash';
    }

    const account = this.paymentAccountForMode(paymentMode);
    const ownerTag = this.memberTag(paymentMode.memberEmail ?? account?.memberEmail);

    if (paymentMode.type === 'credit-card' || paymentMode.type === 'debit-card') {
      return `${ownerTag} ${this.lastFourLabel(paymentMode.lastFour)}`;
    }

    if (paymentMode.type === 'internet-banking') {
      return `${ownerTag} ${this.lastFourLabel(account?.lastFour)}`;
    }

    return ownerTag;
  }

  protected paymentAccountIconSrc(account: Pick<PaymentAccount, 'bankName'>): string {
    return PAYMENT_BANK_ICON_BY_NAME.get(account.bankName) ?? DEFAULT_BANK_ICON;
  }

  protected memberDisplayName(member: WorkspaceMember): string {
    return member.displayName || member.email;
  }

  protected amountLabel(value: unknown): string {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
      style: 'currency',
      currency: 'INR',
    }).format(toNumber(value));
  }

  protected dateLabel(value: unknown, fallback = '-'): string {
    const date = dateValue(value);
    if (!date) {
      return fallback;
    }

    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) {
      return fallback;
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(year, month - 1, day));
  }

  protected monthLabel(value: unknown, fallback = '-'): string {
    const month = dateMonthKey(dateValue(value) ?? (typeof value === 'string' ? value : undefined));
    if (!month) {
      return fallback;
    }

    return this.auditMonthLabel(`${month}-01`, fallback);
  }

  protected typeLabel(value: string | undefined, fallback = 'one-time'): string {
    return value || fallback;
  }

  protected noteLabel(value: string | undefined, fallback = 'No note'): string {
    return value?.trim() || fallback;
  }

  protected colorLabel(value: string | undefined): string {
    return value || '#1f7a8c';
  }

  protected focusEditableRow(event: Event): void {
    const trigger = event.currentTarget;
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    const container = trigger.closest('.mobile-row-card, tr');
    setTimeout(() => {
      const target = container?.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), .mat-mdc-select:not(.mat-mdc-select-disabled)',
      );

      target?.focus();
    });
  }

  protected loanDateInvalid(value: unknown): boolean {
    return this.validationError().includes('loan') && !dateValue(value);
  }

  protected expenseRowLabel(expense: DraftExpense, rowIndex: number): string {
    return this.rowLabel('Expense', expense.name, rowIndex, expense);
  }

  protected templateRowLabel(template: DraftTemplate, rowIndex: number): string {
    return this.rowLabel('Recurring expense', template.name, rowIndex, template);
  }

  protected incomeRowLabel(income: DraftRow<IncomeSource>, rowIndex: number): string {
    return this.rowLabel('Income', income.source, rowIndex, income);
  }

  protected categoryRowLabel(category: DraftRow<BudgetCategory>, rowIndex: number): string {
    return this.rowLabel('Category', category.name, rowIndex, category);
  }

  protected loanRowLabel(loan: DraftRow<Loan>, rowIndex: number): string {
    return this.rowLabel('Loan', `${loan.lender} ${loan.loanType}`.trim(), rowIndex, loan);
  }

  protected investmentRowLabel(investment: DraftRow<InvestmentEntry>, rowIndex: number): string {
    return this.rowLabel('Investment', investment.name, rowIndex, investment);
  }

  protected defaultMemberEmail(): string | undefined {
    return this.data.actingMemberEmail ?? this.lockedMemberEmail();
  }

  protected userFieldDisabled(row: { pendingDelete?: boolean }): boolean {
    return !!row.pendingDelete || !!this.defaultMemberEmail();
  }

  protected auditMonthLabel(date: string | undefined, fallback: string): string {
    const month = dateMonthKey(date);
    if (!month) {
      return fallback;
    }

    const [year, monthIndex] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
      new Date(year, monthIndex - 1, 1),
    );
  }

  protected auditDateTimeLabel(date: string | undefined): string {
    if (!date) {
      return 'Not recorded';
    }

    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(parsed);
  }

  protected apply(): void {
    if (this.hasLoanDateErrors()) {
      this.validationError.set('Every active loan must have both start and end dates.');
      return;
    }

    const recurringValidationError = this.recurringValidationError();
    if (recurringValidationError) {
      this.validationError.set(recurringValidationError);
      return;
    }

    const memberValidationError = this.memberValidationError();
    if (memberValidationError) {
      this.validationError.set(memberValidationError);
      return;
    }

    const createdDate = todayDate();
    const expenseRows = this.activeExpenseRows();
    const templates = this.templates()
      .filter((template) => !template.pendingDelete)
      .map((template) => {
        const original = this.originalTemplatesById.get(template.id);

        return {
          id: template.id,
          name: template.isNew
            ? template.name.trim() || 'Recurring expense'
            : original?.name || template.name.trim() || 'Recurring expense',
          categoryId: template.isNew
            ? template.categoryId
            : original?.categoryId || template.categoryId,
          amount: toNumber(template.amount),
          type: 'recurring' as const,
          frequency: template.frequency || 'monthly',
          createdDate: template.createdDate || createdDate,
          startDate: optionalDate(template.startDate) || currentMonthStartDate(),
          endDate: optionalDate(template.endDate),
          skippedMonths: template.skippedMonths ?? [],
          archivedDate: template.archivedDate,
          memberEmail: this.recordMemberEmail(template),
          paymentModeId: template.paymentModeId || undefined,
          auditTrail: template.auditTrail ?? [],
        };
      });
    const expenses = this.showMonthlyTables()
      ? expenseRows.map((expense) => ({
          id: expense.id,
          month: dateMonthKey(dateValue(expense.date)) || expense.month || this.data.selectedMonth,
          date:
            optionalDate(expense.date) || monthStartDate(expense.month || this.data.selectedMonth),
          name: expense.name.trim() || 'Expense',
          categoryId: expense.categoryId,
          amount: toNumber(expense.amount),
          type: expense.templateId
            ? ('recurring' as const)
            : expense.type === 'recurring'
              ? ('recurring' as const)
              : ('one-time' as const),
          note: expense.note ?? '',
          templateId: expense.templateId || undefined,
          memberEmail: this.recordMemberEmail(expense),
          paymentModeId: expense.paymentModeId || undefined,
        }))
      : this.data.expenses;

    this.close({
      scope: this.data.scope,
      categories: this.activeRows(this.categories()).map((category) => ({
        id: category.id,
        name: category.name.trim() || 'Category',
        monthlyBudget: toNumber(category.monthlyBudget),
        color: category.color || '#1f7a8c',
        type: category.type || 'Expenses',
      })),
      incomes: this.incomes()
        .filter((income) => !income.pendingDelete)
        .map((income) => ({
          id: income.id,
          source: income.isNew
            ? income.source.trim() || 'Income'
            : this.originalIncomesById.get(income.id)?.source || income.source.trim() || 'Income',
          amount: toNumber(income.amount),
          cadence: income.isNew
            ? income.cadence || 'monthly'
            : this.originalIncomesById.get(income.id)?.cadence || income.cadence || 'monthly',
          notes: income.notes ?? '',
          categoryId: income.categoryId,
          month: dateMonthKey(dateValue(income.month)) || income.month || this.data.selectedMonth,
          createdDate: income.createdDate || createdDate,
          startDate: optionalDate(income.startDate),
          endDate: optionalDate(income.endDate),
          auditTrail: income.auditTrail ?? [],
          memberEmail: this.recordMemberEmail(income),
        })),
      templates,
      expenses,
      investments: this.investments()
        .filter((investment) => !investment.pendingDelete)
        .map((investment) => ({
          id: investment.id,
          name: investment.isNew
            ? investment.name.trim() || 'Investment'
            : this.originalInvestmentsById.get(investment.id)?.name ||
              investment.name.trim() ||
              'Investment',
          amount: toNumber(investment.amount),
          categoryId: investment.categoryId,
          frequency: investment.frequency || 'one-time',
          date: optionalDate(investment.date) || monthStartDate(this.data.selectedMonth),
          startDate: !isOneTimeInvestment(investment)
            ? optionalDate(investment.startDate) || optionalDate(investment.date)
            : optionalDate(investment.startDate),
          endDate: optionalDate(investment.endDate),
          notes: investment.notes ?? '',
          createdDate: investment.createdDate || createdDate,
          skippedMonths: investment.skippedMonths ?? [],
          sourceInvestmentId: investment.sourceInvestmentId,
          auditTrail: investment.auditTrail ?? [],
          memberEmail: this.recordMemberEmail(investment),
          paymentModeId: investment.paymentModeId || undefined,
        })),
      loans: this.loans()
        .filter((loan) => !loan.pendingDelete)
        .map((loan) => ({
          id: loan.id,
          lender: loan.isNew
            ? loan.lender.trim() || 'Lender'
            : this.originalLoansById.get(loan.id)?.lender || loan.lender.trim() || 'Lender',
          loanType: loan.isNew
            ? loan.loanType.trim() || 'Loan'
            : this.originalLoansById.get(loan.id)?.loanType || loan.loanType.trim() || 'Loan',
          principal: toNumber(loan.principal),
          outstanding: toNumber(loan.outstanding),
          annualRate: toNumber(loan.annualRate),
          emi: toNumber(loan.emi),
          startDate: requiredDate(loan.startDate),
          endDate: requiredDate(loan.endDate),
          notes: loan.notes ?? '',
          memberEmail: this.recordMemberEmail(loan),
          paymentModeId: loan.paymentModeId || undefined,
          auditTrail: loan.auditTrail ?? [],
        })),
      deleted: {
        categories: this.deletedIds(this.categories()),
        incomes: this.deletedIds(this.incomes()),
        templates: this.deletedIds(this.templates()),
        expenses: this.deletedIds(this.expenses()),
        investments: this.deletedIds(this.investments()),
        loans: this.deletedIds(this.loans()),
      },
    });
  }

  protected hasLoanDateErrors(): boolean {
    return this.activeRows(this.loans()).some(
      (loan) => !dateValue(loan.startDate) || !dateValue(loan.endDate),
    );
  }

  protected cancel(): void {
    this.close();
  }

  private close(result?: BulkEditorResult): void {
    if (this.bottomSheetRef) {
      this.bottomSheetRef.dismiss(result);
      return;
    }

    this.dialogRef?.close(result);
  }

  private resolveData(): BulkEditorData {
    const data = this.dialogData ?? this.bottomSheetData;
    if (!data) {
      throw new Error('Bulk editor dialog data is required.');
    }

    return data;
  }

  private initialEditingRowIds(): Set<string> {
    const editingRowIds = new Set<string>();
    if (this.data.initialEditingRowId) {
      editingRowIds.add(this.data.initialEditingRowId);
    }

    for (const row of [
      ...this.expenses(),
      ...this.templates(),
      ...this.incomes(),
      ...this.categories(),
      ...this.loans(),
      ...this.investments(),
    ]) {
      if (row.isNew || ('isSuggested' in row && row.isSuggested)) {
        editingRowIds.add(row.id);
      }
    }

    return editingRowIds;
  }

  private tableRows<T extends BulkDisplayRow>(table: BulkTableKey, rows: T[]): T[] {
    const filters = this.tableFilters()[table];
    const filteredRows = rows.filter(
      (row) =>
        this.matchesStatus(row, filters.status) &&
        this.matchesQuery(table, row, filters.query) &&
        this.matchesCategory(table, row, filters.categoryId) &&
        this.matchesCategoryType(table, row, filters.categoryType) &&
        this.matchesExpenseType(table, row, filters.expenseType) &&
        this.matchesFrequency(table, row, filters.frequency) &&
        this.matchesCadence(table, row, filters.cadence) &&
        this.matchesPaymentMode(table, row, filters.paymentModeId),
    );

    return this.sortedRows(table, filteredRows);
  }

  private matchesStatus(row: BulkDisplayRow, status: RowStatusFilter): boolean {
    if (status === 'all') {
      return true;
    }

    if (status === 'active') {
      return !row.pendingDelete;
    }

    if (status === 'new') {
      return !!row.isNew;
    }

    if (status === 'suggested') {
      return 'isSuggested' in row && !!row.isSuggested;
    }

    return !!row.pendingDelete;
  }

  private matchesQuery(table: BulkTableKey, row: BulkDisplayRow, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return this.rowSearchText(table, row).toLowerCase().includes(normalizedQuery);
  }

  private matchesCategory(table: BulkTableKey, row: BulkDisplayRow, categoryId: string): boolean {
    if (!categoryId) {
      return true;
    }

    const rowCategoryId = this.rowCategoryId(table, row);
    return categoryId === UNCATEGORIZED_FILTER_VALUE
      ? !rowCategoryId
      : rowCategoryId === categoryId;
  }

  private matchesCategoryType(
    table: BulkTableKey,
    row: BulkDisplayRow,
    categoryType: CategoryType | '',
  ): boolean {
    return !categoryType || this.rowCategoryType(table, row) === categoryType;
  }

  private matchesExpenseType(
    table: BulkTableKey,
    row: BulkDisplayRow,
    expenseType: ExpenseType | '',
  ): boolean {
    return !expenseType || this.rowExpenseType(table, row) === expenseType;
  }

  private matchesFrequency(
    table: BulkTableKey,
    row: BulkDisplayRow,
    frequency: InvestmentFrequency | '',
  ): boolean {
    return !frequency || this.rowFrequency(table, row) === frequency;
  }

  private matchesCadence(table: BulkTableKey, row: BulkDisplayRow, cadence: Cadence | ''): boolean {
    return !cadence || this.rowCadence(table, row) === cadence;
  }

  private matchesPaymentMode(
    table: BulkTableKey,
    row: BulkDisplayRow,
    paymentModeId: string,
  ): boolean {
    if (!paymentModeId) {
      return true;
    }

    const rowPaymentModeId = this.rowPaymentModeId(table, row);
    return paymentModeId === NO_PAYMENT_MODE_FILTER_VALUE
      ? !rowPaymentModeId
      : rowPaymentModeId === paymentModeId;
  }

  private sortedRows<T extends BulkDisplayRow>(table: BulkTableKey, rows: T[]): T[] {
    const sort = this.tableSorts()[table];
    if (!sort.column) {
      return rows;
    }

    return rows
      .map((row, index) => ({ index, row }))
      .sort((left, right) => {
        const comparison = this.compareRows(table, left.row, right.row, sort.column);
        const directedComparison = sort.direction === 'asc' ? comparison : -comparison;
        return directedComparison || left.index - right.index;
      })
      .map(({ row }) => row);
  }

  private compareRows(
    table: BulkTableKey,
    left: BulkDisplayRow,
    right: BulkDisplayRow,
    column: BulkSortColumn,
  ): number {
    return this.compareSortValues(
      this.rowSortValue(table, left, column),
      this.rowSortValue(table, right, column),
    );
  }

  private compareSortValues(left: number | string, right: number | string): number {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }

    return String(left).localeCompare(String(right), 'en-IN', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  private rowSearchText(table: BulkTableKey, row: BulkDisplayRow): string {
    switch (table) {
      case 'expenses': {
        const expense = row as DraftExpense;
        return [
          expense.name,
          this.categoryName(expense.categoryId),
          expense.amount,
          expense.type,
          expense.date,
          expense.note,
          this.paymentModeName(expense.paymentModeId),
          this.rowStatusLabel(expense),
        ].join(' ');
      }
      case 'templates': {
        const template = row as DraftTemplate;
        return [
          template.name,
          this.categoryName(template.categoryId),
          template.amount,
          template.frequency,
          template.startDate,
          template.endDate,
          this.paymentModeName(template.paymentModeId),
          this.rowStatusLabel(template),
        ].join(' ');
      }
      case 'incomes': {
        const income = row as DraftRow<IncomeSource>;
        return [
          income.source,
          this.categoryName(income.categoryId),
          income.amount,
          income.cadence,
          income.month,
          income.notes,
          this.rowStatusLabel(income),
        ].join(' ');
      }
      case 'categories': {
        const category = row as DraftRow<BudgetCategory>;
        return [
          category.name,
          category.type,
          category.monthlyBudget,
          category.color,
          this.rowStatusLabel(category),
        ].join(' ');
      }
      case 'loans': {
        const loan = row as DraftRow<Loan>;
        return [
          loan.lender,
          loan.loanType,
          loan.principal,
          loan.outstanding,
          loan.annualRate,
          loan.emi,
          loan.startDate,
          loan.endDate,
          loan.notes,
          this.paymentModeName(loan.paymentModeId),
          this.rowStatusLabel(loan),
        ].join(' ');
      }
      case 'investments': {
        const investment = row as DraftRow<InvestmentEntry>;
        return [
          investment.name,
          this.categoryName(investment.categoryId),
          investment.amount,
          investment.frequency,
          investment.date,
          investment.startDate,
          investment.endDate,
          investment.notes,
          this.paymentModeName(investment.paymentModeId),
          this.rowStatusLabel(investment),
        ].join(' ');
      }
    }
  }

  private rowSortValue(
    table: BulkTableKey,
    row: BulkDisplayRow,
    column: BulkSortColumn,
  ): number | string {
    if (column === 'status') {
      return this.rowStatusLabel(row);
    }

    if (column === 'category') {
      return this.categoryName(this.rowCategoryId(table, row));
    }

    if (column === 'paymentMode') {
      return this.paymentModeName(this.rowPaymentModeId(table, row));
    }

    switch (table) {
      case 'expenses': {
        const expense = row as DraftExpense;
        return this.expenseSortValue(expense, column);
      }
      case 'templates': {
        const template = row as DraftTemplate;
        return this.templateSortValue(template, column);
      }
      case 'incomes': {
        const income = row as DraftRow<IncomeSource>;
        return this.incomeSortValue(income, column);
      }
      case 'categories': {
        const category = row as DraftRow<BudgetCategory>;
        return this.categorySortValue(category, column);
      }
      case 'loans': {
        const loan = row as DraftRow<Loan>;
        return this.loanSortValue(loan, column);
      }
      case 'investments': {
        const investment = row as DraftRow<InvestmentEntry>;
        return this.investmentSortValue(investment, column);
      }
    }
  }

  private expenseSortValue(expense: DraftExpense, column: BulkSortColumn): number | string {
    if (column === 'amount') {
      return toNumber(expense.amount);
    }

    if (column === 'date') {
      return dateValue(expense.date) ?? '';
    }

    if (column === 'type') {
      return expense.type;
    }

    if (column === 'note') {
      return expense.note ?? '';
    }

    return expense.name ?? '';
  }

  private templateSortValue(template: DraftTemplate, column: BulkSortColumn): number | string {
    if (column === 'amount') {
      return toNumber(template.amount);
    }

    if (column === 'frequency') {
      return template.frequency ?? '';
    }

    if (column === 'startDate') {
      return dateValue(template.startDate) ?? '';
    }

    if (column === 'endDate') {
      return dateValue(template.endDate) ?? '';
    }

    return template.name ?? '';
  }

  private incomeSortValue(income: DraftRow<IncomeSource>, column: BulkSortColumn): number | string {
    if (column === 'amount') {
      return toNumber(income.amount);
    }

    if (column === 'cadence') {
      return income.cadence ?? '';
    }

    if (column === 'month') {
      return dateMonthKey(dateValue(income.month) ?? income.month) ?? '';
    }

    if (column === 'note') {
      return income.notes ?? '';
    }

    return income.source ?? '';
  }

  private categorySortValue(
    category: DraftRow<BudgetCategory>,
    column: BulkSortColumn,
  ): number | string {
    if (column === 'monthlyBudget') {
      return toNumber(category.monthlyBudget);
    }

    if (column === 'type') {
      return category.type ?? 'Expenses';
    }

    if (column === 'color') {
      return category.color ?? '';
    }

    return category.name ?? '';
  }

  private loanSortValue(loan: DraftRow<Loan>, column: BulkSortColumn): number | string {
    if (column === 'principal') {
      return toNumber(loan.principal);
    }

    if (column === 'outstanding') {
      return toNumber(loan.outstanding);
    }

    if (column === 'annualRate') {
      return toNumber(loan.annualRate);
    }

    if (column === 'emi') {
      return toNumber(loan.emi);
    }

    if (column === 'startDate') {
      return dateValue(loan.startDate) ?? '';
    }

    if (column === 'endDate') {
      return dateValue(loan.endDate) ?? '';
    }

    if (column === 'loanType') {
      return loan.loanType ?? '';
    }

    if (column === 'note') {
      return loan.notes ?? '';
    }

    return loan.lender ?? '';
  }

  private investmentSortValue(
    investment: DraftRow<InvestmentEntry>,
    column: BulkSortColumn,
  ): number | string {
    if (column === 'amount') {
      return toNumber(investment.amount);
    }

    if (column === 'frequency') {
      return investment.frequency ?? '';
    }

    if (column === 'date') {
      return dateValue(investment.date) ?? '';
    }

    if (column === 'startDate') {
      return dateValue(investment.startDate) ?? '';
    }

    if (column === 'endDate') {
      return dateValue(investment.endDate) ?? '';
    }

    if (column === 'note') {
      return investment.notes ?? '';
    }

    return investment.name ?? '';
  }

  private rowCategoryId(table: BulkTableKey, row: BulkDisplayRow): string | undefined {
    if (table === 'expenses') {
      return (row as DraftExpense).categoryId;
    }

    if (table === 'templates') {
      return (row as DraftTemplate).categoryId;
    }

    if (table === 'incomes') {
      return (row as DraftRow<IncomeSource>).categoryId;
    }

    if (table === 'investments') {
      return (row as DraftRow<InvestmentEntry>).categoryId;
    }

    return undefined;
  }

  private rowCategoryType(table: BulkTableKey, row: BulkDisplayRow): CategoryType | undefined {
    return table === 'categories'
      ? ((row as DraftRow<BudgetCategory>).type ?? 'Expenses')
      : undefined;
  }

  private rowExpenseType(table: BulkTableKey, row: BulkDisplayRow): ExpenseType | undefined {
    return table === 'expenses' ? (row as DraftExpense).type : undefined;
  }

  private rowFrequency(table: BulkTableKey, row: BulkDisplayRow): InvestmentFrequency | undefined {
    if (table === 'templates') {
      return (row as DraftTemplate).frequency ?? 'monthly';
    }

    if (table === 'investments') {
      return (row as DraftRow<InvestmentEntry>).frequency;
    }

    return undefined;
  }

  private rowCadence(table: BulkTableKey, row: BulkDisplayRow): Cadence | undefined {
    return table === 'incomes' ? (row as DraftRow<IncomeSource>).cadence : undefined;
  }

  private rowPaymentModeId(table: BulkTableKey, row: BulkDisplayRow): string | undefined {
    if (table === 'expenses') {
      return (row as DraftExpense).paymentModeId;
    }

    if (table === 'templates') {
      return (row as DraftTemplate).paymentModeId;
    }

    if (table === 'loans') {
      return (row as DraftRow<Loan>).paymentModeId;
    }

    if (table === 'investments') {
      return (row as DraftRow<InvestmentEntry>).paymentModeId;
    }

    return undefined;
  }

  private rowStatusLabel(row: BulkDisplayRow): string {
    if (row.pendingDelete) {
      return 'marked delete';
    }

    if (row.isNew) {
      return 'new';
    }

    if ('isSuggested' in row && row.isSuggested) {
      return 'suggested';
    }

    return 'active';
  }

  private visibleRows(): BulkDisplayRow[] {
    if (this.showMonthlyTables()) {
      return [...this.filteredExpenses(), ...this.filteredTemplates()];
    }

    if (this.showPlanningTables()) {
      return [
        ...this.filteredIncomes(),
        ...this.filteredInvestments(),
        ...this.filteredCategories(),
      ];
    }

    return this.filteredLoans();
  }

  private rowLabel(
    label: string,
    name: string | undefined,
    rowIndex: number,
    row: { isNew?: boolean; isSuggested?: boolean; pendingDelete?: boolean },
  ): string {
    const parts = [`${label} row ${rowIndex + 1}`];
    const trimmedName = name?.trim();

    if (trimmedName) {
      parts.push(trimmedName);
    }

    if (row.isNew) {
      parts.push('new row');
    } else if (row.isSuggested) {
      parts.push('suggested row');
    }

    if (row.pendingDelete) {
      parts.push('marked for deletion');
    }

    return parts.join(', ');
  }

  private activeRows<T extends { id: string }>(rows: Array<DraftRow<T>>): T[] {
    return rows
      .filter((row) => !row.pendingDelete)
      .map(({ isNew: _isNew, pendingDelete: _pendingDelete, ...row }) => row as T);
  }

  private deletedIds<T extends { id: string }>(rows: Array<DraftRow<T>>): string[] {
    return rows.filter((row) => row.pendingDelete).map((row) => row.id);
  }

  private activeExpenseRows(): DraftExpense[] {
    return this.expenses()
      .filter((expense) => !expense.pendingDelete)
      .filter((expense) => !expense.isSuggested || this.isSuggestedExpenseReady(expense))
      .map(({ isNew: _isNew, pendingDelete: _pendingDelete, ...expense }) => expense);
  }

  private isSuggestedExpenseReady(expense: DraftExpense): boolean {
    const amount = Number(expense.amount);
    return Number.isFinite(amount) && amount > 0;
  }

  private recurringValidationError(): string {
    if (!this.showMonthlyTables()) {
      return '';
    }

    const earliestStartDate = currentMonthStartDate();

    for (const template of this.templates()) {
      if (template.pendingDelete) {
        continue;
      }

      const original = this.originalTemplatesById.get(template.id);
      const isCreate = template.isNew || !original;
      const isUpdate = !!original && this.isRecurringDraftChanged(template, original);
      if (!isCreate && !isUpdate) {
        continue;
      }

      const amount = Number(template.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return 'Amount is mandatory for every active recurring expense.';
      }

      const startDate = optionalDate(template.startDate) || currentMonthStartDate();
      const endDate = optionalDate(template.endDate);

      if (isUpdate && startDate < earliestStartDate) {
        return 'Recurring updates can only start from the selected month or a future month.';
      }

      if (endDate && endDate <= startDate) {
        return 'Recurring end date must be greater than the start date.';
      }
    }

    return '';
  }

  private memberValidationError(): string {
    return '';
  }

  private recordMemberEmail(record: { memberEmail?: string }): string | undefined {
    return this.defaultMemberEmail() ?? record.memberEmail ?? undefined;
  }

  private isMemberLocked(): boolean {
    return !!this.defaultMemberEmail();
  }

  private lockedMemberEmail(): string | undefined {
    return this.data.selectedMemberEmail && this.data.selectedMemberEmail !== 'ALL'
      ? this.data.selectedMemberEmail
      : undefined;
  }

  private paymentAccountForMode(paymentMode: PaymentMode): PaymentAccount | undefined {
    if (!paymentMode.paymentAccountId) {
      return undefined;
    }

    return this.paymentAccounts.find((account) => account.id === paymentMode.paymentAccountId);
  }

  private memberTag(memberEmail: string | undefined): string {
    if (!memberEmail) {
      return 'Legacy';
    }

    return this.shortMemberName(this.memberName(memberEmail));
  }

  private shortMemberName(name: string): string {
    const [firstName, secondName] = name.split(/\s+/).filter(Boolean);
    if (!firstName) {
      return 'Unassigned';
    }

    return secondName ? `${firstName} ${secondName[0].toUpperCase()}` : firstName;
  }

  private lastFourLabel(lastFour: string | undefined): string {
    return lastFour?.replace(/\D/g, '').slice(-4) || '----';
  }

  private paymentProviderLabel(
    provider: PaymentMode['provider'] | string | undefined,
  ): string | undefined {
    if (provider === 'GPay') {
      return 'Google Pay';
    }

    if (provider === 'SamsungPay') {
      return 'Samsung Pay';
    }

    return provider;
  }

  private isRecurringDraftChanged(template: DraftTemplate, original: ExpenseTemplate): boolean {
    const currentStartDate = currentMonthStartDate();

    return (
      toNumber(template.amount) !== original.amount ||
      (template.frequency || 'monthly') !== (original.frequency || 'monthly') ||
      (optionalDate(template.startDate) || currentStartDate) !==
        (optionalDate(original.startDate) || currentStartDate) ||
      (optionalDate(template.endDate) || '') !== (optionalDate(original.endDate) || '') ||
      (template.paymentModeId || '') !== (original.paymentModeId || '')
    );
  }

  private auditRowFromVersion(audit: ExpenseTemplateAuditVersion): RecurringAuditRow {
    return {
      id: audit.id,
      operation:
        audit.operation === 'created'
          ? 'Created'
          : audit.operation === 'deleted'
            ? 'Deleted'
            : 'Updated',
      label:
        audit.operation === 'deleted'
          ? 'Future records stopped from the next version'
          : 'Previous values kept for past months',
      name: audit.name,
      categoryId: audit.categoryId,
      amount: audit.amount,
      recordedDate: audit.recordedDate,
      startDate: audit.effectiveStartDate || audit.startDate,
      endDate: audit.effectiveEndDate || audit.endDate,
    };
  }

  private isHistoricalAuditVersion(audit: ExpenseTemplateAuditVersion): boolean {
    const operation = audit.operation.toLowerCase();
    return operation !== 'created' && operation !== 'deleted';
  }

  private isVisibleAuditOperation(
    operation:
      | ExpenseTemplateAuditVersion['operation']
      | IncomeAuditVersion['operation']
      | InvestmentAuditVersion['operation']
      | LoanAuditVersion['operation'],
  ): boolean {
    return operation !== 'created';
  }

  private auditOperationLabel(operation: string): string {
    return operation === 'deleted' ? 'Deleted' : operation === 'updated' ? 'Updated' : 'Created';
  }
}
