# Budget Battowski Deep Regression QA Report

Date: 2026-06-17
Workspace: `C:\Users\dilic\OneDrive\Documents\budget-battowski`
Test mode: local throwaway sandbox copied to `%TEMP%`, with Firebase config blanked in the copy only.

## Summary

Deep functional regression was executed against the current working tree without writing to real Firebase data. The production build passes, and the focused temporary regression harness passes. The existing repo unit suite still has one failing test. Browser route smoke passed for rendering, seeded data visibility, unknown-route redirect, desktop/mobile overflow, and console/page errors, but full AXE scans found serious accessibility failures.

Overall status: **Not release-ready for WCAG/AXE acceptance** because full AXE checks fail on multiple routes.

## Automated Check Results

| Check | Command / Tooling | Result | Notes |
|---|---|---:|---|
| Production build | `npm.cmd run build` | Pass | Angular build completed successfully. |
| Existing unit suite | `npm.cmd test -- --watch=false` | Fail | 90/91 passed. Failing test: `should restore archived payment modes and accounts`. |
| Temporary deep domain harness | `ng test --watch=false --include src/app/qa-regression.spec.ts` in temp copy | Pass | 5/5 passed. Covered seeded data totals, review, recurring cascade, loans, payments, import parsing. |
| Browser route smoke | Playwright Chromium against local-mode temp server | Pass with a11y failures | All seeded routes rendered, no console/page errors, no horizontal overflow. |
| AXE full route scan | `axe-core` in Chromium | Fail | Serious `color-contrast` failures across all scanned routes; additional ARIA/focusability failures. |
| Keyboard/focus smoke | Playwright keyboard checks | Pass | Tab focus reached a real control; review dialog and bulk editor opened and closed with `Escape`; no console errors. |

Evidence screenshots:

- `C:\Users\dilic\AppData\Local\Temp\bb-qa-browser-runner\qa-evidence\desktop-dashboard.png`
- `C:\Users\dilic\AppData\Local\Temp\bb-qa-browser-runner\qa-evidence\mobile-expenses.png`

## Coverage Matrix

| Area | Scenarios Covered | Result | Notes |
|---|---|---:|---|
| App shell | Local mode boot, dashboard render, direct route visits, unknown route redirect to `/dashboard`, desktop and mobile route rendering | Pass | No console errors or page exceptions. |
| Navigation/layout | Desktop side nav, mobile expenses view, mobile bottom nav, route-specific content, horizontal overflow check | Pass | No horizontal overflow detected at `1440x1000` or `390x844`. |
| Month/member state | Selected month `2026-06`, member filter `ALL` and `partner@example.com`, member-scoped income/expense/investment totals | Pass | Current/future recurring investments remain pending review and are not counted as invested until approved. |
| Categories/income/planning | Expense/investment/income categories, monthly income carry-forward, budget category rows, planning timeline and recurring plans | Pass, with AXE issues | Planning route has a scrollable table wrapper that is not keyboard-focusable. |
| One-time expenses | Seeded add-like state, selected month filtering, category/payment/member attribution, dashboard/expenses/planning visibility | Pass | `Groceries`, `Dining`, and smoke expense rendered as expected. |
| Recurring expenses | Monthly, weekly, quarterly scheduling; current-month pending review; past-month default entry generation; update cascade; audit trail creation; delete/skip through review | Pass | Temporary harness verified weekly amount aggregation and recurring update audit trail. |
| Monthly review | Pending count, approve investments, delete/skip recurring expense, duplicate prevention, past-month review disabled | Pass | Review dialog smoke opened and closed cleanly. |
| Investments | One-time investment counted immediately; recurring SIPs shown as plans and become counted after review approval; member allocation path covered | Pass | Behavior is consistent with review-first workflow. |
| Loans/EMIs | Active loan totals, repayment row, EMI calendar, generated EMI expense for default month entries, delete cascade | Pass | Browser displayed loan data; harness verified generated EMI entries and loan deletion behavior. |
| Payment modes/accounts | Default Cash, payment account mapping, usage totals, archive blocked while mapped, archive/restore mode, archive/restore account | Pass in local harness; existing suite fails one restore test | See Issue 4 for repo-suite failure. |
| Import/export | CSV import parsing, valid category/expense/investment rows, invalid category, invalid frequency, processed-success skip semantics | Pass | UI route text expectation was corrected to actual copy: `Import/Export`, `Download template`. |
| Accessibility | AXE all major routes, mobile expenses AXE, keyboard focus smoke, dialog open/close focus smoke | Fail | See Issues 1-3. |

## Issues Observed

### 1. Serious WCAG AA color contrast failures across all major routes

Severity: **High**
Area: Accessibility / visual design
Detected by: Playwright + `axe-core` with color contrast enabled

Affected routes:

- `/dashboard`
- `/expenses`
- `/planning`
- `/investments`
- `/loans`
- `/categories`
- `/payment-modes`
- `/import-export`
- `/workspace`
- `/settings`
- Mobile `/expenses`

Examples:

- Active side nav labels use white on `#2f80ed`, contrast `3.86:1`; expected at least `4.5:1`.
- Page header subtitles use `#66748a` on `#eef4ff`, contrast `4.29:1`; expected at least `4.5:1`.
- Active member filter chip uses white on `#2f80ed`, contrast `3.86:1`.
- Expense category badge `Food` uses `#16a34a` on `#eef2f7`, contrast `2.93:1`.
- Loan calendar weekday labels use `#8a97aa` on white, contrast `2.96:1`.

Expected:

All user-visible text must meet WCAG AA contrast ratios.

Actual:

AXE reports serious `color-contrast` violations on every scanned route.

### 2. Invalid `aria-label` usage on non-role elements

Severity: **High**
Area: Accessibility / ARIA semantics
Detected by: Playwright + `axe-core`

Affected UI:

- Loans page EMI calendar marker:
  - Target: `i[aria-label="HDFC - Home Loan"]`
  - Actual HTML: `<i aria-label="HDFC - Home Loan" ...></i>`
  - AXE: `aria-label attribute cannot be used on a i with no valid role attribute.`
- Payment Modes card number:
  - Target: `.payment-card-number`
  - Actual HTML: `<p class="payment-card-number" aria-label="Credit Card ending 1111">...`
  - AXE: `aria-label attribute cannot be used on a p with no valid role attribute.`

Expected:

If an element needs an accessible name, it should have an appropriate semantic role, or the label should move to a semantic/control element. Pure visual markers should usually be `aria-hidden="true"` with equivalent text exposed elsewhere.

Actual:

AXE reports serious `aria-prohibited-attr` violations.

### 3. Planning table scroll region is not keyboard-focusable

Severity: **Medium**
Area: Accessibility / keyboard support
Detected by: Playwright + `axe-core`

Affected UI:

- Route: `/planning`
- Target: `.data-table-wrap`
- Actual HTML snippet: `<div class="data-table-wrap compact">`
- AXE rule: `scrollable-region-focusable`

Expected:

Scrollable regions should be reachable by keyboard, typically via `tabindex="0"` and a useful accessible label when the region itself scrolls.

Actual:

AXE reports the scrollable table wrapper is not focusable and does not contain focusable content.

### 4. Existing unit test fails for archived payment mode/account restore

Severity: **Medium**
Area: Payment modes / workspace restore
Detected by: existing repo test suite

Failing test:

- `src/app/app.spec.ts`
- Test: `should restore archived payment modes and accounts`
- Line: around `1657`

Expected:

After restoring archived `pm-old-upi` and `pa-old`, both should appear in active payment modes/accounts and disappear from archived lists.

Actual:

The active payment modes list contains only default Cash:

```text
 [{ id: 'payment-mode-cash', name: 'Cash', type: 'cash' }]
- expected arrayContaining pm-old-upi
```

Notes:

The temporary local-mode harness verified restore behavior works when Firebase is disabled from startup. The failing repo test appears tied to the current Firebase-mode test setup/auth state timing, not necessarily the local restore logic itself. It still blocks the automated test suite.

## Notable Confirmed Behaviors

- Current/future recurring investment plans are shown as planned/reviewable but are not included in `investmentTotal()` until reviewed/approved.
- One-time investments are included in `investmentTotal()` immediately for the selected month.
- Current-month loan EMI can be represented both as loan commitment and as generated expense depending on when `ensureMonthDefaults()` runs; focused harness verified generated EMI entries, while the browser seed reported loan EMI separately before async defaulting completed.
- Unknown routes correctly redirect to `/dashboard`.
- Keyboard smoke passed for review and bulk editor dialogs.

## Residual Risk

- Real Firebase auth, Firestore listeners, concurrent multi-user sync, and Firestore security rules were not destructively tested.
- The test data was seeded through local app state, not manually entered through every form field, so browser-level form validation was smoke-tested rather than exhaustively exercised.
- The import/export UI route was rendered, and import parsing was covered programmatically; actual browser file upload/download was not exhaustively tested with every workbook variant.
- AXE results from the existing unit tests disable color contrast; the browser AXE pass enabled it and found failures.

## Recommended Next Actions

1. Fix the global contrast tokens/styles first, especially active nav/member chips, page subtitles, badges, payment tags, and loan calendar labels.
2. Fix invalid ARIA labels on visual-only elements in Loans and Payment Modes.
3. Make scrollable table wrappers keyboard-focusable where overflow is possible.
4. Fix or stabilize the archived payment restore unit test so `npm.cmd test -- --watch=false` is green.
5. Re-run the same regression pack after fixes, including full browser AXE with color contrast enabled.
