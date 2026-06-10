import type {
  BudgetCategory,
  BudgetDataMap,
  ExpenseEntry,
  ExpenseTemplate,
  IncomeSource,
  InvestmentEntry,
  Loan,
} from './budget.models';

export type ImportRecordType =
  | 'category'
  | 'income'
  | 'expense'
  | 'recurring_expense'
  | 'investment'
  | 'loan';

export type ImportStatus = 'pending' | 'success' | 'error';

export interface BudgetImportRow {
  rowNumber: number;
  values: Record<string, string>;
  status: ImportStatus;
  comments: string[];
  recordType?: ImportRecordType;
  collectionName?: keyof BudgetDataMap;
  record?: BudgetDataMap[keyof BudgetDataMap];
}

export interface BudgetImportParseResult {
  rows: BudgetImportRow[];
  headers: string[];
}

export interface BudgetImportSummary {
  total: number;
  success: number;
  error: number;
}

const TEMPLATE_HEADERS = [
  'recordType',
  'name',
  'categoryName',
  'monthlyBudget',
  'color',
  'source',
  'amount',
  'cadence',
  'month',
  'date',
  'type',
  'frequency',
  'startDate',
  'endDate',
  'lender',
  'loanType',
  'principal',
  'outstanding',
  'annualRate',
  'emi',
  'note',
  'notes',
  'status',
  'comments',
];

const TEMPLATE_ROWS: Array<Record<string, string>> = [
  {
    recordType: 'category',
    name: 'Groceries',
    monthlyBudget: '25000',
    color: '#1f7a8c',
  },
  {
    recordType: 'income',
    source: 'Salary',
    amount: '150000',
    cadence: 'monthly',
    month: '2026-06',
    notes: 'Primary income',
  },
  {
    recordType: 'expense',
    name: 'Supermarket',
    categoryName: 'Groceries',
    amount: '4200',
    month: '2026-06',
    date: '2026-06-05',
    type: 'one-time',
    note: 'Monthly groceries',
  },
  {
    recordType: 'recurring_expense',
    name: 'Rent',
    categoryName: 'Housing',
    amount: '45000',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
  },
  {
    recordType: 'investment',
    name: 'Index SIP',
    amount: '20000',
    frequency: 'recurring',
    date: '2026-06-01',
    startDate: '2026-06-01',
    notes: 'Monthly index fund',
  },
  {
    recordType: 'loan',
    lender: 'Bank',
    loanType: 'Home loan',
    principal: '4000000',
    outstanding: '3200000',
    annualRate: '8.7',
    emi: '38000',
    startDate: '2024-01-01',
    endDate: '2036-12-31',
    notes: 'Existing EMI',
  },
];

const RECORD_TYPES = new Set<ImportRecordType>([
  'category',
  'income',
  'expense',
  'recurring_expense',
  'investment',
  'loan',
]);
const CADENCES = new Set(['monthly', 'annual', 'variable']);
const EXPENSE_TYPES = new Set(['recurring', 'one-time']);
const FREQUENCIES = new Set(['recurring', 'one-time']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function createBudgetImportTemplateCsv(): string {
  return toCsv(TEMPLATE_HEADERS, TEMPLATE_ROWS);
}

export function parseBudgetImportCsv(
  text: string,
  existingCategories: BudgetCategory[],
): BudgetImportParseResult {
  const parsed = parseCsv(text);
  const inputHeaders = parsed.headers.filter(
    (header) => header !== 'status' && header !== 'comments',
  );
  const outputHeaders = [...inputHeaders, 'status', 'comments'];

  if (!inputHeaders.length) {
    return {
      headers: outputHeaders,
      rows: [
        {
          rowNumber: 1,
          values: {},
          status: 'error',
          comments: ['File is empty or does not contain a header row.'],
        },
      ],
    };
  }

  const workingRows = parsed.rows.map<BudgetImportRow>((row) => ({
    rowNumber: row.rowNumber,
    values: row.values,
    status: 'pending',
    comments: [],
  }));

  const categoryNameToId = new Map(
    existingCategories.map((category) => [normalizeKey(category.name), category.id] as const),
  );

  for (const row of workingRows) {
    const recordType = parseRecordType(row);
    if (recordType === 'category') {
      validateCategory(row, categoryNameToId);
      if (!row.comments.length) {
        const category = row.record as BudgetCategory;
        categoryNameToId.set(normalizeKey(category.name), category.id);
      }
    }
  }

  for (const row of workingRows) {
    if (row.recordType === 'category') {
      continue;
    }

    const recordType = row.recordType ?? parseRecordType(row);
    switch (recordType) {
      case 'income':
        validateIncome(row);
        break;
      case 'expense':
        validateExpense(row, categoryNameToId);
        break;
      case 'recurring_expense':
        validateTemplate(row, categoryNameToId);
        break;
      case 'investment':
        validateInvestment(row);
        break;
      case 'loan':
        validateLoan(row);
        break;
      default:
        break;
    }
  }

  for (const row of workingRows) {
    if (row.status === 'pending' && row.comments.length) {
      row.status = 'error';
    }
  }

  return { headers: outputHeaders, rows: workingRows };
}

export function buildProcessedImportCsv(headers: string[], rows: BudgetImportRow[]): string {
  const outputHeaders = [
    ...headers.filter((header) => header !== 'status' && header !== 'comments'),
    'status',
    'comments',
  ];
  const outputRows = rows.map((row) => ({
    ...row.values,
    status: row.status,
    comments: row.comments.join('; '),
  }));

  return toCsv(outputHeaders, outputRows);
}

export function summarizeImportRows(rows: BudgetImportRow[]): BudgetImportSummary {
  return rows.reduce(
    (summary, row) => ({
      total: summary.total + 1,
      success: summary.success + (row.status === 'success' ? 1 : 0),
      error: summary.error + (row.status === 'error' ? 1 : 0),
    }),
    { total: 0, success: 0, error: 0 },
  );
}

function validateCategory(row: BudgetImportRow, categoryNameToId: Map<string, string>): void {
  const name = required(row, 'name');
  const monthlyBudget = numberField(row, 'monthlyBudget');
  const color = optional(row, 'color') || '#1f7a8c';

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'categories';
  row.record = {
    id: categoryNameToId.get(normalizeKey(name)) ?? createImportId('category'),
    name,
    monthlyBudget,
    color,
  } satisfies BudgetCategory;
}

function validateIncome(row: BudgetImportRow): void {
  const source = required(row, 'source');
  const amount = numberField(row, 'amount');
  const cadence = enumField(row, 'cadence', CADENCES);
  const month = optionalMonth(row, 'month');
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'incomes';
  row.record = {
    id: createImportId('income'),
    source,
    amount,
    cadence: cadence as IncomeSource['cadence'],
    notes: optional(row, 'notes'),
    month,
    createdDate: todayDate(),
    startDate,
    endDate,
  } satisfies IncomeSource;
}

function validateExpense(row: BudgetImportRow, categoryNameToId: Map<string, string>): void {
  const name = required(row, 'name');
  const amount = numberField(row, 'amount');
  const type = enumField(row, 'type', EXPENSE_TYPES);
  const month = optionalMonth(row, 'month');
  const date = optionalDate(row, 'date');
  const categoryId = categoryIdField(row, categoryNameToId);

  if (!month && !date) {
    row.comments.push('Either month or date is required.');
  }

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'expenses';
  row.record = {
    id: createImportId('expense'),
    month: month || date!.slice(0, 7),
    date: date || `${month}-01`,
    name,
    categoryId,
    amount,
    type: type as ExpenseEntry['type'],
    note: optional(row, 'note') || optional(row, 'notes'),
  } satisfies ExpenseEntry;
}

function validateTemplate(row: BudgetImportRow, categoryNameToId: Map<string, string>): void {
  const name = required(row, 'name');
  const amount = numberField(row, 'amount');
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');
  const categoryId = categoryIdField(row, categoryNameToId);

  if (!startDate) {
    row.comments.push('startDate is required for recurring_expense rows.');
  }

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'templates';
  row.record = {
    id: createImportId('fixed'),
    name,
    categoryId,
    amount,
    type: 'recurring',
    createdDate: todayDate(),
    startDate,
    endDate,
  } satisfies ExpenseTemplate;
}

function validateInvestment(row: BudgetImportRow): void {
  const name = required(row, 'name');
  const amount = numberField(row, 'amount');
  const frequency = enumField(row, 'frequency', FREQUENCIES);
  const date = optionalDate(row, 'date');
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');

  if (!date && !startDate) {
    row.comments.push('Either date or startDate is required for investment rows.');
  }

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'investments';
  row.record = {
    id: createImportId('investment'),
    name,
    amount,
    frequency: frequency as InvestmentEntry['frequency'],
    date,
    startDate,
    endDate,
    notes: optional(row, 'notes'),
    createdDate: todayDate(),
  } satisfies InvestmentEntry;
}

function validateLoan(row: BudgetImportRow): void {
  const lender = required(row, 'lender');
  const loanType = required(row, 'loanType');
  const principal = numberField(row, 'principal');
  const outstanding = numberField(row, 'outstanding');
  const annualRate = numberField(row, 'annualRate');
  const emi = numberField(row, 'emi');
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');

  if (!startDate) {
    row.comments.push('startDate is required.');
  }

  if (!endDate) {
    row.comments.push('endDate is required.');
  }

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'loans';
  row.record = {
    id: createImportId('loan'),
    lender,
    loanType,
    principal,
    outstanding,
    annualRate,
    emi,
    startDate: startDate!,
    endDate: endDate!,
    notes: optional(row, 'notes'),
  } satisfies Loan;
}

function parseRecordType(row: BudgetImportRow): ImportRecordType | undefined {
  const rawType = value(row, 'recordType').toLowerCase();
  if (!rawType) {
    row.comments.push('recordType is required.');
    return undefined;
  }

  if (!RECORD_TYPES.has(rawType as ImportRecordType)) {
    row.comments.push(`recordType must be one of: ${Array.from(RECORD_TYPES).join(', ')}.`);
    return undefined;
  }

  row.recordType = rawType as ImportRecordType;
  return row.recordType;
}

function required(row: BudgetImportRow, field: string): string {
  const fieldValue = value(row, field);
  if (!fieldValue) {
    row.comments.push(`${field} is required.`);
  }

  return fieldValue;
}

function optional(row: BudgetImportRow, field: string): string {
  return value(row, field);
}

function numberField(row: BudgetImportRow, field: string): number {
  const fieldValue = required(row, field);
  const parsed = Number(fieldValue.replace(/,/g, ''));

  if (!fieldValue || !Number.isFinite(parsed)) {
    row.comments.push(`${field} must be a number.`);
    return 0;
  }

  if (parsed < 0) {
    row.comments.push(`${field} must be zero or greater.`);
  }

  return parsed;
}

function enumField(row: BudgetImportRow, field: string, allowed: Set<string>): string {
  const fieldValue = required(row, field).toLowerCase();
  if (fieldValue && !allowed.has(fieldValue)) {
    row.comments.push(`${field} must be one of: ${Array.from(allowed).join(', ')}.`);
  }

  return fieldValue;
}

function optionalDate(row: BudgetImportRow, field: string): string | undefined {
  const fieldValue = optional(row, field);
  if (!fieldValue) {
    return undefined;
  }

  if (!DATE_PATTERN.test(fieldValue) || Number.isNaN(Date.parse(`${fieldValue}T00:00:00`))) {
    row.comments.push(`${field} must be YYYY-MM-DD.`);
    return undefined;
  }

  return fieldValue;
}

function optionalMonth(row: BudgetImportRow, field: string): string | undefined {
  const fieldValue = optional(row, field);
  if (!fieldValue) {
    return undefined;
  }

  if (!MONTH_PATTERN.test(fieldValue)) {
    row.comments.push(`${field} must be YYYY-MM.`);
    return undefined;
  }

  return fieldValue;
}

function categoryIdField(row: BudgetImportRow, categoryNameToId: Map<string, string>): string {
  const categoryName = required(row, 'categoryName');
  const categoryId = categoryNameToId.get(normalizeKey(categoryName));

  if (!categoryId) {
    row.comments.push(
      `categoryName "${categoryName}" was not found in saved or imported categories.`,
    );
    return '';
  }

  return categoryId;
}

function value(row: BudgetImportRow, field: string): string {
  const normalizedField = normalizeHeader(field);
  const matchingKey = Object.keys(row.values).find(
    (key) => normalizeHeader(key) === normalizedField,
  );
  return matchingKey ? row.values[matchingKey].trim() : '';
}

function parseCsv(text: string): {
  headers: string[];
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
} {
  const records = readCsvRecords(text.replace(/^\uFEFF/, ''));
  const headers = (records.shift() ?? []).map((header) => header.trim()).filter(Boolean);

  return {
    headers,
    rows: records
      .map((record, index) => ({
        rowNumber: index + 2,
        values: Object.fromEntries(
          headers.map((header, headerIndex) => [header, record[headerIndex]?.trim() ?? '']),
        ),
      }))
      .filter((row) => Object.values(row.values).some((fieldValue) => fieldValue.trim())),
  };
}

function readCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      record.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field || record.length) {
    record.push(field);
    records.push(record);
  }

  return records;
}

function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
  return [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvField(row[header] ?? '')).join(',')),
  ].join('\n');
}

function escapeCsvField(fieldValue: string): string {
  if (!/[",\n\r]/.test(fieldValue)) {
    return fieldValue;
  }

  return `"${fieldValue.replace(/"/g, '""')}"`;
}

function normalizeHeader(valueToNormalize: string): string {
  return valueToNormalize.replace(/[\s_-]/g, '').toLowerCase();
}

function normalizeKey(valueToNormalize: string): string {
  return valueToNormalize.trim().toLowerCase();
}

function createImportId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}
