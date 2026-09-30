# Repository and Checkout Rename Record

## Current Source Snapshot — 2026-09-30

Application HEAD is `6d0e13d`. The three screen components own their workflows; the manager owns group/navigation/shared lookups and cross-screen refresh. All 66 Jest tests in 9 suites and lint passed during the review; Apex and live-org state were not rechecked. Latest refactor deployment and obsolete-metadata cleanup remain deferred. Current checkout: `F:\Software Development\Salesforce\Personal\sf-budget-expense-manager`.

See [architecture](../architecture.md), [current verification](../testing-and-tooling.md#current-verification--2026-09-30), and [open findings](../review-findings.md). The historical record below is retained; its older paths, line counts, and pending-work statements do not override this snapshot.

## Historical Record

## State Recorded During the Repository Rename

- GitHub repository: `jcred97/sf-budget-expense-manager`
- Git remote: `https://github.com/jcred97/sf-budget-expense-manager.git`
- Local checkout: `F:\Salesforce\Personal\sf-budget-expense-manager`
- Branch: `main`, tracking `origin/main`
- Rebrand commit: `50e1eeb8aa80f9a28cf1bef305ce3fd7f9e8ef41`
- Pre-rebrand commit: `7881645b558050f1599e6ec0be8fb1e9bda66f61`

The repository-identity workstream is complete. The API rebrand and approved legacy cleanup are deployed and verified, the rebrand commit is pushed, and the GitHub repository, Git remote, local checkout, and Salesforce DX project all use `sf-budget-expense-manager`.

`mainDevOrg` remains unpackaged and unnamespaced. Completing the repository rename did not create a managed package, apply the `bemgr` namespace to the org, deploy metadata, change Salesforce records, or alter the recurring scheduler.

## Completed Work

1. Committed the Spendly-to-Budget & Expense Manager API rebrand and cleanup record as `50e1eeb`.
2. Pushed `main`; the local branch now tracks `origin/main` at the same commit.
3. Renamed the GitHub repository from `jcred97/sf-spendly` to `jcred97/sf-budget-expense-manager`.
4. Updated both fetch and push URLs for `origin` to `https://github.com/jcred97/sf-budget-expense-manager.git`.
5. Renamed the checkout from `F:\Salesforce\Personal\sf-spendly` to `F:\Salesforce\Personal\sf-budget-expense-manager` and reopened the workspace there.
6. Verified the repository root, active branch, upstream, remote URLs, clean post-rename worktree, and retained Git history.

The settings rollback backup and one-off migration scripts were intentionally removed from this app repository after the verified cutovers. Future migrations must create separately retained, Git-ignored rollback artifacts rather than restoring historical scripts here.

## Clarifications

- `sf-budget-expense-manager` is now the canonical repository and checkout name.
- Historical references to `sf-spendly`, Spendly metadata, and the pre-rebrand commit remain where needed for audit, migration, or rollback.
- Future managed-package and unpackaged-to-namespaced data-migration work remains separate from this completed repository rename.
