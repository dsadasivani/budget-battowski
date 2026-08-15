# `master` branch protection

Applied to `dsadasivani/budget-battowski` on 2026-08-15:

- Require a pull request before merging.
- Require the `quality` CI status check to pass.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Block force pushes.
- Block branch deletion.
- Allow repository administrators to bypass protection only for emergency recovery.

The repository belongs to a personal GitHub account, so organization-only user and team bypass lists are unavailable. Administrator bypass is represented by leaving administrator enforcement disabled.

Keep QA regression outside the mandatory pull-request check because it uses external Firebase accounts and credentials. Store any QA credentials only in GitHub Actions secrets.
