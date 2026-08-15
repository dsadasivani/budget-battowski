#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${1:?Usage: setup-cd-wif.sh PROJECT_ID GITHUB_ENVIRONMENT}"
GITHUB_ENVIRONMENT="${2:?Usage: setup-cd-wif.sh PROJECT_ID GITHUB_ENVIRONMENT}"

if [[ "${GITHUB_ENVIRONMENT}" != "qa" && "${GITHUB_ENVIRONMENT}" != "production" ]]; then
  echo "GITHUB_ENVIRONMENT must be qa or production." >&2
  exit 1
fi

if [[ "${GITHUB_ENVIRONMENT}" == "qa" ]]; then
  EXPECTED_REF="refs/heads/develop"
else
  EXPECTED_REF="refs/heads/master"
fi

GITHUB_REPOSITORY_ID="1261735097"
POOL_ID="github-actions"
PROVIDER_ID="budget-battowski-${GITHUB_ENVIRONMENT}"
SERVICE_ACCOUNT_ID="firebase-cd"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.environment=assertion.environment"
ATTRIBUTE_CONDITION="assertion.repository_id == '${GITHUB_REPOSITORY_ID}' && assertion.environment == '${GITHUB_ENVIRONMENT}' && assertion.ref == '${EXPECTED_REF}'"

gcloud services enable \
  cloudresourcemanager.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  firebaserules.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  serviceusage.googleapis.com \
  sts.googleapis.com \
  --project="${PROJECT_ID}"

if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Budget Battowski ${GITHUB_ENVIRONMENT}" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="${ATTRIBUTE_MAPPING}" \
    --attribute-condition="${ATTRIBUTE_CONDITION}"
else
  gcloud iam workload-identity-pools providers update-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --attribute-mapping="${ATTRIBUTE_MAPPING}" \
    --attribute-condition="${ATTRIBUTE_CONDITION}"
fi

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_ID}" \
    --project="${PROJECT_ID}" \
    --display-name="Firebase CD"
fi

POOL_NAME="$(gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --format="value(name)")"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${GITHUB_REPOSITORY_ID}"

for role in \
  roles/firebase.viewer \
  roles/firebasehosting.admin \
  roles/firebaserules.admin \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --role="${role}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}"
done

PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --format="value(name)")"

echo "GCP_PROJECT_ID=${PROJECT_ID}"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=${PROVIDER_NAME}"
echo "GCP_SERVICE_ACCOUNT=${SERVICE_ACCOUNT_EMAIL}"
