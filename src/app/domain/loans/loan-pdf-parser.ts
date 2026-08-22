import type { LoanPolicyCheckpoint } from './loan-policy-matcher';

export interface ParsedLoanScheduleRow {
  installmentNumber: number;
  dueDate: string;
  openingPrincipal: number;
  installmentAmount: number;
  principalAmount: number;
  interestAmount: number;
  closingPrincipal: number;
  annualRate: number;
}

export interface ParsedLoanPartPayment {
  effectiveDate: string;
  amount: number;
}

export interface ParsedLoanPdf {
  lender?: string;
  loanType?: string;
  accountReferenceLastFour?: string;
  sanctionedAmount?: number;
  disbursedAmount?: number;
  disbursementDate?: string;
  firstEmiDate?: string;
  contractualMaturityDate?: string;
  tenureMonths?: number;
  initialEmi?: number;
  initialAnnualRate?: number;
  firstPeriodInterestAmount?: number;
  rows: ParsedLoanScheduleRow[];
  checkpoints: LoanPolicyCheckpoint[];
  partPayments: ParsedLoanPartPayment[];
  warnings: string[];
}

const AMOUNT = String.raw`[0-9][0-9,]*(?:\.[0-9]{1,2})?`;
const DATE = String.raw`(?:[0-3]?\d[\/-][01]?\d[\/-]\d{4}|\d{4}-[01]\d-[0-3]\d)`;
const LENDERS = [
  'Axis Bank',
  'HDFC Bank',
  'ICICI Bank',
  'IndusInd Bank',
  'IDFC FIRST Bank',
  'Kotak Mahindra Bank',
  'State Bank of India',
  'Punjab National Bank',
  'Bank of Baroda',
  'Indian Overseas Bank',
  'Indian Bank',
  'Yes Bank',
  'HSBC',
  'Bank of America',
] as const;

function numberValue(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function labelAmount(text: string, labels: readonly string[]): number | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*:?\\s*(?:Rs\\.?|INR|₹)?\\s*(${AMOUNT})`, 'i'));
    const value = numberValue(match?.[1]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function labelText(text: string, label: string): string | undefined {
  return text.match(new RegExp(`${label}\\s*:?\\s*([^\\n|]+)`, 'i'))?.[1]?.trim();
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
    ? undefined
    : result;
}

function lenderName(text: string): string | undefined {
  const normalized = text.toLocaleLowerCase('en-IN');
  const known = LENDERS.find((lender) => normalized.includes(lender.toLocaleLowerCase('en-IN')));
  if (known) return known;
  const generic = text.match(/\b([A-Z][A-Z &.-]{2,45}(?:BANK|FINANCE|FINANCIAL))\b/);
  return generic?.[1]
    ?.toLocaleLowerCase('en-IN')
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('en-IN'));
}

function parseRows(text: string): ParsedLoanScheduleRow[] {
  const rowPattern = new RegExp(
    `(?:^|\\n)\\s*(\\d{1,4})\\s+(${DATE})\\s+(${AMOUNT})\\s+(${AMOUNT})\\s+(${AMOUNT})\\s+(${AMOUNT})\\s+(${AMOUNT})\\s+(${AMOUNT})(?=\\s|$)`,
    'g',
  );
  const rows: ParsedLoanScheduleRow[] = [];
  for (const match of text.matchAll(rowPattern)) {
    const dueDate = isoDate(match[2]);
    const values = match.slice(3, 9).map(numberValue);
    if (!dueDate || values.some((value) => value === undefined)) continue;
    rows.push({
      installmentNumber: Number(match[1]),
      dueDate,
      openingPrincipal: values[0]!,
      installmentAmount: values[1]!,
      principalAmount: values[2]!,
      interestAmount: values[3]!,
      closingPrincipal: values[4]!,
      annualRate: values[5]!,
    });
  }
  const unique = new Map(rows.map((row) => [`${row.installmentNumber}:${row.dueDate}`, row]));
  return [...unique.values()].sort(
    (left, right) =>
      left.dueDate.localeCompare(right.dueDate) || left.installmentNumber - right.installmentNumber,
  );
}

function isPartPayment(row: ParsedLoanScheduleRow): boolean {
  return (
    row.interestAmount === 0 &&
    row.annualRate === 0 &&
    Math.abs(row.installmentAmount - row.principalAmount) <= 0.01 &&
    Math.abs(row.openingPrincipal - row.principalAmount - row.closingPrincipal) <= 0.01
  );
}

export function parseLoanRepaymentScheduleText(pageTexts: readonly string[]): ParsedLoanPdf {
  const text = pageTexts.join('\n').replaceAll('\u00a0', ' ');
  const rows = parseRows(text);
  const emiRows = rows.filter((row) => !isPartPayment(row) && row.interestAmount >= 0);
  const firstRow = emiRows[0];
  const lastRow = emiRows.at(-1);
  const agreement = labelText(text, 'Agreement Number');
  const disbursementDate = isoDate(
    text.match(new RegExp(`(?:Disbursement|Disbursal) Date\\s*:?\\s*(${DATE})`, 'i'))?.[1],
  );
  const tenure = numberValue(labelText(text, 'Tenure \\(Months\\)'));
  const loanType =
    text.match(/Loan Type\s*:\s*(.+?)(?=\s+Tenure\s*\(Months\)|\n|$)/i)?.[1]?.trim() ??
    labelText(text, 'Loan Type');
  const warnings: string[] = [];
  if (!rows.length) warnings.push('No repayment schedule rows were found.');
  if (!disbursementDate) {
    warnings.push('Disbursement date was not present in the PDF and still needs to be entered.');
  }
  if (!firstRow) warnings.push('First EMI terms could not be identified.');

  return {
    lender: lenderName(text),
    loanType,
    accountReferenceLastFour: agreement?.replaceAll(/\s/g, '').slice(-4) || undefined,
    sanctionedAmount: labelAmount(text, ['Loan Sanctioned', 'Sanctioned Amount']),
    disbursedAmount: labelAmount(text, [
      'Loan Amount Disbursed',
      'Disbursed Amount',
      'Loan Amount',
    ]),
    disbursementDate,
    firstEmiDate: firstRow?.dueDate,
    contractualMaturityDate: lastRow?.dueDate,
    tenureMonths: tenure,
    initialEmi: firstRow?.installmentAmount,
    initialAnnualRate: firstRow?.annualRate,
    firstPeriodInterestAmount: firstRow?.interestAmount,
    rows,
    checkpoints: emiRows.map((row) => ({
      dueDate: row.dueDate,
      interestAmount: row.interestAmount,
      closingPrincipal: row.closingPrincipal,
    })),
    partPayments: rows.filter(isPartPayment).map((row) => ({
      effectiveDate: row.dueDate,
      amount: row.principalAmount,
    })),
    warnings,
  };
}

type PdfJsModule = typeof import('pdfjs-dist');

export async function extractLoanRepaymentSchedulePdf(
  file: File,
  loadPdfJs: () => Promise<PdfJsModule> = () => import('pdfjs-dist'),
): Promise<ParsedLoanPdf> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Choose a PDF repayment schedule.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('The PDF must be 20 MB or smaller.');
  }
  const pdfjs = await loadPdfJs();
  if (typeof Worker !== 'undefined') {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  }
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
          .join('')
          .replaceAll(/ +\n/g, '\n')
          .replaceAll(/ {2,}/g, ' '),
      );
    }
    return parseLoanRepaymentScheduleText(pages);
  } finally {
    await loadingTask.destroy();
  }
}
