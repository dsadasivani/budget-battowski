# Implementation Discrepancy Report

## 1. Purpose

This report records the verification status and remaining discrepancies after the August 2026 architecture-stabilization follow-up. `docs/functional-requirements.md` remains the authoritative functional contract.

Last inspected: August 17, 2026.

## 2. Stabilization outcome

The release-blocking correctness and security findings are resolved:

- Monthly Review distinguishes inherited source values from reviewer overrides. Approval re-resolves the effective expense or investment source, uses its latest amount when the row was not edited, preserves an explicit occurrence override, and raises a typed conflict when the source is no longer applicable.
- `FirestoreWriteCoordinator` limits rule-heavy transactions to five mutations, processes independent groups with at most five concurrent transactions, limits non-transactional batches to 100 writes, reports group and operation context, and supports idempotent retries.
- Firestore authorization requires Firebase UID for workspace membership, workspace administration, record ownership, and related-record ownership checks. Email is display and invitation metadata only.
- Workspace discovery queries the required `memberUids` field. Personal workspaces are keyed by Firebase UID, and workspace owners and members must have UID identity from creation.
- Owned financial records require an immutable `ownerUid`; records without UID ownership cannot be created, updated, or linked.
- Frontend workspace, member, and related-record identity checks use the same UID-only policy as the rules.
- Public invite lookup uses UID and normalized-email directory records containing only public identity fields. Private user state is stored by UID.
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

## 4. UID identity operations

The application assumes a clean UID schema and does not include legacy identity migration tooling. A signed-in user writes their UID-keyed public directory entry, normalized-email invitation index, and UID-keyed private profile. New personal workspaces use the user's UID as the document ID.

Existing email-keyed profiles, email-keyed workspaces, and financial records without `ownerUid` are intentionally unsupported. Deployments adopting this schema must start with clean Firebase data or explicitly remove obsolete data outside the application.

## 5. Verification baseline

The completed implementation was validated with:

- Angular production build: **passed**
- Angular/Vitest application and domain tests: **172/172 passed**
- Firestore emulator rules, concurrency, and production-coordinator tests: **36/36 passed**
- Credentialed QA regression: **not run for this branch** because `QA_FIREBASE_PASSWORD` was unavailable; the UID-only rules were fully exercised locally by the emulator suite
- Production dependency audit: **0 vulnerabilities**
- Targeted Prettier validation: **passed**
- `git diff --check`: **passed**

The coordinator emulator coverage executes the production TypeScript coordinator and covers create conflicts, versioned updates and deletes, stale writes, idempotent retry, group failure context, and rule-heavy linked expenses.

Known non-blocking production-build warnings:

- `src/app/bulk-editor-dialog.scss` exceeds the 30 kB component-style warning budget by approximately 0.28 kB.
- `src/app/app.scss` exceeds the 30 kB component-style warning budget by approximately 2.44 kB.

The optimized initial bundle is approximately 947.41 kB raw / 211.11 kB transferred. Heavy editors remain in lazy chunks.

## 6. Remaining architectural debt

The following follow-up work is meaningful but is not a release-blocking correctness defect:

- `BudgetStore` remains a large transitional orchestrator. `FinanceStore`, `PaymentStore`, and `PlanningStore` do not yet own all behavior described by the target architecture, and Monthly Review has not yet been extracted into a dedicated application service.
- Pages still inject `BudgetStore` during the compatibility transition rather than using a complete composed `BudgetFacade` surface.
- The emulator suite directly exercises the production write coordinator, while broader repository, monthly-review mutation, and bulk-planner coverage is split across integration and application tests rather than one end-to-end multi-client emulator scenario.
- Bulk Editor and payment configuration remain oversized UI surfaces and have not yet been meaningfully decomposed into domain-focused presentational components.
- The root application shell has removed business-surface reflection and reduced eager dialog imports, but navigation, login/onboarding, and account-shell markup remain candidates for focused component extraction.
- The two component-style budget warnings remain until Bulk Editor and App shell component extraction moves their scoped styles with the new components.
- This local identity cleanup has not yet been deployed to QA; credentialed end-to-end regression remains a post-deployment check.

These items mean the full P2 maintainability definition is not yet complete. They should be addressed incrementally after the correctness and identity changes have had production soak time.
