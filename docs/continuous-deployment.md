# Continuous deployment

The `CD` GitHub Actions workflow deploys Firestore rules and Firebase Hosting with keyless Google Workload Identity Federation.

## Release policy

- Feature branches are cut from `develop` and merged back through a pull request.
- Pull requests targeting `develop` must pass the `quality` and `dependency-security` CI checks.
- A merge to `develop` automatically deploys Firestore rules and Hosting to QA.
- A pull request promotes the already-validated `develop` revision to `master` without repeating CI; the `branch-policy` check only verifies the source branch.
- A merge to `master` automatically deploys Firestore rules and Hosting to production.
- QA and production can be redeployed manually only from `develop` and `master`, respectively.
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
4. Download the `qa-firebase-regression-<run-id>` report artifact when detailed release evidence is required. Reports are retained for 30 days, including failed regression runs when a report was produced.
5. Open a `develop` to `master` pull request and merge it after QA sign-off.
6. Confirm the production deployment updated Firestore rules and Hosting.

The QA deployment is not considered successful when seeding or authenticated regression fails, even if Firebase rules and Hosting were released successfully. Fix the cause and redeploy `develop`; do not promote that revision to `master`.
