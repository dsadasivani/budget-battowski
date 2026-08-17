# Firebase rollback runbook

The `Rollback` GitHub Actions workflow restores one Firebase component from an older, previously verified Git commit. It creates a new deployment from that source; it does not move `develop` or `master`, rewrite Git history, or restore Firestore data.

Use a rollback only to reduce active incident impact. After service is stable, merge a corrective or revert pull request so the next normal CD run cannot redeploy the faulty state.

## Workflow availability

GitHub dispatches a manual workflow only when that workflow file exists on the repository's default branch. This repository's default branch is `master`, so `.github/workflows/rollback.yml` must first be promoted to `master` before either QA or production rollback can be started. After that promotion, select `develop` as the workflow ref for QA and `master` for production. See [GitHub's manual workflow documentation](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow).

## Safety model

The workflow enforces all of the following before authentication or deployment:

- QA runs are started from `develop`; production runs are started from `master`.
- The target is a full 40-character commit SHA, not a mutable branch or tag.
- The target differs from the workflow control commit.
- The target is a strict ancestor of the protected environment branch.
- The operator supplies a ticket ID or URL and types an environment/component-specific confirmation.
- The existing environment-specific Workload Identity provider and service account perform the deployment.
- Rollback and normal CD jobs share the same environment concurrency group, so they cannot deploy concurrently.

The repository currently has one collaborator, so the `production` GitHub Environment cannot provide independent two-person approval. Its protected-branch policy, exact confirmation, incident reference, immutable target, and Workload Identity restrictions are the enforceable compensating controls. If a second trusted collaborator is added, configure that person as a required production reviewer and prevent self-review. QA may remain approval-free for rehearsal and incident diagnosis.

## Select a target

Use a commit from a retained successful release-evidence artifact. Confirm that the artifact's environment, commit, detailed verification result, and checksum are valid. Copy the full SHA from `release-evidence.json`; do not expand a short SHA manually or select a commit merely because it is older.

Rollback candidates must still contain a valid lockfile and build/test configuration. The workflow intentionally rebuilds from the target source rather than trusting mutable local output.

## Start a rollback

1. Open **Actions → Rollback → Run workflow**.
2. Select workflow branch `develop` for QA or `master` for production.
3. Select `qa` or `production`.
4. Select exactly one component: `hosting` or `firestore-rules`.
5. Paste the full target commit and the incident reference.
6. Enter the exact confirmation:

   - `ROLLBACK QA HOSTING`
   - `ROLLBACK QA FIRESTORE-RULES`
   - `ROLLBACK PRODUCTION HOSTING`
   - `ROLLBACK PRODUCTION FIRESTORE-RULES`

7. For production, record any available peer approval in the incident ticket. If a required Environment reviewer has been configured, obtain that approval in GitHub.
8. Watch every gate through deployed verification; a successful Firebase deploy alone is not a successful rollback.

## Hosting rollback

Hosting rollback rebuilds the selected commit using its locked dependencies and the environment-specific Angular configuration. It stamps a fresh `/release.json` containing the restored source commit and rollback workflow run, then deploys only Firebase Hosting.

- QA verification resets the disposable QA workspace and runs the authenticated regression.
- Production verification runs the anonymous, read-only smoke and requires `/release.json` to match the rollback target.
- Firestore rules and Firestore data are not changed.

If the selected UI is too old to satisfy the current regression contract, stop and select the nearest known-good compatible release. Do not weaken the standard verifier during an incident.

## Firestore rules rollback

Rules rollback runs the target commit's full Firestore emulator suite before deploying only `firestore:rules`.

- QA then resets its disposable workspace and runs the authenticated regression against the deployed rules.
- Production runs the read-only application smoke as a post-deployment safety check. Production financial writes are never synthesized.
- Hosting and Firestore data are not changed.

A rules rollback can change which current clients are authorized. Review compatibility between the target rules and the currently hosted application before approval. If both Hosting and rules are faulty, use separate workflow runs in incident-priority order; there is no false claim of an atomic two-service rollback.

## Evidence and completion

Every attempt retains `ROLLBACK_EVIDENCE.md`, `rollback-evidence.json`, and the available QA regression or production smoke report. QA artifacts are retained for 30 days and production artifacts for 90 days. Failed attempts retain evidence when the controller checkout was available.

The incident is stabilized only when:

- the workflow result and rollback evidence both pass;
- the target commit shown by the evidence is the intended commit;
- the deployed verification report passes;
- monitoring shows the incident impact has stopped; and
- a follow-up PR is open to reconcile the protected branch with the deployed component state.

Record the rollback run URL in the incident ticket. Do not treat an emergency deployment as a permanent substitute for source control.

## If the workflow cannot run

Prefer restoring GitHub Actions, Workload Identity Federation, or the environment approval path. If incident severity requires an emergency console rollback before automation is available:

- Hosting may be rolled back from Firebase Console's Hosting release history to an explicitly verified release.
- Firestore rules must be redeployed from a reviewed clean checkout of the exact known-good commit; never edit rules ad hoc in the Firebase Console.

Require two-person verification, run the same post-deployment checks, preserve screenshots and command output in the incident record, and attach equivalent evidence as soon as the control plane is restored.

## Roll forward

Rollback does not resolve the faulty branch commit. Create a feature branch from `develop`, implement or revert the defect, pass normal CI and QA CD, then promote through the usual `develop` → `master` path. A normal successful deployment supersedes the emergency rollback and returns the environment to branch-aligned state.
