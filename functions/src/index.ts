import { gunzipSync } from 'node:zlib';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import readXlsxFile from 'read-excel-file/node';

if (!getApps().length) initializeApp();

const investmentMarketDataToken = defineSecret('INVESTMENT_MARKET_DATA_TOKEN');
const AMFI_NAV_URL = 'https://www.amfiindia.com/spages/NAVAll.txt';
const NPS_NAV_URL = 'https://npstrust.org.in/nav-report-excel';
const UPSTOX_LTP_URL = 'https://api.upstox.com/v3/market-quote/ltp';
const UPSTOX_INSTRUMENTS_URL =
  'https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz';

function externalFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(25_000) });
}

type JsonMap = Record<string, unknown>;
let upstoxInstrumentCache:
  { expiresAt: number; values: Array<Record<string, unknown>> } | undefined;

async function upstoxInstruments(): Promise<Array<Record<string, unknown>>> {
  if (upstoxInstrumentCache && upstoxInstrumentCache.expiresAt > Date.now()) {
    return upstoxInstrumentCache.values;
  }
  const upstream = await externalFetch(UPSTOX_INSTRUMENTS_URL);
  if (!upstream.ok) throw new Error('MARKET_DATA_UNAVAILABLE');
  const values = JSON.parse(
    gunzipSync(Buffer.from(await upstream.arrayBuffer())).toString('utf8'),
  ) as Array<Record<string, unknown>>;
  upstoxInstrumentCache = { expiresAt: Date.now() + 15 * 60_000, values };
  return values;
}

function cors(response: Parameters<Parameters<typeof onRequest>[0]>[1]): void {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function authenticatedUid(authorization: string | undefined): Promise<string> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw new Error('AUTH_REQUIRED');
  return (await getAuth().verifyIdToken(token)).uid;
}

async function assertWorkspaceMember(uid: string, workspaceId: unknown): Promise<string> {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('WORKSPACE_REQUIRED');
  const snapshot = await getFirestore().doc(`budgetWorkspaces/${workspaceId}`).get();
  const memberUids = snapshot.data()?.['memberUids'];
  if (!snapshot.exists || !Array.isArray(memberUids) || !memberUids.includes(uid))
    throw new Error('WORKSPACE_FORBIDDEN');
  return workspaceId;
}

function normalizedHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}
function headerIndex(headers: unknown[], candidates: string[]): number {
  const values = headers.map(normalizedHeader);
  const exact = values.findIndex((header) => candidates.includes(header));
  return exact >= 0
    ? exact
    : values.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}
function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = /^(\d{1,2})[-/]([A-Za-z]{3}|\d{1,2})[-/](\d{4})$/.exec(text);
  if (!match) return text;
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

function parseAmfi(
  text: string,
  wanted: Set<string>,
): Record<string, { nav: string; date: string }> {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerRow = lines.findIndex(
    (line) =>
      normalizedHeader(line).includes('scheme code') &&
      normalizedHeader(line).includes('net asset value'),
  );
  if (headerRow < 0) throw new Error('AMFI_INVALID_RESPONSE');
  const headers = lines[headerRow].split(';');
  const code = headerIndex(headers, ['scheme code']);
  const nav = headerIndex(headers, ['net asset value', 'nav']);
  const date = headerIndex(headers, ['date']);
  if ([code, nav, date].some((index) => index < 0)) throw new Error('AMFI_INVALID_RESPONSE');
  return Object.fromEntries(
    lines.slice(headerRow + 1).flatMap((line) => {
      const cells = line.split(';').map((cell) => cell.trim());
      return wanted.has(cells[code]) && Number(cells[nav]) > 0
        ? [[cells[code], { nav: cells[nav], date: isoDate(cells[date]) }]]
        : [];
    }),
  );
}

function parseNpsRows(
  rows: unknown[][],
  wanted: Set<string>,
): Record<string, { nav: string; date: string }> {
  const headerRow = rows.findIndex(
    (row) =>
      row.some((cell) => normalizedHeader(cell).includes('scheme')) &&
      row.some((cell) => normalizedHeader(cell).includes('nav')),
  );
  if (headerRow < 0) throw new Error('NPS_INVALID_RESPONSE');
  const headers = rows[headerRow];
  const code = headerIndex(headers, ['scheme code', 'scheme id']);
  const nav = headerIndex(headers, ['net asset value', 'nav']);
  const date = headerIndex(headers, ['nav date', 'date']);
  if ([code, nav, date].some((index) => index < 0)) throw new Error('NPS_INVALID_RESPONSE');
  return Object.fromEntries(
    rows.slice(headerRow + 1).flatMap((row) => {
      const schemeCode = String(row[code] ?? '').trim();
      const value = String(row[nav] ?? '').trim();
      return wanted.has(schemeCode) && Number(value) > 0
        ? [[schemeCode, { nav: value, date: isoDate(row[date]) }]]
        : [];
    }),
  );
}

async function stockQuotes(keys: string[]): Promise<JsonMap> {
  const accessToken = investmentMarketDataToken.value();
  if (!accessToken) throw new Error('MARKET_DATA_UNAVAILABLE');
  const url = new URL(UPSTOX_LTP_URL);
  url.searchParams.set('instrument_key', keys.join(','));
  const response = await externalFetch(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('MARKET_DATA_UNAVAILABLE');
  const payload = (await response.json()) as {
    data?: Record<string, { instrument_token?: string; last_price?: number }>;
  };
  const prices: Record<string, string> = {};
  for (const [responseKey, quote] of Object.entries(payload.data ?? {})) {
    if (typeof quote.last_price === 'number')
      prices[quote.instrument_token ?? responseKey.replace(':', '|')] = String(quote.last_price);
  }
  return { prices };
}

export const investmentProvider = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [investmentMarketDataToken],
  },
  async (request, response) => {
    cors(response);
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }
    try {
      const uid = await authenticatedUid(request.header('authorization'));
      await assertWorkspaceMember(uid, request.body?.workspaceId);
      const action = request.body?.action;
      if (action === 'stock-quotes') {
        const keys: string[] = Array.isArray(request.body?.instrumentKeys)
          ? (request.body.instrumentKeys as unknown[]).filter(
              (item: unknown): item is string => typeof item === 'string' && !!item,
            )
          : [];
        response.json(await stockQuotes([...new Set(keys)]));
        return;
      }
      if (action === 'stock-search') {
        const query = String(request.body?.query ?? '')
          .trim()
          .toLowerCase();
        if (query.length < 2) {
          response.json({ results: [] });
          return;
        }
        const values = await upstoxInstruments();
        const results = values
          .filter(
            (item) =>
              ['NSE_EQ', 'BSE_EQ'].includes(String(item['segment'])) &&
              [item['name'], item['trading_symbol'], item['isin']].some((value) =>
                String(value ?? '')
                  .toLowerCase()
                  .includes(query),
              ),
          )
          .slice(0, 20)
          .map((item) => ({
            name: item['name'],
            tradingSymbol: item['trading_symbol'],
            isin: item['isin'],
            exchange: item['exchange'],
            instrumentKey: item['instrument_key'],
          }));
        response.json({ results });
        return;
      }
      if (action === 'amfi-nav') {
        const wanted = new Set<string>(
          Array.isArray(request.body?.schemeCodes) ? request.body.schemeCodes.map(String) : [],
        );
        const upstream = await externalFetch(AMFI_NAV_URL);
        if (!upstream.ok) throw new Error('AMFI_UNAVAILABLE');
        response.json({ navs: parseAmfi(await upstream.text(), wanted) });
        return;
      }
      if (action === 'mfapi-search') {
        const query = encodeURIComponent(String(request.body?.query ?? '').trim());
        const upstream = await externalFetch(`https://api.mfapi.in/mf/search?q=${query}`);
        if (!upstream.ok) throw new Error('MFAPI_UNAVAILABLE');
        response.json({ results: await upstream.json() });
        return;
      }
      if (action === 'nps-nav') {
        const wanted = new Set<string>(
          Array.isArray(request.body?.schemeCodes) ? request.body.schemeCodes.map(String) : [],
        );
        const upstream = await externalFetch(NPS_NAV_URL);
        if (!upstream.ok) throw new Error('NPS_UNAVAILABLE');
        const bytes = Buffer.from(await upstream.arrayBuffer());
        let rows: unknown[][];
        try {
          rows = (await readXlsxFile(bytes)) as unknown as unknown[][];
        } catch {
          const text = bytes.toString('utf8');
          const delimiter = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
          rows = text
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => line.split(delimiter));
        }
        response.json({ navs: parseNpsRows(rows, wanted) });
        return;
      }
      response.status(400).json({ code: 'ACTION_UNSUPPORTED' });
    } catch (error) {
      const rawCode = error instanceof Error ? error.message : '';
      const allowedCodes = new Set([
        'AUTH_REQUIRED',
        'WORKSPACE_REQUIRED',
        'WORKSPACE_FORBIDDEN',
        'MARKET_DATA_UNAVAILABLE',
        'AMFI_UNAVAILABLE',
        'AMFI_INVALID_RESPONSE',
        'MFAPI_UNAVAILABLE',
        'NPS_UNAVAILABLE',
        'NPS_INVALID_RESPONSE',
      ]);
      const code = allowedCodes.has(rawCode)
        ? rawCode
        : error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'PROVIDER_TIMEOUT'
          : 'PROVIDER_UNAVAILABLE';
      // Never return provider response bodies, stack traces, credentials, or tokens.
      response
        .status(code.includes('AUTH') ? 401 : code.includes('FORBIDDEN') ? 403 : 502)
        .json({ code });
    }
  },
);
