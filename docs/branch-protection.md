# Branch protection

Applied to `dsadasivani/budget-battowski` on 2026-08-15:

## `develop`

- Require a pull request before merging feature branches.
- Accept pull requests only from branches matching `feature/*`.
- Require the `branch-policy`, `quality`, and `dependency-security` status checks to pass.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Block force pushes and branch deletion.
- Allow repository administrators to bypass protection only for emergency recovery.

## `master`

- Require a pull request before merging.
- Promote only from `develop`.
- Require the lightweight `branch-policy` check, which rejects any other source branch.
- Do not repeat CI status checks already completed on the feature pull request to `develop`.
- Require conversation resolution before merging.
- Block force pushes and branch deletion.
- Allow repository administrators to bypass protection only for emergency recovery.

The repository belongs to a personal GitHub account, so organization-only user and team bypass lists are unavailable. Administrator bypass is represented by leaving administrator enforcement disabled.

Keep QA regression outside the mandatory pull-request check because it uses external Firebase accounts and credentials. Store any QA credentials only in GitHub Actions secrets.

The `dependency-security` check runs `npm audit --audit-level=high` against production and development dependencies. High or critical findings block feature pull requests from merging into `develop`.

The `branch-policy` check enforces the only supported paths: `feature/*` to `develop`, followed by `develop` to `master`.

The `production` GitHub Environment currently restricts deployments to protected branches. Because the repository currently has one collaborator, independent required-reviewer approval is unavailable. If a second trusted collaborator is added, configure that person as a required production reviewer and prevent self-review for both normal production deployment and rollback. Rollback input validation requires production runs from `master` and QA runs from `develop`; Workload Identity Federation independently enforces the same branch/environment pairing.
