import { decimalString, investmentDecimal } from './investment-decimal';

export interface AmfiNavRecord {
  schemeCode: string;
  schemeName: string;
  isinGrowth?: string;
  isinReinvestment?: string;
  plan?: string;
  option?: string;
  nav: string;
  navDate: string;
  stale: boolean;
}

export interface NpsNavRecord {
  schemeCode: string;
  pfm?: string;
  schemeName: string;
  nav: string;
  navDate: string;
}

function normalizedHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function columnIndex(headers: readonly string[], candidates: readonly string[]): number {
  const normalized = headers.map(normalizedHeader);
  const exact = normalized.findIndex((header) => candidates.includes(header));
  return exact >= 0
    ? exact
    : normalized.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

function isoDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[-/]([A-Za-z]{3}|\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (!match) return trimmed;
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const month = /^\d+$/.test(match[2])
    ? Number(match[2])
    : months.indexOf(match[2].toLowerCase()) + 1;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export function parseAmfiNavFeed(
  text: string,
  asOfDate = new Date().toISOString().slice(0, 10),
): AmfiNavRecord[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerLine = lines.findIndex((line) => {
    const value = normalizedHeader(line);
    return value.includes('scheme code') && value.includes('net asset value');
  });
  if (headerLine < 0) throw new Error('AMFI_HEADER_NOT_FOUND');
  const headers = lines[headerLine].split(';');
  const schemeCode = columnIndex(headers, ['scheme code']);
  const schemeName = columnIndex(headers, ['scheme name']);
  const isinGrowth = columnIndex(headers, ['isin div payout', 'isin growth']);
  const isinReinvestment = columnIndex(headers, ['isin div reinvestment', 'isin reinvestment']);
  const plan = columnIndex(headers, ['plan']);
  const option = columnIndex(headers, ['option']);
  const nav = columnIndex(headers, ['net asset value', 'nav']);
  const date = columnIndex(headers, ['date']);
  if ([schemeCode, schemeName, nav, date].some((index) => index < 0))
    throw new Error('AMFI_REQUIRED_COLUMN_MISSING');
  const staleBefore = new Date(`${asOfDate}T00:00:00Z`);
  staleBefore.setUTCDate(staleBefore.getUTCDate() - 14);

  return lines.slice(headerLine + 1).flatMap((line) => {
    const cells = line.split(';').map((cell) => cell.trim());
    if (!/^\d+$/.test(cells[schemeCode] ?? '') || !cells[nav] || !cells[date]) return [];
    try {
      const navDate = isoDate(cells[date]);
      return [
        {
          schemeCode: cells[schemeCode],
          schemeName: cells[schemeName],
          isinGrowth: cells[isinGrowth] || undefined,
          isinReinvestment: cells[isinReinvestment] || undefined,
          plan: cells[plan] || undefined,
          option: cells[option] || undefined,
          nav: decimalString(investmentDecimal(cells[nav])),
          navDate,
          stale: new Date(`${navDate}T00:00:00Z`) < staleBefore,
        },
      ];
    } catch {
      return [];
    }
  });
}

export function parseNpsNavDump(text: string): NpsNavRecord[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const delimiter = lines.some((line) => line.includes('\t'))
    ? '\t'
    : lines.some((line) => line.includes(';'))
      ? ';'
      : ',';
  const headerLine = lines.findIndex(
    (line) => normalizedHeader(line).includes('scheme') && normalizedHeader(line).includes('nav'),
  );
  if (headerLine < 0) throw new Error('NPS_HEADER_NOT_FOUND');
  const headers = lines[headerLine].split(delimiter);
  const schemeCode = columnIndex(headers, ['scheme code', 'scheme id']);
  const schemeName = columnIndex(headers, ['scheme name', 'name']);
  const pfm = columnIndex(headers, ['pfm', 'pension fund']);
  const nav = columnIndex(headers, ['net asset value', 'nav']);
  const date = columnIndex(headers, ['nav date', 'date']);
  if ([schemeCode, schemeName, nav, date].some((index) => index < 0))
    throw new Error('NPS_REQUIRED_COLUMN_MISSING');
  return lines.slice(headerLine + 1).flatMap((line) => {
    const cells = line.split(delimiter).map((cell) => cell.trim());
    if (!cells[schemeCode] || !cells[nav]) return [];
    try {
      return [
        {
          schemeCode: cells[schemeCode],
          schemeName: cells[schemeName],
          pfm: cells[pfm] || undefined,
          nav: decimalString(investmentDecimal(cells[nav])),
          navDate: isoDate(cells[date]),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function mapUpstoxLtpResponse(payload: unknown): Map<string, string> {
  if (!payload || typeof payload !== 'object') throw new Error('UPSTOX_INVALID_RESPONSE');
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') throw new Error('UPSTOX_INVALID_RESPONSE');
  const prices = new Map<string, string>();
  for (const [responseKey, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const quote = raw as { instrument_token?: unknown; last_price?: unknown };
    if (typeof quote.last_price !== 'number') continue;
    const key =
      typeof quote.instrument_token === 'string'
        ? quote.instrument_token
        : responseKey.replace(':', '|');
    prices.set(key, decimalString(quote.last_price));
  }
  return prices;
}
