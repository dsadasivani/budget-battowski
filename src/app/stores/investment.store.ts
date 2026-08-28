import { Injectable, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { getAuth } from 'firebase/auth';

import { BudgetStore } from '../budget.store';
import { InvestmentRepository } from '../data/investment.repository';
import { calculateGovernmentSavings } from '../domain/investments/government-savings-calculator';
import {
  calculateInvestmentSummary,
  availableHoldingOnDate,
} from '../domain/investments/investment-calculation-engine';
import {
  displayNumber,
  investmentDecimal,
  moneyString,
} from '../domain/investments/investment-decimal';
import { calculatePortfolioSummary } from '../domain/investments/investment-portfolio';
import { effectiveRecurringAmount } from '../domain/investments/investment-recurring';
import {
  settleProviderRefreshes,
  type ProviderRefreshJob,
} from '../domain/investments/investment-refresh';
import {
  EMPTY_INVESTMENT_SUMMARY,
  isContributionType,
  isWithdrawalType,
  supportsRecurringPlan,
  type InvestmentAccount,
  type InvestmentInstrument,
  type InvestmentOpeningSnapshot,
  type InvestmentTransaction,
  type InvestmentTransactionSource,
  type InvestmentTransactionType,
  type InvestmentType,
  type NpsSchemeHolding,
  type ProviderRefreshResult,
  type RecurringInvestmentPlan,
  type ValuationSource,
} from '../domain/investments/investment.models';

export interface NewInvestmentInput {
  name: string;
  type: InvestmentType;
  institution?: string;
  instrument?: InvestmentInstrument;
  openingSnapshot?: InvestmentOpeningSnapshot;
  recurringPlan?: RecurringInvestmentPlan;
}

export interface NewTransactionInput {
  type: InvestmentTransactionType;
  date: string;
  amount: string;
  quantity?: string;
  units?: string;
  price?: string;
  nav?: string;
  source: InvestmentTransactionSource;
  notes?: string;
  schemeAllocations?: NpsSchemeHolding[];
}

interface ProviderPayload {
  prices?: Record<string, string>;
  navs?: Record<string, { nav: string; date: string }>;
}

export interface StockSearchResult {
  name: string;
  tradingSymbol: string;
  isin?: string;
  exchange: 'NSE' | 'BSE';
  instrumentKey: string;
}

export interface MutualFundSearchResult {
  schemeCode: string;
  schemeName: string;
}

function uid(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function now(): string {
  return new Date().toISOString();
}
function month(): string {
  return today().slice(0, 7);
}
function dateInMonth(selectedMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(selectedMonth)) return today();
  const currentDate = today();
  return currentDate.startsWith(`${selectedMonth}-`) ? currentDate : `${selectedMonth}-01`;
}

@Injectable({ providedIn: 'root' })
export class InvestmentStore implements OnDestroy {
  private readonly budget = inject(BudgetStore);
  private readonly repository = inject(InvestmentRepository);
  private connectedWorkspace?: string;
  private migrationAttempted = new Set<string>();

  readonly accounts = signal<InvestmentAccount[]>([]);
  readonly transactions = signal<InvestmentTransaction[]>([]);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly deletingAccountId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly refreshResults = signal<ProviderRefreshResult[]>([]);
  readonly activeAccounts = computed(() =>
    this.accounts().filter((account) => account.status === 'ACTIVE'),
  );
  readonly closedAccounts = computed(() =>
    this.accounts().filter((account) => account.status === 'CLOSED'),
  );
  readonly portfolio = computed(() =>
    calculatePortfolioSummary(
      this.accounts(),
      this.transactions(),
      this.budget.selectedMonth(),
      dateInMonth(this.budget.selectedMonth()),
    ),
  );
  readonly lastRefreshedAt = computed(() =>
    this.accounts()
      .map((item) => item.summary.lastRefreshedAt)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1),
  );
  readonly partialRefresh = computed(() => this.refreshResults().some((result) => !result.success));
  readonly monthlyTransactions = computed(() =>
    this.transactions().filter((item) => item.date.startsWith(`${this.budget.selectedMonth()}-`)),
  );
  readonly monthlyContributions = computed(() =>
    this.monthlyTransactions().filter((item) => isContributionType(item.type)),
  );
  readonly monthlyWithdrawals = computed(() =>
    this.monthlyTransactions().filter((item) => isWithdrawalType(item.type)),
  );

  constructor() {
    effect(() => {
      const workspaceId = this.budget.workspaceId();
      const app = this.budget.firebase.app;
      if (!workspaceId || !app) {
        if (this.connectedWorkspace) this.repository.disconnect();
        this.connectedWorkspace = undefined;
        this.accounts.set([]);
        this.transactions.set([]);
        this.loading.set(false);
        return;
      }
      if (workspaceId === this.connectedWorkspace) return;
      this.connectedWorkspace = workspaceId;
      this.loading.set(true);
      this.repository.connect(
        app,
        workspaceId,
        (accounts) => {
          this.accounts.set(accounts.map((account) => this.withSupportedRecurringPlan(account)));
          this.loading.set(false);
          void this.migrateLegacy(workspaceId);
        },
        (transactions) => this.transactions.set(transactions),
        () => {
          this.error.set('Investment data could not be loaded.');
          this.loading.set(false);
        },
      );
    });
    effect(() => {
      const workspaceId = this.budget.workspaceId();
      const legacyCount = this.budget.investments().length;
      if (workspaceId && legacyCount) void this.migrateLegacy(workspaceId);
    });
  }

  ngOnDestroy(): void {
    this.repository.disconnect();
  }

  display(value: string | undefined): number {
    return displayNumber(value ?? 0);
  }
  transactionsFor(accountId: string): InvestmentTransaction[] {
    return this.transactions()
      .filter((item) => item.investmentId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  effectiveRecurring(account: InvestmentAccount): string {
    if (!supportsRecurringPlan(account.type)) return '0';
    return effectiveRecurringAmount(
      account.recurringPlan,
      dateInMonth(this.budget.selectedMonth()),
    );
  }

  async addInvestment(input: NewInvestmentInput): Promise<InvestmentAccount> {
    this.validateOpening(input.openingSnapshot);
    const timestamp = now();
    const ownerUid = this.budget.userUid() ?? undefined;
    const memberEmail = this.budget.userEmail() ?? undefined;
    const base: InvestmentAccount = {
      id: uid('investment'),
      schemaVersion: 2,
      name: input.name.trim(),
      type: input.type,
      status: 'ACTIVE',
      institution: input.institution?.trim() || undefined,
      instrument: input.instrument,
      openingSnapshot: input.openingSnapshot,
      recurringPlan: supportsRecurringPlan(input.type) ? input.recurringPlan : undefined,
      summary: { ...EMPTY_INVESTMENT_SUMMARY },
      needsInstrumentMapping:
        ['STOCK', 'MUTUAL_FUND', 'NPS'].includes(input.type) && !input.instrument,
      ownerUid,
      memberEmail,
      createdDate: timestamp,
      updatedDate: timestamp,
    };
    const summary = calculateInvestmentSummary(base, [], {
      currentValue:
        input.openingSnapshot?.currentValue ?? input.openingSnapshot?.investedAmount ?? '0',
    });
    const account = { ...base, summary, status: this.deriveStatus(summary) };
    await this.repository.saveAccount(account);
    return account;
  }

  async updateAccount(account: InvestmentAccount): Promise<void> {
    const normalizedAccount = this.withSupportedRecurringPlan(account);
    const summary = calculateInvestmentSummary(
      normalizedAccount,
      this.transactionsFor(normalizedAccount.id),
    );
    await this.repository.saveAccount({
      ...normalizedAccount,
      summary,
      status: this.deriveStatus(summary),
      updatedDate: now(),
    });
  }

  canDelete(account: InvestmentAccount): boolean {
    const userUid = this.budget.userUid();
    return this.budget.canWrite() && (!account.ownerUid || account.ownerUid === userUid);
  }

  async deleteInvestment(account: InvestmentAccount): Promise<void> {
    if (this.deletingAccountId()) return;
    if (!this.canDelete(account))
      throw new Error('You do not have permission to delete this investment.');

    this.deletingAccountId.set(account.id);
    this.error.set(null);
    const transactionIds = this.transactionsFor(account.id).map((transaction) => transaction.id);
    try {
      await this.repository.deleteAccountAndTransactions(
        account.id,
        transactionIds,
        account.legacySourceId,
      );
      this.accounts.update((accounts) => accounts.filter((item) => item.id !== account.id));
      this.transactions.update((transactions) =>
        transactions.filter((transaction) => transaction.investmentId !== account.id),
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Investment could not be deleted.';
      this.error.set(message);
      throw new Error(message, { cause: error });
    } finally {
      this.deletingAccountId.set(null);
    }
  }

  async addTransaction(account: InvestmentAccount, input: NewTransactionInput): Promise<void> {
    this.validateTransaction(account, input);
    const timestamp = now();
    let units = input.units;
    let quantity = input.quantity;
    let unitsSource: InvestmentTransaction['unitsSource'];
    if (!units && account.type === 'MUTUAL_FUND' && input.nav) {
      units = investmentDecimal(input.amount).div(input.nav).toString();
      unitsSource = 'CALCULATED';
    }
    if (units) unitsSource ??= 'STATEMENT';
    const transaction: InvestmentTransaction = {
      id: uid('investment-transaction'),
      schemaVersion: 2,
      investmentId: account.id,
      type: input.type,
      date: input.date,
      amount: moneyString(input.amount),
      quantity,
      units,
      price: input.price,
      nav: input.nav,
      unitsSource,
      source: input.source,
      notes: input.notes?.trim() || undefined,
      ownerUid: account.ownerUid,
      memberEmail: account.memberEmail,
      schemeAllocations: input.schemeAllocations,
      createdDate: timestamp,
      updatedDate: timestamp,
    };
    const all = [...this.transactionsFor(account.id), transaction];
    const summary = calculateInvestmentSummary(account, all);
    await this.repository.saveTransactionAndSummary(transaction, {
      ...account,
      summary,
      status: this.deriveStatus(summary),
      updatedDate: timestamp,
    });
  }

  async refresh(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.error.set(null);
    this.refreshResults.set([]);
    const active = this.activeAccounts();
    const jobs: ProviderRefreshJob[] = [];
    if (active.some((item) => item.type === 'STOCK'))
      jobs.push({ provider: 'UPSTOX', run: () => this.refreshStocks(active) });
    if (active.some((item) => item.type === 'MUTUAL_FUND'))
      jobs.push({ provider: 'AMFI', run: () => this.refreshMutualFunds(active) });
    if (active.some((item) => item.type === 'NPS'))
      jobs.push({ provider: 'NPS_TRUST', run: () => this.refreshNps(active) });
    if (active.some((item) => item.type === 'PPF' || item.type === 'SSY'))
      jobs.push({ provider: 'INTERNAL', run: () => this.refreshGovernment(active) });
    const results = await settleProviderRefreshes(jobs);
    this.refreshResults.set(results);
    if (results.some((item) => !item.success))
      this.error.set('Some investments could not be refreshed. Previous values are being shown.');
    this.refreshing.set(false);
  }

  async searchStocks(query: string): Promise<StockSearchResult[]> {
    const payload = (await this.providerRequest('stock-search', { query })) as {
      results?: unknown;
    };
    return Array.isArray(payload.results) ? (payload.results as StockSearchResult[]) : [];
  }

  async searchMutualFunds(query: string): Promise<MutualFundSearchResult[]> {
    const payload = (await this.providerRequest('mfapi-search', { query })) as {
      results?: unknown;
    };
    if (!Array.isArray(payload.results)) return [];
    return payload.results.flatMap((value): MutualFundSearchResult[] => {
      if (!value || typeof value !== 'object') return [];
      const item = value as { schemeCode?: unknown; schemeName?: unknown };
      return typeof item.schemeCode === 'number' && typeof item.schemeName === 'string'
        ? [{ schemeCode: String(item.schemeCode), schemeName: item.schemeName }]
        : typeof item.schemeCode === 'string' && typeof item.schemeName === 'string'
          ? [{ schemeCode: item.schemeCode, schemeName: item.schemeName }]
          : [];
    });
  }

  private async refreshStocks(accounts: InvestmentAccount[]): Promise<ProviderRefreshResult> {
    const allStocks = accounts.filter((item) => item.type === 'STOCK');
    const stocks = accounts.filter(
      (item) => item.type === 'STOCK' && item.instrument?.kind === 'STOCK',
    );
    if (!stocks.length)
      return {
        provider: 'UPSTOX',
        success: !allStocks.length,
        updatedCount: 0,
        failedCount: allStocks.length,
        errorCode: allStocks.length ? 'NOT_CONFIGURED' : undefined,
      };
    try {
      const response = (await this.providerRequest('stock-quotes', {
        instrumentKeys: stocks.map((item) =>
          item.instrument?.kind === 'STOCK' ? item.instrument.upstoxInstrumentKey : '',
        ),
      })) as ProviderPayload;
      const result = await this.applyMarketValues(stocks, response.prices ?? {}, 'UPSTOX');
      const unmapped = allStocks.length - stocks.length;
      return {
        ...result,
        success: result.success && !unmapped,
        failedCount: result.failedCount + unmapped,
        errorCode: unmapped ? 'NOT_CONFIGURED' : result.errorCode,
      };
    } catch (error) {
      return {
        provider: 'UPSTOX',
        success: false,
        updatedCount: 0,
        failedCount: allStocks.length,
        errorCode: 'UNAVAILABLE',
      };
    }
  }

  private async refreshMutualFunds(accounts: InvestmentAccount[]): Promise<ProviderRefreshResult> {
    const allFunds = accounts.filter((item) => item.type === 'MUTUAL_FUND');
    const funds = accounts.filter(
      (item) => item.type === 'MUTUAL_FUND' && item.instrument?.kind === 'MUTUAL_FUND',
    );
    if (!funds.length)
      return {
        provider: 'AMFI',
        success: !allFunds.length,
        updatedCount: 0,
        failedCount: allFunds.length,
        errorCode: allFunds.length ? 'NOT_CONFIGURED' : undefined,
      };
    try {
      const response = (await this.providerRequest('amfi-nav', {
        schemeCodes: funds.map((item) =>
          item.instrument?.kind === 'MUTUAL_FUND' ? item.instrument.schemeCode : '',
        ),
      })) as ProviderPayload;
      const result = await this.applyNavValues(funds, response.navs ?? {}, 'AMFI');
      const unmapped = allFunds.length - funds.length;
      return {
        ...result,
        success: result.success && !unmapped,
        failedCount: result.failedCount + unmapped,
        errorCode: unmapped ? 'NOT_CONFIGURED' : result.errorCode,
      };
    } catch {
      return {
        provider: 'AMFI',
        success: false,
        updatedCount: 0,
        failedCount: allFunds.length,
        errorCode: 'UNAVAILABLE',
      };
    }
  }

  private async refreshNps(accounts: InvestmentAccount[]): Promise<ProviderRefreshResult> {
    const allNps = accounts.filter((item) => item.type === 'NPS');
    const nps = accounts.filter((item) => item.type === 'NPS' && item.instrument?.kind === 'NPS');
    if (!nps.length)
      return {
        provider: 'NPS_TRUST',
        success: !allNps.length,
        updatedCount: 0,
        failedCount: allNps.length,
        errorCode: allNps.length ? 'NOT_CONFIGURED' : undefined,
      };
    try {
      const codes = nps.flatMap((item) =>
        item.instrument?.kind === 'NPS'
          ? item.instrument.schemeHoldings.map((holding) => holding.schemeCode)
          : [],
      );
      const response = (await this.providerRequest('nps-nav', {
        schemeCodes: codes,
      })) as ProviderPayload;
      let updated = 0;
      const writes: InvestmentAccount[] = [];
      for (const account of nps) {
        if (account.instrument?.kind !== 'NPS') continue;
        let value = investmentDecimal(0);
        let valuationDate = '';
        let complete = true;
        const holdingMap = new Map(
          account.instrument.schemeHoldings.map((holding) => [holding.schemeCode, { ...holding }]),
        );
        for (const transaction of this.transactionsFor(account.id).sort((a, b) =>
          a.date.localeCompare(b.date),
        )) {
          for (const allocation of transaction.schemeAllocations ?? []) {
            const current = holdingMap.get(allocation.schemeCode) ?? { ...allocation, units: '0' };
            const units = isContributionType(transaction.type)
              ? investmentDecimal(current.units).plus(allocation.units)
              : investmentDecimal(current.units).minus(allocation.units);
            if (units.lt(0)) throw new Error('NPS_ALLOCATION_EXCEEDS_HOLDING');
            holdingMap.set(allocation.schemeCode, {
              ...current,
              ...allocation,
              units: units.toString(),
            });
          }
        }
        const holdings = [...holdingMap.values()].map((holding) => {
          const quote = response.navs?.[holding.schemeCode];
          if (!quote) {
            complete = false;
            return holding;
          }
          value = value.plus(investmentDecimal(holding.units).mul(quote.nav));
          valuationDate = valuationDate > quote.date ? valuationDate : quote.date;
          return { ...holding, nav: quote.nav, navDate: quote.date };
        });
        if (!complete) continue;
        const instrument = { ...account.instrument, schemeHoldings: holdings };
        const summary = calculateInvestmentSummary(account, this.transactionsFor(account.id), {
          currentValue: value.toString(),
          valuationDate,
          lastRefreshedAt: now(),
        });
        writes.push({
          ...account,
          instrument,
          summary: { ...summary, valuationSource: 'NPS_TRUST', refreshStatus: 'CURRENT' },
          updatedDate: now(),
        });
        updated++;
      }
      await this.repository.saveAccounts(writes);
      const unmapped = allNps.length - nps.length;
      return {
        provider: 'NPS_TRUST',
        success: updated === nps.length && !unmapped,
        updatedCount: updated,
        failedCount: nps.length - updated + unmapped,
        errorCode: unmapped ? 'NOT_CONFIGURED' : undefined,
      };
    } catch {
      return {
        provider: 'NPS_TRUST',
        success: false,
        updatedCount: 0,
        failedCount: allNps.length,
        errorCode: 'UNAVAILABLE',
      };
    }
  }

  private async refreshGovernment(accounts: InvestmentAccount[]): Promise<ProviderRefreshResult> {
    const savings = accounts.filter(
      (item): item is InvestmentAccount & { type: 'PPF' | 'SSY' } =>
        item.type === 'PPF' || item.type === 'SSY',
    );
    const writes: InvestmentAccount[] = [];
    for (const account of savings) {
      if (!account.openingSnapshot) continue;
      const valuation = calculateGovernmentSavings(
        account.type,
        account.openingSnapshot,
        this.transactionsFor(account.id),
        today(),
      );
      const summary = calculateInvestmentSummary(account, this.transactionsFor(account.id), {
        currentValue: valuation.currentValue,
        valuationDate: valuation.valuationDate,
        lastRefreshedAt: now(),
      });
      writes.push({
        ...account,
        summary: { ...summary, valuationSource: 'INTERNAL', refreshStatus: 'CURRENT' },
        updatedDate: now(),
      });
    }
    await this.repository.saveAccounts(writes);
    return {
      provider: 'INTERNAL',
      success: writes.length === savings.length,
      updatedCount: writes.length,
      failedCount: savings.length - writes.length,
    };
  }

  private async applyMarketValues(
    accounts: InvestmentAccount[],
    prices: Record<string, string>,
    source: ValuationSource,
  ): Promise<ProviderRefreshResult> {
    const writes: InvestmentAccount[] = [];
    for (const account of accounts) {
      if (account.instrument?.kind !== 'STOCK') continue;
      const price = prices[account.instrument.upstoxInstrumentKey];
      if (!price) continue;
      const summary = calculateInvestmentSummary(account, this.transactionsFor(account.id), {
        valuationPrice: price,
        valuationDate: today(),
        lastRefreshedAt: now(),
      });
      writes.push({
        ...account,
        summary: { ...summary, valuationSource: source, refreshStatus: 'CURRENT' },
        updatedDate: now(),
      });
    }
    await this.repository.saveAccounts(writes);
    return {
      provider: source,
      success: writes.length === accounts.length,
      updatedCount: writes.length,
      failedCount: accounts.length - writes.length,
    };
  }
  private async applyNavValues(
    accounts: InvestmentAccount[],
    navs: Record<string, { nav: string; date: string }>,
    source: ValuationSource,
  ): Promise<ProviderRefreshResult> {
    const writes: InvestmentAccount[] = [];
    for (const account of accounts) {
      if (account.instrument?.kind !== 'MUTUAL_FUND') continue;
      const quote = navs[account.instrument.schemeCode];
      if (!quote) continue;
      const summary = calculateInvestmentSummary(account, this.transactionsFor(account.id), {
        valuationPrice: quote.nav,
        valuationDate: quote.date,
        lastRefreshedAt: now(),
      });
      writes.push({
        ...account,
        summary: { ...summary, valuationSource: source, refreshStatus: 'CURRENT' },
        updatedDate: now(),
      });
    }
    await this.repository.saveAccounts(writes);
    return {
      provider: source,
      success: writes.length === accounts.length,
      updatedCount: writes.length,
      failedCount: accounts.length - writes.length,
    };
  }

  private async providerRequest(action: string, body: Record<string, unknown>): Promise<unknown> {
    const app = this.budget.firebase.app;
    if (!app) throw new Error('PROVIDER_NOT_CONFIGURED');
    const user = getAuth(app).currentUser;
    if (!user) throw new Error('AUTH_REQUIRED');
    const token = await user.getIdToken();
    const projectId = app.options.projectId;
    const endpoint = `https://us-central1-${projectId}.cloudfunctions.net/investmentProvider`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, workspaceId: this.budget.workspaceId(), ...body }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw new Error((value as { code?: string }).code ?? 'PROVIDER_UNAVAILABLE');
    }
    return response.json();
  }

  private withSupportedRecurringPlan(account: InvestmentAccount): InvestmentAccount {
    if (supportsRecurringPlan(account.type) || !account.recurringPlan) return account;
    return {
      ...account,
      recurringPlan: undefined,
      summary: {
        ...account.summary,
        currentRecurringAmount: undefined,
        recurringFrequency: undefined,
      },
    };
  }

  private deriveStatus(summary: InvestmentAccount['summary']): InvestmentAccount['status'] {
    return investmentDecimal(summary.currentQuantity).isZero() &&
      investmentDecimal(summary.remainingCostBasis).isZero() &&
      investmentDecimal(summary.totalContributions).gt(0)
      ? 'CLOSED'
      : 'ACTIVE';
  }
  private validateOpening(opening?: InvestmentOpeningSnapshot): void {
    if (!opening) return;
    if (opening.asOfDate > today()) throw new Error('Opening date cannot be in the future.');
    if (investmentDecimal(opening.investedAmount).lt(0))
      throw new Error('Invested amount cannot be negative.');
  }
  private validateTransaction(account: InvestmentAccount, input: NewTransactionInput): void {
    if (!input.date || input.date > today())
      throw new Error('Transaction date cannot be in the future.');
    if (investmentDecimal(input.amount).lte(0))
      throw new Error('Amount must be greater than zero.');
    const units = input.quantity ?? input.units;
    if (units && investmentDecimal(units).lte(0))
      throw new Error('Quantity or units must be greater than zero.');
    if (isWithdrawalType(input.type) && units) {
      const available = availableHoldingOnDate(
        account,
        this.transactionsFor(account.id),
        input.date,
      );
      if (investmentDecimal(units).gt(available))
        throw new Error(`You can dispose of at most ${available} units on this date.`);
    }
  }

  private async migrateLegacy(workspaceId: string): Promise<void> {
    if (this.migrationAttempted.has(workspaceId) || !this.budget.investments().length) return;
    this.migrationAttempted.add(workspaceId);
    const migrated = new Set(this.accounts().map((item) => item.legacySourceId));
    try {
      for (const legacy of this.budget
        .investments()
        .filter((item) => !item.sourceInvestmentId && !migrated.has(item.id))) {
        const lower = legacy.name.toLowerCase();
        const type: InvestmentType = lower.includes('nps')
          ? 'NPS'
          : lower.includes('ppf')
            ? 'PPF'
            : lower.includes('sukanya') || lower.includes('ssy')
              ? 'SSY'
              : 'MUTUAL_FUND';
        const start =
          legacy.startDate ?? legacy.date ?? legacy.createdDate?.slice(0, 10) ?? today();
        const frequency =
          legacy.frequency === 'quarterly'
            ? 'QUARTERLY'
            : legacy.frequency === 'annual'
              ? 'YEARLY'
              : 'MONTHLY';
        const timestamp = now();
        const account: InvestmentAccount = {
          id: `v2-${legacy.id}`,
          schemaVersion: 2,
          name: legacy.name,
          type,
          status: 'ACTIVE',
          recurringPlan: {
            enabled: legacy.frequency !== 'one-time',
            amount: moneyString(legacy.amount),
            frequency,
            startDate: start,
            endDate: legacy.endDate,
          },
          summary: {
            ...EMPTY_INVESTMENT_SUMMARY,
            currentRecurringAmount: moneyString(legacy.amount),
            recurringFrequency: frequency,
          },
          legacySourceId: legacy.id,
          needsInstrumentMapping: type === 'MUTUAL_FUND' || type === 'NPS',
          ownerUid: legacy.ownerUid ?? this.budget.userUid() ?? undefined,
          memberEmail: legacy.memberEmail,
          createdDate: timestamp,
          updatedDate: timestamp,
        };
        await this.repository.saveAccount(account);
      }
    } catch {
      this.migrationAttempted.delete(workspaceId);
      this.error.set(
        'Legacy investment plans could not be migrated yet. No source data was changed.',
      );
    }
  }
}
