# Loans architecture

## Source of truth

Loans calculates account balances and repayment schedules from four workspace collections:

- `loanAccounts`: identity, ownership, payment mode, and contract terms.
- `loanEvents`: effective-dated recorded facts and cash/contract changes.
- `loanReconciliations`: dated comparisons to lender-reported principal.
- `loanDocuments`: source-document metadata and import status. Binary storage and general statement parsing are not implemented.

Calculated outstanding, paid principal/interest, future interest, remaining tenure, payoff date, and schedule rows are disposable engine outputs. They are never authoritative document fields.

## Calculation policy

All monetary operations use `decimal.js` at 40-digit working precision. The default policy rounds interest and installments half-up to two decimals. Each contract records whether lender output is rounded to whole rupees or paise and whether midpoint rounding is half-up or half-even. These are generic calculation inputs rather than lender-name branches.

The optional `firstPeriodInterestAmount` records the authoritative interest printed for installment 1. It is useful when a lender applies a proprietary broken-period start date that cannot be reconstructed from the disbursement date alone. Later periods still use the selected calculation method and day count.

### Guided lender matching

The contract form presents three setup approaches: a standard estimate, lender-schedule matching, and manual advanced rules. Technical policy fields use plain-language labels and remain collapsed during guided matching.

Lender matching accepts any number of repayment-schedule EMI rows containing the date, interest amount, and closing principal. Users can add rows manually or choose a text-based repayment-schedule PDF. PDF.js reads the selected file only in browser memory; the original file is never uploaded, attached, or persisted. Extracted contract suggestions, EMI rows, and a detected part-payment remain editable, and missing terms are called out for review.

The matcher evaluates every supported method, day basis, precision, and midpoint-rounding combination without using the lender name. Every supplied row must match the same policy. Results show each calculated value, the total rupee difference, whether multiple rules remain possible, and the recommended rule before it is applied. A newly entered matching part-payment is recorded as a loan event only when the account is saved. To limit writes for long imported schedules, only the latest accepted row is saved as reconciliation evidence; the evidence note records how many schedule rows participated. An exact match changes the account from **Estimated** to **Reconciled through** the latest matched date.

### Monthly reducing

Interest at each EMI boundary is opening principal × annual rate ÷ 12. Contract changes effective on the due date are applied before that boundary's interest. A mid-cycle prepayment reduces principal used at the next EMI boundary; monthly mode does not prorate the current cycle by days. This is a documented default, not a claim about every lender.

### Daily reducing

Interest accrues between each event and due-date boundary as principal × annual rate × year fraction. A mid-cycle prepayment immediately reduces principal for later days. Rate changes split the accrual interval. Supported day counts are Actual/360, Actual/365, Actual/366, Actual/Actual (each calendar-year segment uses its own basis), and 30/360.

An arbitrary mid-cycle viewing date never becomes a calculation boundary in the projected schedule. Accrued interest is still reported through the selected as-of date, while future installment interest is rounded at lender-relevant event and due-date boundaries. This keeps the repayment schedule identical regardless of the day on which the user opens it.

### Installments

When EMI must be derived, the standard reducing-balance formula is used; zero-interest loans divide principal by periods. The last payment is capped at principal plus accrued interest. Projection stops after 1,200 installments and reports `non-amortizing` when EMI cannot cover interest.

The nominal first-EMI day is retained across months. Invalid month days clamp to month-end, so Jan 31 becomes Feb 28/29 and returns to Mar 31.

## Same-day event order

Events sort by effective date, then the following priority, then stable event ID:

1. Rate, EMI, tenure, and moratorium changes.
2. Additional disbursement.
3. EMI payment.
4. Part prepayment or foreclosure.
5. Charges, charge reversals, waivers, and refunds.
6. Principal adjustment.
7. Balance anchor.

A balance anchor is last because it expresses the lender-known principal after other same-day activity. Retrieval order from Firestore is never used as financial order.

## Recorded, calculated, and projected data

Loan events and lender checkpoints are **recorded**. Position and historical allocation are **calculated**. Future schedule rows are **projected**. Schedule rows carry provenance, and UI copy avoids presenting projections as lender-certified.

An account that begins at a balance anchor has partial history from the anchor date. The engine does not invent lifetime principal or interest totals before it. Reconciliation status is:

- **Estimated**: no accepted matching checkpoint.
- **Reconciled**: matched within tolerance or explicitly accepted.
- **Verified**: a matched lender-backed document checkpoint with a document reference. This label applies only through the checkpoint date.

## Prepayment and changes

Prepayments are dated ledger events and always regenerate the future schedule. The schedule UI renders each one as its own principal-only line before the affected EMI, while installment counts continue to count EMIs only. `keep-emi-reduce-tenure` retains EMI. `keep-tenure-reduce-emi` derives a new EMI from remaining principal and recorded maturity. `bank-specified` expects explicit later EMI and/or tenure events. Charges and GST are recorded separately and never reduce principal.

The scenario engine clones inputs, appends in-memory scenario events, and compares projections. Persistence occurs only through the explicit record action.

## Existing-loan setup

New accounts default to treating every scheduled EMI due through the setup date as paid. The app
records one system `emi-payment` event and one linked expense for each historical due date, using
the calculated final-installment adjustment where applicable. This keeps the ledger, outstanding
principal, paid totals, and historical Expenses aligned instead of treating earlier installments as
overdue. The setup dialog exposes an opt-out for loans with missed or disputed installments. A
lender-reported balance anchor may still be supplied and remains authoritative from its as-of date.

## Expense integration

Monthly expenses come from the engine schedule and retain `sourceLoanId` plus stable template identity `loan:<loanId>`. Existing template/source checks prevent duplicate generated expenses. Historical materialized expenses are not rewritten by future rate, EMI, tenure, prepayment, or foreclosure events.

## Persistence, security, deletion, and export

Firestore rules require workspace membership and same-owner relationships between a child ledger/reconciliation/document record and its parent loan account. Workspace deletion enumerates all four loan collections. Workspace JSON exports and imports all loan collections.

The product favors archive for historical loan accounts. Archiving retains the contract, ledger,
reconciliations, document metadata, and historical materialized expenses, while removing generated
EMI expenses dated today or later. Archived accounts can be restored; current-month generation is
re-evaluated after restoration.

Permanent deletion is only exposed for an already archived account and requires a second explicit
confirmation. It removes the account, all events, reconciliations, document metadata, and future
generated EMI expenses. Historical expenses remain as financial history. Permanent workspace
deletion removes all loan collections and expenses with the workspace.

## Supported limitations

- Monthly-reducing mid-cycle handling follows the documented next-boundary policy and may differ from a lender's proprietary convention.
- Binary statement storage is not implemented. Text-based repayment-schedule PDFs are parsed in browser memory; scanned PDFs and unsupported spreadsheet formats are not parsed.
- Generated FY summaries and CSV files are informational Budget Battowski reports, not official repayment or interest certificates.
