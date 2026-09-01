# Investments V2

Investments V2 is a personal-finance portfolio ledger. It answers current value, remaining cost basis, total return, actual monthly investing, and recurring commitment. It is not a trading, tax, recommendations, or market-analysis feature.

## Architecture and storage

The application already uses authenticated collaborative workspaces, so V2 follows that ownership boundary:

```text
budgetWorkspaces/{workspaceId}/investmentAccounts/{investmentId}
budgetWorkspaces/{workspaceId}/investmentTransactions/{transactionId}
```

`investmentAccounts` holds provider-independent instrument metadata, the optional opening snapshot and recurring plan, and a derived summary. `investmentTransactions` is the authoritative ledger. A transaction stores `investmentId` and remains a flat workspace child collection, matching the existing `loanAccounts` / `loanEvents` convention and allowing efficient month-level review reads.

All money, unit, NAV, price, percentage, and cost-basis fields in the V2 domain are canonical decimal strings. Calculations use `decimal.js`; display conversion is kept at the component boundary.

The supported P0 types are `STOCK`, `MUTUAL_FUND`, `NPS`, `PPF`, and `SSY`. Instruments use an explicit discriminant, so future types can be added without creating another ledger architecture.

## Accounting rules

- An opening snapshot is the baseline for an existing position. Users do not need to recreate historical transactions.
- Post-opening transactions are the source of truth.
- Stock and mutual-fund disposal uses FIFO lot consumption. This is performance accounting, not a tax engine.
- Active-card “Invested” is remaining cost basis. Lifetime contributions and withdrawals are retained separately.
- Full liquidation derives `CLOSED`; a later acquisition derives `ACTIVE` again. Records are never deleted as part of liquidation.
- Overall return is `realized return + unrealized return`. The P0 percentage divides lifetime return by lifetime contributions and safely handles zero.
- A recurring plan is a commitment and prefill only. It never creates a transaction.
- Mutual-fund recurring plans are either fixed SIPs or step-up SIPs. SIP contributions support monthly, quarterly, half-yearly, and annual cadences. A step-up SIP records a fixed increase amount, its cadence, and the upcoming step-up month so future commitment amounts can be projected.
- Only recorded `BUY`, `SIP`, and `CONTRIBUTION` transactions appear as invested this month.
- `SELL`, `REDEMPTION`, and `WITHDRAWAL` are investment withdrawals. They may increase remaining cash, but never Income.
- Investment appreciation and investment returns are never Income.

## Manual refresh

Opening `/investments` reads saved summaries and makes no provider calls. The explicit Refresh action runs independent provider branches concurrently. Each successful branch persists only its user-owned latest valuation. A failed branch retains its prior summary, and the UI reports a partial refresh.

```text
Refresh
  ├─ STOCK → on-demand Firebase function → read-only market quote API (batched keys)
  ├─ MUTUAL_FUND → function downloads AMFI NAVAll once → selected scheme codes
  ├─ NPS → function downloads NPS Trust dump once → selected scheme codes
  └─ PPF / SSY → local deterministic recalculation
```

No scheduled function, cron job, polling loop, WebSocket, automatic page-load refresh, or historical price database exists.

## Providers

### Stock market data

The browser never receives the market-data token. `investmentProvider` verifies the Firebase ID token and workspace membership, then uses one server-held, read-only analytics token for public stock discovery and batched quote refreshes. Customers never connect a brokerage account or complete a provider authorization flow. Provider authentication failures are reported as temporary market-data unavailability while prior saved values remain visible.

Configure production secrets:

```powershell
npx firebase-tools functions:secrets:set INVESTMENT_MARKET_DATA_TOKEN --project budget-battowski
```

The token must be generated as a read-only analytics token and rotated before its annual expiry. Repeat with the QA project when enabling stock market data in QA. Deploy with `npm run deploy:functions` after configuring the secret.

Stock discovery downloads the provider's complete instrument catalogue only after a user searches and persists only the selected instrument key/ISIN metadata. No whole-market catalogue is written to Firestore.

### Mutual funds

MFAPI is used for user-initiated search. AMFI is authoritative for current valuation. The AMFI parser finds current-format columns by header name instead of legacy positions, ignores headings/blank rows, permits missing ISIN, retains a NAV date separate from refresh time, and requests the complete feed only once per refresh.

### NPS

The NPS Trust adapter accepts actual Excel or tabular text despite MIME-type ambiguity. It resolves columns by header, maps arbitrary scheme codes, and values each saved holding independently before account aggregation. The model does not assume fixed E/C/G schemes or one PFM.

### PPF and SSY

PPF and SSY have separate scheme types with a shared versioned rate table. The calculator applies the lowest eligible balance from close of the fifth day through month end, accrues monthly interest, and credits at the financial-year boundary. It uses the opening balance as the baseline and actual contributions/withdrawals thereafter. Rate changes are data changes, not formula changes, and refresh never scrapes government pages.

The app first reads the global Firestore document `investmentConfiguration/governmentSavingsRates`:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-30T00:00:00.000Z",
  "rates": [
    {
      "scheme": "PPF",
      "annualRate": "7.1",
      "effectiveFrom": "2026-07-01",
      "effectiveTo": "2026-09-30",
      "sourceUrl": "https://dea.gov.in/...",
      "publishedDate": "2026-06-30",
      "verifiedAt": "2026-08-30T00:00:00.000Z"
    }
  ]
}
```

Only authenticated clients may read this document. Client writes are denied; publish it through the Firebase console or a privileged Admin SDK process. Every period requires an explicit end date, an HTTPS official source, publication date, and verification timestamp. Periods for one scheme must not overlap.

If the document is missing, invalid, or unavailable, refresh uses the bundled verified table. If the selected central table is valid but has no period covering the valuation date, the previous balance is retained and the account is marked `STALE` with `RATE_NOT_VERIFIED`; the last known rate is never extended into an unverified quarter. Before each quarter begins, publish its official periods centrally and update the bundled table before the next production release.

## Legacy migration

Legacy `investments` documents are cash-planning records, not holdings. On the first V2 load, each top-level legacy plan is copied to `investmentAccounts` using the stable ID `v2-{legacyId}` and `legacySourceId`. The legacy amount/frequency/date becomes a recurring commitment, not an actual contribution. Existing MF/NPS-like plans are marked `needsInstrumentMapping`; no balance is invented. The source record remains untouched during migration for backward compatibility. Re-running migration checks `legacySourceId`, so it cannot duplicate accounts. Permanently deleting a migrated V2 account also deletes that source plan so the account cannot be recreated on the next load.

## Screens

- `/investments`: persisted portfolio summary, Refresh, empty state, active cards, collapsed closed cards, monthly contribution/withdrawal breakdown, and add flow.
- `/investments/:investmentId`: restrained performance summary, recurring plan, authoritative transaction ledger, acquisition/contribution, liquidation, and confirmed permanent-delete actions. Delete removes the account and its complete transaction ledger; only the record owner can perform it.
- Dashboard: current investment value plus overall return amount/percentage only.
- Monthly Review: actual recurring/ad-hoc contributions and withdrawals. Plans without a transaction are absent.

## Validation and failure behavior

Transactions require a positive amount, positive supplied quantity/units, and a non-future date. A disposal cannot exceed the holding available on its transaction date. Recurring and step-up values must be positive. Provider dates can be prior business dates. Provider response details and secrets are not returned to the browser or logged.

## Verification

Pure tests cover FIFO purchase/sale/redemption flows, close/reopen, recurring frequencies and step-up boundaries, actual-vs-planned monthly accounting, return/withdrawal separation from income, AMFI current-format parsing, NPS tabular parsing, Upstox quote mapping, and PPF/SSY cutoff/FY behavior. Provider tests use fixtures and never contact live providers. Firestore emulator tests cover workspace isolation and parent-owner linkage for V2 transactions.
