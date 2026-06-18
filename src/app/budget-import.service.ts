import type {
  BudgetCategory,
  BudgetDataMap,
  CategoryType,
  ExpenseEntry,
  ExpenseTemplate,
  IncomeSource,
  InvestmentEntry,
  Loan,
  WorkspaceMember,
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

type SheetDefinition = {
  collectionName: keyof BudgetDataMap;
  headers: string[];
  sample: Record<string, string>;
};

const SHEETS: Record<ImportRecordType, SheetDefinition> = {
  category: {
    collectionName: 'categories',
    headers: ['name', 'type', 'monthlyBudget', 'color'],
    sample: {
      name: 'Groceries',
      type: 'Expenses',
      monthlyBudget: '25000',
      color: '#1f7a8c',
    },
  },
  income: {
    collectionName: 'incomes',
    headers: [
      'source',
      'amount',
      'categoryName',
      'cadence',
      'month',
      'startDate',
      'endDate',
      'notes',
      'memberEmail',
    ],
    sample: {
      source: 'Salary',
      amount: '150000',
      categoryName: 'Salary',
      cadence: 'monthly',
      month: '2026-06',
      notes: 'Primary income',
      memberEmail: '',
    },
  },
  expense: {
    collectionName: 'expenses',
    headers: ['name', 'categoryName', 'amount', 'month', 'date', 'note', 'memberEmail'],
    sample: {
      name: 'Supermarket',
      categoryName: 'Groceries',
      amount: '4200',
      month: '2026-06',
      date: '2026-06-05',
      note: 'Monthly groceries',
      memberEmail: '',
    },
  },
  recurring_expense: {
    collectionName: 'templates',
    headers: ['name', 'categoryName', 'amount', 'frequency', 'startDate', 'endDate', 'memberEmail'],
    sample: {
      name: 'Rent',
      categoryName: 'Housing',
      amount: '45000',
      frequency: 'monthly',
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      memberEmail: '',
    },
  },
  investment: {
    collectionName: 'investments',
    headers: [
      'name',
      'amount',
      'categoryName',
      'frequency',
      'date',
      'startDate',
      'endDate',
      'notes',
      'memberEmail',
    ],
    sample: {
      name: 'Index SIP',
      amount: '20000',
      categoryName: 'Mutual Funds',
      frequency: 'monthly',
      date: '2026-06-01',
      startDate: '2026-06-01',
      notes: 'Monthly index fund',
      memberEmail: '',
    },
  },
  loan: {
    collectionName: 'loans',
    headers: [
      'lender',
      'loanType',
      'principal',
      'outstanding',
      'annualRate',
      'emi',
      'startDate',
      'endDate',
      'notes',
      'memberEmail',
    ],
    sample: {
      lender: 'Bank',
      loanType: 'Home loan',
      principal: '4000000',
      outstanding: '3200000',
      annualRate: '8.7',
      emi: '38000',
      startDate: '2024-01-01',
      endDate: '2036-12-31',
      notes: 'Existing EMI',
      memberEmail: '',
    },
  },
};

const RECORD_TYPES = new Set<ImportRecordType>(Object.keys(SHEETS) as ImportRecordType[]);
const CADENCES = new Set([
  'daily',
  'weekly',
  'bi-weekly',
  'monthly',
  'quarterly',
  'half-yearly',
  'annual',
  'one-time',
]);
const CATEGORY_TYPES = new Set<CategoryType>(['Income', 'Investments', 'Expenses']);
const INVESTMENT_FREQUENCIES = new Set([
  'weekly',
  'monthly',
  'quarterly',
  'half-yearly',
  'annual',
  'one-time',
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const STATUS_HEADERS = ['status', 'comments'];
const MASTER_CATEGORIES_SHEET = 'master_categories';

export async function createBudgetImportTemplateWorkbook(
  existingCategories: BudgetCategory[] = [],
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  const masterRows = existingCategories
    .map((category) => ({
      name: category.name,
      type: category.type ?? 'Expenses',
      monthlyBudget: category.monthlyBudget,
      color: category.color,
    }))
    .sort((left, right) =>
      `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`),
    );
  const masterWorksheet = XLSX.utils.json_to_sheet(masterRows, {
    header: ['name', 'type', 'monthlyBudget', 'color'],
  });
  XLSX.utils.book_append_sheet(workbook, masterWorksheet, MASTER_CATEGORIES_SHEET);

  for (const [recordType, definition] of Object.entries(SHEETS) as Array<
    [ImportRecordType, SheetDefinition]
  >) {
    const worksheet = XLSX.utils.json_to_sheet([definition.sample], {
      header: definition.headers,
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, recordType);
  }

  return workbookBlob(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

export function createBudgetImportTemplateCsv(): string {
  const headers = [
    'recordType',
    ...Array.from(new Set(Object.values(SHEETS).flatMap((sheet) => sheet.headers))),
    ...STATUS_HEADERS,
  ];
  const rows = Object.entries(SHEETS).map(([recordType, definition]) => ({
    recordType,
    ...definition.sample,
  }));

  return toCsv(headers, rows);
}

export async function parseBudgetImportFile(
  file: File,
  existingCategories: BudgetCategory[],
  members: WorkspaceMember[] = [],
): Promise<BudgetImportParseResult> {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.csv')) {
    return parseBudgetImportCsv(await file.text(), existingCategories, members);
  }

  if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
    return errorResult(file.name, 'Only CSV, XLS, and XLSX import files are supported.');
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const rows: BudgetImportRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.trim().toLowerCase() === MASTER_CATEGORIES_SHEET) {
      continue;
    }

    const recordType = recordTypeFromSheetName(sheetName);
    if (!recordType) {
      rows.push({
        rowNumber: 1,
        values: { sheet: sheetName },
        status: 'error',
        comments: [
          `Sheet "${sheetName}" must be named one of: ${Array.from(RECORD_TYPES).join(', ')}.`,
        ],
      });
      continue;
    }

    const worksheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
    });

    for (const [index, values] of records.entries()) {
      const normalizedValues = Object.fromEntries(
        Object.entries(values).map(([key, entryValue]) => [key, normalizeCellValue(entryValue)]),
      );
      rows.push({
        rowNumber: index + 2,
        values: normalizedValues,
        status: importedSuccessStatus(normalizedValues) ? 'success' : 'pending',
        comments: importedSuccessStatus(normalizedValues) ? ['Previously imported; skipped.'] : [],
        recordType,
      });
    }
  }

  return validateRows(rows, existingCategories, members);
}

export function parseBudgetImportCsv(
  text: string,
  existingCategories: BudgetCategory[],
  members: WorkspaceMember[] = [],
): BudgetImportParseResult {
  const parsed = parseCsv(text);
  if (!parsed.headers.length) {
    return errorResult('CSV', 'File is empty or does not contain a header row.');
  }

  const rows = parsed.rows.map<BudgetImportRow>((row) => {
    const recordType = parseRecordTypeValue(row.values['recordType']);
    const alreadySuccess = importedSuccessStatus(row.values);
    return {
      rowNumber: row.rowNumber,
      values: row.values,
      status: alreadySuccess ? 'success' : 'pending',
      comments: alreadySuccess ? ['Previously imported; skipped.'] : [],
      recordType,
    };
  });

  return validateRows(rows, existingCategories, members);
}

export async function buildProcessedImportWorkbook(rows: BudgetImportRow[]): Promise<Blob> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  for (const recordType of Object.keys(SHEETS) as ImportRecordType[]) {
    const definition = SHEETS[recordType];
    const sheetRows = rows
      .filter((row) => row.recordType === recordType)
      .map((row) => ({
        ...row.values,
        status: row.status === 'pending' ? 'success' : row.status,
        comments: row.comments.join('; '),
      }));
    const worksheet = XLSX.utils.json_to_sheet(sheetRows, {
      header: [...definition.headers, ...STATUS_HEADERS],
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, recordType);
  }

  const unknownRows = rows.filter((row) => !row.recordType);
  if (unknownRows.length) {
    const worksheet = XLSX.utils.json_to_sheet(
      unknownRows.map((row) => ({
        ...row.values,
        status: row.status,
        comments: row.comments.join('; '),
      })),
    );
    XLSX.utils.book_append_sheet(workbook, worksheet, 'errors');
  }

  return workbookBlob(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
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

function validateRows(
  rows: BudgetImportRow[],
  existingCategories: BudgetCategory[],
  members: WorkspaceMember[],
): BudgetImportParseResult {
  const categoryNameToId = new Map(
    existingCategories.map(
      (category) => [categoryKey(category.name, category.type ?? 'Expenses'), category.id] as const,
    ),
  );
  const memberEmails = new Set(
    members.filter((member) => !member.archivedDate).map((member) => member.email),
  );

  for (const row of rows) {
    if (row.status === 'success') {
      continue;
    }

    if (!row.recordType) {
      row.comments.push('recordType is required or sheet name is invalid.');
      continue;
    }

    if (row.recordType === 'category') {
      validateCategory(row, categoryNameToId);
      if (!row.comments.length) {
        const category = row.record as BudgetCategory;
        categoryNameToId.set(categoryKey(category.name, category.type ?? 'Expenses'), category.id);
      }
    }
  }

  for (const row of rows) {
    if (row.status === 'success' || row.recordType === 'category') {
      continue;
    }

    switch (row.recordType) {
      case 'income':
        validateIncome(row, categoryNameToId, memberEmails);
        break;
      case 'expense':
        validateExpense(row, categoryNameToId, memberEmails);
        break;
      case 'recurring_expense':
        validateTemplate(row, categoryNameToId, memberEmails);
        break;
      case 'investment':
        validateInvestment(row, categoryNameToId, memberEmails);
        break;
      case 'loan':
        validateLoan(row, memberEmails);
        break;
      default:
        break;
    }
  }

  for (const row of rows) {
    if (row.status === 'pending' && row.comments.length) {
      row.status = 'error';
    }
  }

  return { headers: [], rows };
}

function validateCategory(row: BudgetImportRow, categoryNameToId: Map<string, string>): void {
  const name = required(row, 'name');
  const type = categoryTypeField(row);
  const monthlyBudget = numberField(row, 'monthlyBudget');
  const color = optional(row, 'color') || '#1f7a8c';

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'categories';
  row.record = {
    id: categoryNameToId.get(categoryKey(name, type)) ?? createImportId('category'),
    name,
    type,
    monthlyBudget,
    color,
  } satisfies BudgetCategory;
}

function validateIncome(
  row: BudgetImportRow,
  categoryNameToId: Map<string, string>,
  memberEmails: Set<string>,
): void {
  const source = required(row, 'source');
  const amount = numberField(row, 'amount');
  const cadence = enumField(row, 'cadence', CADENCES);
  const month = optionalMonth(row, 'month') ?? dateMonth(optionalDate(row, 'month'));
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');
  const categoryId = optionalCategoryIdField(row, categoryNameToId, 'Income');
  const memberEmail = optionalMemberEmailField(row, memberEmails);

  if (row.comments.length) {
    return;
  }

  row.collectionName = 'incomes';
  row.record = {
    id: createImportId('income'),
    source,
    amount,
    categoryId,
    cadence: cadence as IncomeSource['cadence'],
    notes: optional(row, 'notes'),
    month,
    createdDate: todayDate(),
    startDate,
    endDate,
    memberEmail,
  } satisfies IncomeSource;
}

function validateExpense(
  row: BudgetImportRow,
  categoryNameToId: Map<string, string>,
  memberEmails: Set<string>,
): void {
  const name = required(row, 'name');
  const amount = numberField(row, 'amount');
  const month = optionalMonth(row, 'month');
  const date = optionalDate(row, 'date');
  const categoryId = categoryIdField(row, categoryNameToId, 'Expenses');
  const memberEmail = optionalMemberEmailField(row, memberEmails);

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
    type: 'one-time',
    note: optional(row, 'note') || optional(row, 'notes'),
    memberEmail,
  } satisfies ExpenseEntry;
}

function validateTemplate(
  row: BudgetImportRow,
  categoryNameToId: Map<string, string>,
  memberEmails: Set<string>,
): void {
  const name = required(row, 'name');
  const amount = numberField(row, 'amount');
  const frequency = optional(row, 'frequency')
    ? enumField(row, 'frequency', INVESTMENT_FREQUENCIES)
    : 'monthly';
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');
  const categoryId = categoryIdField(row, categoryNameToId, 'Expenses');
  const memberEmail = optionalMemberEmailField(row, memberEmails);

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
    frequency: frequency as ExpenseTemplate['frequency'],
    createdDate: todayDate(),
    startDate,
    endDate,
    memberEmail,
  } satisfies ExpenseTemplate;
}

function validateInvestment(
  row: BudgetImportRow,
  categoryNameToId: Map<string, string>,
  memberEmails: Set<string>,
): void {
  const name = required(row, 'name');
  const amount = numberField(row, 'amount');
  const frequency = enumField(row, 'frequency', INVESTMENT_FREQUENCIES);
  const date = optionalDate(row, 'date');
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');
  const categoryId = optionalCategoryIdField(row, categoryNameToId, 'Investments');
  const memberEmail = optionalMemberEmailField(row, memberEmails);

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
    categoryId,
    frequency: frequency as InvestmentEntry['frequency'],
    date,
    startDate,
    endDate,
    notes: optional(row, 'notes'),
    createdDate: todayDate(),
    memberEmail,
  } satisfies InvestmentEntry;
}

function validateLoan(row: BudgetImportRow, memberEmails: Set<string>): void {
  const lender = required(row, 'lender');
  const loanType = required(row, 'loanType');
  const principal = numberField(row, 'principal');
  const outstanding = numberField(row, 'outstanding');
  const annualRate = numberField(row, 'annualRate');
  const emi = numberField(row, 'emi');
  const startDate = optionalDate(row, 'startDate');
  const endDate = optionalDate(row, 'endDate');
  const memberEmail = optionalMemberEmailField(row, memberEmails);

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
    memberEmail,
  } satisfies Loan;
}

function categoryTypeField(row: BudgetImportRow): CategoryType {
  const fieldValue = optional(row, 'type') || 'Expenses';
  const match = Array.from(CATEGORY_TYPES).find(
    (categoryType) => normalizeKey(categoryType) === normalizeKey(fieldValue),
  );

  if (!match) {
    row.comments.push(`type must be one of: ${Array.from(CATEGORY_TYPES).join(', ')}.`);
    return 'Expenses';
  }

  return match;
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

  const dateValue = normalizeDateValue(fieldValue);
  if (!dateValue) {
    row.comments.push(`${field} must be YYYY-MM-DD.`);
    return undefined;
  }

  return dateValue;
}

function optionalMonth(row: BudgetImportRow, field: string): string | undefined {
  const fieldValue = optional(row, field);
  if (!fieldValue) {
    return undefined;
  }

  if (!MONTH_PATTERN.test(fieldValue)) {
    return undefined;
  }

  return fieldValue;
}

function categoryIdField(
  row: BudgetImportRow,
  categoryNameToId: Map<string, string>,
  type: CategoryType,
): string {
  const categoryName = required(row, 'categoryName');
  const categoryId = categoryNameToId.get(categoryKey(categoryName, type));

  if (!categoryId) {
    row.comments.push(
      `categoryName "${categoryName}" was not found in saved or imported ${type} categories.`,
    );
    return '';
  }

  return categoryId;
}

function optionalCategoryIdField(
  row: BudgetImportRow,
  categoryNameToId: Map<string, string>,
  type: CategoryType,
): string | undefined {
  if (!optional(row, 'categoryName')) {
    return undefined;
  }

  return categoryIdField(row, categoryNameToId, type);
}

function optionalMemberEmailField(
  row: BudgetImportRow,
  memberEmails: Set<string>,
): string | undefined {
  const memberEmail = optional(row, 'memberEmail').trim().toLowerCase();
  if (!memberEmail) {
    return undefined;
  }

  if (memberEmails.size && !memberEmails.has(memberEmail)) {
    row.comments.push(`memberEmail "${memberEmail}" is not an active workspace member.`);
    return undefined;
  }

  return memberEmail;
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

function categoryKey(name: string, type: CategoryType): string {
  return `${normalizeKey(type)}:${normalizeKey(name)}`;
}

function createImportId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRecordTypeValue(rawType: string | undefined): ImportRecordType | undefined {
  const normalizedType = (rawType ?? '').trim().toLowerCase();
  return RECORD_TYPES.has(normalizedType as ImportRecordType)
    ? (normalizedType as ImportRecordType)
    : undefined;
}

function recordTypeFromSheetName(sheetName: string): ImportRecordType | undefined {
  return parseRecordTypeValue(sheetName.replace(/\s+/g, '_'));
}

function importedSuccessStatus(values: Record<string, string>): boolean {
  return normalizeKey(values['status'] ?? '') === 'success';
}

function errorResult(fileName: string, message: string): BudgetImportParseResult {
  return {
    headers: ['file', 'status', 'comments'],
    rows: [
      {
        rowNumber: 1,
        values: { file: fileName },
        status: 'error',
        comments: [message],
      },
    ],
  };
}

function normalizeCellValue(valueToNormalize: unknown): string {
  if (valueToNormalize instanceof Date) {
    return valueToNormalize.toISOString().slice(0, 10);
  }

  return String(valueToNormalize ?? '').trim();
}

function normalizeDateValue(valueToNormalize: string): string | undefined {
  if (
    DATE_PATTERN.test(valueToNormalize) &&
    !Number.isNaN(Date.parse(`${valueToNormalize}T00:00:00`))
  ) {
    return valueToNormalize;
  }

  const parsed = new Date(valueToNormalize);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
}

function dateMonth(date?: string): string | undefined {
  return date?.slice(0, 7);
}

function workbookBlob(content: ArrayBuffer): Blob {
  return new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
