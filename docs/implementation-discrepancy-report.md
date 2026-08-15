# Implementation Discrepancy Report

## 1. Purpose

This report records the verification status and remaining discrepancies after the August 2026 architecture-stabilization follow-up. `docs/functional-requirements.md` remains the authoritative functional contract.

Last inspected: August 15, 2026.

## 2. Stabilization outcome

The release-blocking correctness and security findings are resolved:

- Monthly Review distinguishes inherited source values from reviewer overrides. Approval re-resolves the effective expense or investment source, uses its latest amount when the row was not edited, preserves an explicit occurrence override, and raises a typed conflict when the source is no longer applicable.
- `FirestoreWriteCoordinator` limits rule-heavy transactions to five mutations, processes independent groups with at most five concurrent transactions, limits non-transactional batches to 100 writes, reports group and operation context, and supports idempotent retries.
- Firestore authorization treats Firebase UID as authoritative after migration. Matching email cannot bypass a mismatching UID for workspace membership, workspace administration, record ownership, or related-record ownership checks.
- Workspace discovery queries the authoritative `memberUids` field. Legacy email membership remains available for direct document access during migration, but is not used for collection discovery because Firestore cannot prove that fallback safely for a list query.
- Legacy owned records can adopt the authenticated user's UID exactly once when their legacy email matches the authenticated email. The UID is immutable afterward.
- Frontend workspace, member, and related-record identity checks use the same UID-first compatibility policy as the rules.
- Public invite lookup uses UID and normalized-email directory records containing only public identity fields. Private legacy profiles remain private.
- Production temporal resolution for expense templates, income, investments, and loans uses the framework-independent effective-dating engine.
- `BudgetFacade` uses composition and `App` no longer copies a facade surface through reflection or prototype walking.
- Authentication behavior now lives in `SessionStore`; active workspace, member selection, and administration behavior now live in `WorkspaceStore`.
- Income, category-retirement, workspace-form, and workspace-confirm dialogs are loaded dynamically in addition to the existing lazy Monthly Review and Bulk Editor dialogs.

## 3. Persistence semantics

Coordinator limits are deliberately based on the application's security-rule access patterns rather than only Firestore's raw write limit:

- Atomic dependency groups: transaction, maximum five mutations. A larger atomic group is rejected because splitting it would misrepresent its atomicity.
- Independent versioned mutations: resumable transaction groups of at most five, with at most five groups in flight.
- Independent batch writes: at most 100 writes per batch.

Large independent workflows are not globally atomic. A failure identifies the workspace, collection, record, operation, and group when available. Successfully committed groups remain committed; deterministic IDs plus version-aware create/update/delete behavior make a retry safe. Callers must not present a multi-group workflow as one global transaction.

## 4. UID migration operations

New or returning users populate both public directory indexes during profile upsert. Existing legacy profiles require the administrator migration script before they can be found by another user's invite lookup without signing in again.

Run a dry run first with Application Default Credentials and the intended Firebase project selected:

```bash
npm run migrate:user-directory -- --project <project-id>
```

Apply only after reviewing the dry-run summary:

```bash
npm run migrate:user-directory -- --project <project-id> --apply
```

The script resolves legacy profile emails through Firebase Authentication and writes only `uid`, normalized `email`, `displayName`, `photoUrl`, and migration timestamp to the two public directory indexes. It does not copy onboarding state, preferences, or financial data.

## 5. Verification baseline

The completed implementation was validated with:

- Angular production build: **passed**
- Angular/Vitest application and domain tests: **170/170 passed**
- Firestore emulator rules, concurrency, and production-coordinator tests: **37/37 passed**
- Credentialed regression against the deployed QA rules and Hosting release: **52/52 passed**, including authenticated workspace discovery and desktop/mobile AXE route checks
- Production dependency audit: **0 vulnerabilities**
- Targeted Prettier validation: **passed**
- `git diff --check`: **passed**

The coordinator emulator coverage executes the production TypeScript coordinator and covers create conflicts, versioned updates and deletes, stale writes, idempotent retry, group failure context, and rule-heavy linked expenses.

Known non-blocking production-build warnings:

- `src/app/bulk-editor-dialog.scss` exceeds the 30 kB component-style warning budget by approximately 0.28 kB.
- `src/app/app.scss` exceeds the 30 kB component-style warning budget by approximately 2.44 kB.

The optimized initial bundle is approximately 948.73 kB raw / 211.41 kB transferred. Heavy editors remain in lazy chunks.

## 6. Remaining architectural debt

The following follow-up work is meaningful but is not a release-blocking correctness defect:

- `BudgetStore` remains a large transitional orchestrator. `FinanceStore`, `PaymentStore`, and `PlanningStore` do not yet own all behavior described by the target architecture, and Monthly Review has not yet been extracted into a dedicated application service.
- Pages still inject `BudgetStore` during the compatibility transition rather than using a complete composed `BudgetFacade` surface.
- The emulator suite directly exercises the production write coordinator, while broader repository, monthly-review mutation, and bulk-planner coverage is split across integration and application tests rather than one end-to-end multi-client emulator scenario.
- Bulk Editor and payment configuration remain oversized UI surfaces and have not yet been meaningfully decomposed into domain-focused presentational components.
- The root application shell has removed business-surface reflection and reduced eager dialog imports, but navigation, login/onboarding, and account-shell markup remain candidates for focused component extraction.
- The two component-style budget warnings remain until Bulk Editor and App shell component extraction moves their scoped styles with the new components.
- The legacy invite directory migration has been applied and verified in QA. It remains an explicit production rollout step and must be dry-run against the production project before production rules are deployed.
- The credentialed QA fixture was reseeded before the passing regression and is intentionally left in its post-regression state for debugging, as documented by the QA runner.

These items mean the full P2 maintainability definition is not yet complete. They should be addressed incrementally after the correctness and identity changes have had production soak time.
