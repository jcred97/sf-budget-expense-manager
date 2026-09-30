# Testing And Tooling

## Current Verification — 2026-09-30

- Reviewed application source at `6d0e13d`; the latest simplification and test-organization commits are pushed to `origin/main`.
- `npm run lint` passed. Jest passed **66 tests in 9 suites** (workspace integration, dashboard, expense list, recurring screen, expense modal, recurring view model, expense transforms, workspace data, CSV export).
- There are **18 Apex test classes** in source. No Apex execution, new coverage measurement, org inspection, or deployment was performed in the architecture review.
- Deployment of the latest simplifications and cleanup of obsolete org metadata remain deferred. Historical job IDs, record counts, coverage and deployment results in the history are evidence from their recorded workstreams, not current live-org checks.
- Open issues and separate capacity/coverage limitations are tracked in [review findings](review-findings.md). No issue is marked fixed by this documentation update.
- Screen tests now live beside `expenseDashboard`, `expenseList`, and `recurringExpenses`; the manager suite retains shared lookup, navigation, and cross-screen tests.
- Settings follow-up: five dedicated Jest regression tests and repository lint passed for the load/save protection fix. Coverage includes pending/failed loads, retry, failed refresh, empty responses, and duplicate-save/refresh exclusion. This fix has not been deployed.
- Missing direct frontend coverage: budget panel/dialog, recurring modal, FX interactions, and actual browser print pagination/layout.
- Current precommit hooks run ESLint and related Jest tests. Formatting is opt-in; the formatting configuration changes mentioned in older entries were subsequently committed (`c4911c3`).

For this Windows checkout, the verified local command used a writable external Jest cache:

```powershell
npm run test:unit -- -- --runInBand --cacheDirectory 'C:/Users/jcdre/.codex/visualizations/2026/09/25/01a0d739-a173-7f81-8042-e9735969558f/jest-cache'
```

That cache path is machine-specific. Normal environments can use `npm run test:unit -- -- --runInBand`.

## Historical Evidence

The missing-schedule recovery follow-up adds four Apex regression methods covering default/repeated saves, same-time re-enable, removed jobs, and schedule health states. Check-only validation `0AfgK00000UzpUBSAZ` against `mainDevOrg` on 2026-09-30 passed **19/19 tests** across `BudgetExpenseSettingsServiceTest`, `RecurringExpenseBatchTest`, and `RecurringExpenseSchedulerTest`. Service coverage was **93.14%** (163/175 executable lines). No source changes were deployed. The user-approved temporary Deployment Settings option was restored to disabled and its successful save verified. Original recurring job `08egK00000hRaZiQAK` remained WAITING with cron `0 0 8 * * ?`, timezone `Asia/Manila`, and next run `2026-10-01T00:00:00Z`.

Earlier attempts: `0AfgK00000V0CVZSA3` was blocked by the pending-job setting before tests ran. `0AfgK00000V0FYHSA3` compiled but exposed a test-isolation issue: CronTrigger queries can see an existing org job. The new recovery tests now use a test-only schedule-name override to exercise missing jobs independently of the real schedule.

See the [verification log](history/verification-log.md) for earlier test runs and deployments. Those records do not establish the current org state.

## Test Scope

LWC tests use `sfdx-lwc-jest`; an invocation with `--passWithNoTests` alone does not demonstrate behavior coverage. Apex tests cover expense queries and commands, Bank assignments, budgets, currency integrity and callouts, recurring calculation and generation, batch/scheduler behavior, handlers, and settings. Discover the current classes under `force-app/main/default/classes/test/`.

Batch failure tests inject job-error snapshots rather than real failed asynchronous chunks. Aborted jobs and start/finish failures need separate monitoring; stale-snapshot tests do not establish concurrent multi-transaction performance.

## Formatting

Prettier is opt-in. `.prettierrc` uses width 140 for Apex `.cls`/`.trigger` files and 100 for other files. Workspace VS Code settings disable automatic formatting. Use `npm run prettier` or `npm run prettier:verify` explicitly; precommit runs ESLint and related Jest checks.

## Scheduler Deployments

Pending recurring Apex jobs can block deployments of their dependency graph depending on the org Deployment Settings. Inspect the target org before planning a cutover; do not abort schedules for ordinary diagnostics. Any required pause and restore must preserve the schedule owner, timezone, and cron expression and use separately reviewed tooling. The old temporary scheduler scripts are no longer shipped in this repository.

## Tooling

- ESLint with Aura and LWC recommended rules
- Prettier with Apex and XML plugins
- Husky pre-commit hooks
- lint-staged
- Jest ignores `.localdevserver`

The repository-wide `npm run prettier:verify` command currently reports legacy formatting debt. Run targeted checks on files changed by the current task instead of formatting unrelated files.

## Destructive Deploy

The Git-ignored `destructive/` directory can be used for temporary destructive manifests. Verify every member against local references and the target org before running it:

```bash
sf project deploy start --dry-run --manifest destructive/package.xml --post-destructive-changes destructive/destructiveChanges.xml --target-org your-org-alias
```

Run the same command without `--dry-run` only after the validation succeeds. Historically, a destructive deployment removed the legacy `spendlyDataTransforms` bundle after its then-replacement was deployed. The completed API-rebrand cleanup used the reviewed `manifest/legacy-spendly-destructive.xml` file with `manifest/empty-package.xml`; neither validation nor deployment used purge-on-delete.

The completed same-org migration scripts were intentionally removed from this app repository after verification. A future unpackaged-to-`bemgr` managed-package data migration is a separate workstream and must use separately reviewed tooling and rollback artifacts.

## Currency

`Budget_Expense_Manager_Setting__c.Base_Currency_Code__c` is the stable app reporting-currency foundation. The non-cacheable admin settings path initializes a blank value once; the cacheable currency-context endpoint only reads the persisted value. The Salesforce provider uses `UserInfo.getDefaultCurrency()` in single-currency orgs and a system-mode dynamic corporate `CurrencyType` query in multi-currency orgs. This foundation does not yet replace the PHP-specific FX fields, calculations, or UI formatting.

`Expense__c.Amount__c`, budgets, totals, averages, charts, and monthly trends are canonical PHP (Philippine Peso). Shared PHP and optional ISO-currency display formatting is centralized in `expenseFormatters` with cached `Intl.NumberFormat` instances; view models and expense transforms provide formatted values to presentation components.

Optional foreign-currency Expenses store the original Number amount (4 decimals), three-letter code, PHP-per-unit Number rate (8 decimals), effective date, and source. These fields are all blank for an ordinary PHP Expense. The before-trigger service requires the full snapshot when any one is present and recalculates the PHP Currency amount with half-up precision. Recurring templates remain PHP-only in this version.

The public `Exchange_Rates_API` Named Credential points to `https://api.frankfurter.dev`; its `Exchange_Rates_Public` External Credential uses no authentication and permission-set principal access. Requests use Frankfurter v2's single-rate endpoint with `providers=ECB`. The provider's returned effective date is retained because weekend/holiday requests can resolve to a prior business day; observations older than seven days are rejected. These are informational reference estimates, so the modal supports a manual settled-rate fallback.
