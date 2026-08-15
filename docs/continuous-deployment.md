# Continuous deployment

The `CD` GitHub Actions workflow deploys Firestore rules and Firebase Hosting with keyless Google Workload Identity Federation.

## Release policy

- Feature branches are cut from `develop` and merged back through a pull request.
- Pull requests targeting `develop` must pass the `quality` and `dependency-security` CI checks.
- A merge to `develop` automatically deploys Firestore rules and Hosting to QA.
- A pull request promotes the already-validated `develop` revision to `master` without repeating CI; the `promotion-policy` check only verifies the source branch.
- A merge to `master` automatically deploys Firestore rules and Hosting to production.
- QA and production can be redeployed manually only from `develop` and `master`, respectively.
- QA and production use separate Google Cloud service accounts and identity providers.

## GitHub Environment variables

Each `qa` and `production` Environment defines:

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

These values identify cloud resources but are not credentials or secrets. The workflow exchanges GitHub's short-lived OIDC token for short-lived Google credentials.

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
3. Run the QA regression suite against the deployed QA project.
4. Open a `develop` to `master` pull request and merge it after QA sign-off.
5. Confirm the production deployment updated Firestore rules and Hosting.

Do not add `QA_FIREBASE_PASSWORD` to this deployment workflow. QA regression remains separate from CD.
