# Continuous deployment

The `CD` GitHub Actions workflow deploys Firestore rules and Firebase Hosting with keyless Google Workload Identity Federation.

## Release policy

- Feature branches are cut from `develop` and merged back through a pull request.
- Pull requests targeting `develop` must pass the `quality` and `dependency-security` CI checks.
- A merge to `develop` automatically deploys Firestore rules and Hosting to QA.
- A pull request promotes the already-validated `develop` revision to `master` without repeating CI; the `branch-policy` check only verifies the source branch.
- A merge to `master` automatically deploys Firestore rules and Hosting to production.
- Every production deployment runs a non-destructive smoke against the deployed Hosting release and retains its report for 90 days.
- Every Hosting deployment publishes `/release.json` so client errors and smoke evidence can be correlated to the exact Git commit and workflow run.
- QA and production can be redeployed manually only from `develop` and `master`, respectively.
- Component rollback is manual-only, accepts only a strict protected-branch ancestor, and shares the normal deployment concurrency lock.
- QA and production use separate Google Cloud service accounts and identity providers.

## GitHub Environment variables

Each `qa` and `production` Environment defines:

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

These values identify cloud resources but are not credentials or secrets. The workflow exchanges GitHub's short-lived OIDC token for short-lived Google credentials.

The `qa` Environment also defines one encrypted Environment secret:

- `QA_FIREBASE_PASSWORD`: the shared password for the dedicated `qa.owner`, `qa.editor`, and `qa.member` regression accounts.

The password is exposed only to the post-deployment seed and regression steps. It is not configured in the production Environment and must never be committed to the repository.

Configure or rotate it from a secure interactive prompt:

```bash
gh secret set QA_FIREBASE_PASSWORD --env qa
```

Do not put the password directly on the command line, where it can be retained in shell history.

## One-time Google Cloud setup

From a repository checkout, run the setup script once for each Firebase project:

```bash
bash scripts/setup-cd-wif.sh budget-battowski-qa qa
bash scripts/setup-cd-wif.sh budget-battowski production
```

Run these commands from an authenticated Google Cloud Shell, or from a workstation where `gcloud` is authenticated with permission to manage APIs, IAM, service accounts, and Workload Identity Federation in both projects.

The script enables the required APIs, creates an environment-restricted GitHub identity provider, creates the `firebase-cd` service account, and grants only Firebase viewing, Hosting deployment, Firestore rules deployment, and service-usage permissions.

The identity provider accepts tokens only when GitHub's immutable repository ID is `1261735097`, the job uses the matching `qa` or `production` Environment, and the token comes from `develop` for QA or `master` for production.

## Validation

1. Merge a feature pull request into `develop` after both required checks pass.
2. Confirm the QA deployment updated Firestore rules and Hosting.
3. Confirm the deterministic QA seed and authenticated regression steps passed against `https://budget-battowski-qa.web.app`.
4. Download the `qa-release-evidence-<run-id>` artifact when detailed release evidence is required. QA evidence is retained for 30 days, including failed deployment runs when a report was produced.
5. Open a `develop` to `master` pull request and merge it after QA sign-off.
6. Confirm the production deployment updated Firestore rules and Hosting.
7. Confirm the production smoke passed and download the `production-release-evidence-<run-id>` artifact. Production evidence is retained for 90 days.

The QA deployment is not considered successful when seeding or authenticated regression fails, even if Firebase rules and Hosting were released successfully. Fix the cause and redeploy `develop`; do not promote that revision to `master`.

## Production smoke scope

The production smoke is anonymous and read-only. It verifies the Hosting document and hashed assets, deployed release metadata, Firebase authentication initialization to the signed-out state, Google sign-in availability, SPA rewrites for core route entry points, and the absence of runtime or browser-console errors. When run by CD, the release metadata must identify the workflow commit. It does not create, update, or delete production financial data.

Run it locally against the default production URL with:

```bash
npm run production:smoke
```

Override `PRODUCTION_BASE_URL` only when validating another explicitly selected production-compatible Hosting target. Authenticated workspace discovery and financial CRUD remain in the credentialed QA regression unless production later gains a dedicated disposable synthetic workspace.

## Release evidence

Both deployment jobs generate the same evidence contract after their verification step, including when an earlier deployment gate fails:

- `RELEASE_EVIDENCE.md`: human-readable release identity, required gate outcomes, migration disposition, and detailed-report checksum.
- `release-evidence.json`: versioned machine-readable form of the same manifest.
- The environment-specific detailed report: `QA_FIREBASE_REGRESSION_REPORT.md` or `PRODUCTION_SMOKE_REPORT.md`.

The manifest records only allowlisted operational metadata. It does not dump environment variables, credentials, authentication tokens, or financial report contents. The SHA-256 checksum binds the manifest to the detailed report retained in the same artifact. The Markdown manifest is also appended to the GitHub Actions job summary for quick review.

The current clean UID-only deployment has migration status `not-required`; legacy migration is intentionally unsupported. If migrations are introduced for a future schema, this field must reflect their reviewed release disposition rather than being inferred from deployment success.

## Error correlation

The application emits privacy-safe structured operational events with environment, release commit, workflow run, browser-session, and per-error correlation IDs. Authentication, Firestore, routing, write-coordinator, version-conflict, Monthly Review conflict, and unhandled failures use the same event contract.

See [Operational observability](./observability.md) for the event privacy boundary, covered failure surfaces, and the current sink limitation.

## Rollback

The separate `Rollback` workflow can restore Hosting or Firestore rules from a full, previously verified commit SHA. It rebuilds or tests the target source, deploys only the selected component, runs environment-appropriate verification, and retains a rollback evidence artifact. It never restores Firestore data or moves a protected branch.

Follow [Firebase rollback runbook](./rollback-runbook.md) for target selection, exact confirmations, component-specific behavior, emergency fallback, and the required roll-forward PR.
