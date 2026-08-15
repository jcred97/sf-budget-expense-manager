# Repository and Checkout Rename Plan

## Current State

- GitHub repository: `jcred97/sf-spendly`
- Git remote: `https://github.com/jcred97/sf-spendly.git`
- Local checkout: `F:\Salesforce\Personal\sf-spendly`
- Branch and pre-rebrand commit: `main` at `7881645b558050f1599e6ec0be8fb1e9bda66f61`
- Intended GitHub repository and local directory: `sf-budget-expense-manager`
- Intended remote: `https://github.com/jcred97/sf-budget-expense-manager.git`

The Salesforce DX project name is already `sf-budget-expense-manager`, while `mainDevOrg` remains unpackaged and unnamespaced. The API rebrand and approved legacy cleanup are deployed and verified. No commit, push, GitHub rename, local-directory rename, managed-package creation, or namespace deployment has been performed as part of this remaining workstream.

## Preconditions

1. Review the complete dirty worktree and confirm the source/documentation commit scope.
2. Preserve the Git-ignored settings rollback backup under `scripts/migration/backups/legacy-spendly-2026-08-15/` outside any operation that could discard the checkout.
3. Create a local commit checkpoint only after explicit approval. Do not include `AGENTS.md` or `agent-docs/` unless the user explicitly approves committing local agent notes.
4. Push only after separate explicit approval.

## Execution Order

1. Create the approved local commit checkpoint for the completed API rebrand and cleanup.
2. Rename the GitHub repository from `sf-spendly` to `sf-budget-expense-manager`.
3. Update `origin` to `https://github.com/jcred97/sf-budget-expense-manager.git` and verify both fetch and push URLs.
4. Close tools holding the checkout open, then rename `F:\Salesforce\Personal\sf-spendly` to `F:\Salesforce\Personal\sf-budget-expense-manager` from the parent directory.
5. Reopen the renamed workspace and verify:
    - `git status`
    - `git remote -v`
    - `git branch --show-current`
    - `npm run lint`
    - Salesforce CLI access to `mainDevOrg`
6. Update the repository tree labels and any remaining intentional checkout-path references after the directory rename is complete.

## Invariants

- Repository and directory renaming must not deploy Salesforce metadata, change records, alter the active scheduler, create a package, or apply the `bemgr` namespace.
- Keep the Git history, current branch, and configured remotes intact apart from the explicit `origin` URL change.
- Do not recreate or remove Salesforce metadata as part of this workstream.
- Do not remove the ignored rollback backup until the user explicitly ends the rollback-retention period.

## Clarifications

- The target name is `sf-budget-expense-manager` for both GitHub and the local checkout.
- This plan records the next step only; it does not authorize a commit, push, remote mutation, GitHub rename, or filesystem move by itself.
