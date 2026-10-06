# Testing And Tooling

## Guided First-Time Setup Verification — 2026-10-07

- The app entry checks readiness without creating settings. Administrators explicitly confirm PHP before initialization; regular users can check readiness without Settings CRUD. Optional LDS group/category creation does not gate completion. Fresh setup supports single-currency PHP organizations and leaves automation disabled; initialized installations retain their currency, automation, and time choices.
- Eleven setup UI tests and three manager routing regressions cover confirmation, waiting/retry, unsupported configuration, pending completion, incomplete responses, optional record submission, and workspace entry. Full Jest passed **240 tests across 22 suites**; lint and targeted frontend formatting passed. Lightning forms and Apex calls are mocked, so these checks do not establish live subscriber installation.
- Apex regressions cover restricted-user authorization/readiness, read-only checks, idempotent initialization, existing configuration preservation, direct Settings guards, currency policy, and genuine failed-insert recovery. Collision tests exercise the recovery boundary; they do not prove simultaneous transactions. Schedule assertions compare existing identities instead of assuming the org has no jobs.
- Existing Settings schedule reads use `CronTrigger WITH USER_MODE` and need platform privileges beyond the app Admin permission set on a minimal profile. Setup does not add those privileges. Settings success checks run as the org administrator, while setup authorization checks retain restricted users.
- Final check-only validation `0AfgK00000Vb6iySAB` against `mainDevOrg` compiled all **23 components** and passed **67/67 Apex tests**. Setup service coverage is **95.79%** (91/95); setup controller, status DTO, Settings controller, currency service, and settings trigger handler are **100%**. Settings service coverage is **86.50%** (141/163). No metadata was deployed.
- The previously authorized temporary Deployment Settings option was restored to disabled after validation. The original daily schedule retained its identity, owner, `Asia/Manila` timezone, and `0 0 8 * * ?` cron. A fresh namespaced subscriber install and upgrade remain unverified.
- Deployment to `mainDevOrg` succeeded on 2026-10-07 (`0AfgK00000Vbx2TSAR`), deploying all **23 components** and passing **67/67 Apex tests**. The temporary deployment option was restored afterward. The initialized org retained PHP reporting, enabled recurring automation, and its 08:00 run time.
- A live browser smoke check as the existing signed-in administrator opened the deployed main app directly into its Dashboard with the selected group and existing data. Fresh-org and separate normal-user browser checks remain manual follow-ups.

### Manual Setup Checks

1. In an initialized org, reopen the main app as an app Admin and normal User. Both should enter the workspace after the readiness check, with existing data and settings preserved. Do not clear the immutable base currency to simulate first use.
2. In a fresh disposable single-currency PHP org with the app deployed, assign `Budget_Expense_Manager_User` to a test user. The main app should show administrator guidance and Refresh, without initialization controls.
3. As a user assigned `Budget_Expense_Manager_Admin`, open the main app. Finish setup should remain disabled until the PHP confirmation is checked. Optionally create an Expense Group and Category; skipping creation must also allow completion.
4. Confirm PHP and finish setup. Verify the workspace opens and reopening bypasses the wizard. Refresh the normal user's waiting page and verify it opens the workspace too.
5. With sufficient platform permissions for Settings, verify fresh recurring automation is disabled and no app schedule was created. Banks, budgets, and FX configuration must not be required to complete setup.
6. In a separate fresh USD or multi-currency org, verify the unsupported-configuration message and disabled Finish action. Opening setup alone must not create customer records or initialize settings.

## Recurring Background Refresh Verification — 2026-10-07

- Recurring retains its last successful rows, totals, loaded pages, and empty state while refreshing on tab activation. A small SLDS refresh status replaces the full spinner once a snapshot exists. Initial loading and Expense Group changes retain the full loader. Successful refreshes reset to the latest first page; failures preserve cached pages/cursors with an inline warning and Retry.
- Six new regressions cover delayed activation refresh, fresh wire data arriving before refresh completion, promise/wire failures and retry, loaded empty groups, stale failures after group changes, and mutation-completion refresh overlapping activation refresh. Existing cases cover unchanged-wire success, stale page replies, and disconnect/reconnect. Visible row actions and Add are disabled during refresh, with handler guards.
- All **21 recurring-screen tests** and **226 tests across 21 suites** passed. Lint, targeted formatting, and diff checks passed. These frontend tests mock Apex refresh and wire delivery; live Salesforce timing is not established by the mocks.
- Check-only validation `0AfgK00000VbM7lSAF` and deployment `0AfgK00000VaaSxSAJ` succeeded against `mainDevOrg`, updating only the `recurringExpenses` LWC. No Apex tests were run for this LWC-only change.

## Workspace Navigation Visibility Verification — 2026-10-07

- Added scoped hidden-section rules for workspace Dashboard/Recurring wrappers and the expense-list screen. Navigation keeps all three screen instances mounted; the shared expense modal and print report remain outside the hidden expense section.
- Two regressions cover all three navigation choices, selection semantics, retained component instances, and the actual CSS cascade. The cascade test demonstrates that authored `section { display: block }` overrides native hidden behavior before applying repository styles, then verifies hidden sections render with `display: none` and active sections with `display: block`.
- A browser fixture using before/after repository styles inside shadow roots reproduced the override and verified each navigation choice shows only its selected section. This is controlled browser evidence, not an inspection of the exact overriding rule in the live Salesforce org.
- Full Jest passed **220 tests across 21 suites**; lint, targeted formatting, and diff checks passed. Salesforce check-only validation `0AfgK00000VbIKHSA3` compiled both changed LWC bundles successfully with `NoTestRun`; no Apex tests were run.
- Deployment to `mainDevOrg` succeeded on 2026-10-07 (`0AfgK00000VbKh3SAF`), updating the `budgetExpenseManager` and `expenseList` LWC bundles. No Apex tests were run for this CSS-only deployment.

## Recurring Editor Lifecycle Regression Coverage — 2026-10-07

- Added a dedicated recurring-modal suite covering independent form/record loading, initial form errors, context Retry success/rejection/incomplete reload, stale retry completion after close/reopen or record changes, reversed-date correction, native-validation rejection, pending-save guards, save-error recovery, and create/edit success events.
- Save-error tests verify retained name, category, bank, and transaction type, plus the retried submission payload. Pending-save checks verify disabled controls, rejected duplicate submission, and blocked closure. Synthetic events exercise handler guards rather than claiming disabled controls accept normal user input.
- Lightning wire responses, refresh notifications, field validity, and record-form submission are mocked. These tests verify component behavior; they do not establish live LDS refresh semantics, persistence, or actual browser rendering. Existing shared payment-method regressions remain separate.
- All **15 new tests** passed; full Jest passed **218 tests across 21 suites**. Lint, targeted test formatting, and diff checks passed. No runtime defect was reproduced and no runtime source or metadata changed, so no deployment or Apex execution was required.

## Recurring No Bank Selection Verification — 2026-10-04

- Recurring bank options and the inactive-bank notice now use the normalized assignment value. Selecting No bank produces one option, clears the inactive-bank notice, and submits Cash with both bank fields cleared. Actual inactive assignments retain their historical edit behavior and reactivation guard.
- Before the fix, three new cases failed for active, inactive, and legacy banks. After the fix, all **34 payment-method tests** passed, including untouched inactive-bank saves and blocked reactivation. These tests inspect mocked Lightning form submissions; they do not replace live browser testing.
- Full Jest passed **203 tests across 20 suites**; lint and targeted formatting passed. Salesforce check-only validation `0AfgK00000VLMuwSAH` compiled the `recurringExpenseModal` LWC successfully. No Apex tests were run for this LWC-only validation.

## FX Regression Coverage Verification — 2026-10-04

- Added **52 regression tests across four suites** without changing runtime code: 12 quote-lifecycle cases, eight modal snapshot cases, 27 decimal conversion cases, and five exchange-rate request cases. The existing three Save & New tests remain.
- Quote tests verify stale success/failure after date/currency changes, manual-rate precedence, close/reopen and disconnect cancellation, FX toggle cancellation, Save blocking while fetching, and incomplete/network quote recovery. Some queued-input cases dispatch synthetic changes while controls are disabled, exercising cancellation guards rather than claiming those changes are available during a normal fetch.
- Snapshot tests inspect the actual record-form submission fields, including `1 × 1.005 → PHP 1.01`, complete rate/date/source data, PHP toggle clearing all five FX fields while retaining the converted amount, edit/duplicate snapshot preservation, and invalid/incomplete FX blocking. Lightning validation and Apex calls are mocked; these are frontend regressions, not live-org validation.
- Decimal tests cover half-cent ties, values just below a tie, carry into whole pesos, high precision, scientific notation, zero, and invalid inputs. Request tests verify the original currency/date, omitted-date normalization, and server result/error preservation using the actual Apex quote field names.
- Full Jest passed **199 tests across 20 suites**; lint, targeted formatting, and diff checks passed. No FX defect was reproduced. No runtime source or metadata changed, so no deployment or fresh Apex execution was required.

## Budget Retry Isolation Verification — 2026-10-04

- Budget retry responses now require the current request version. Selection changes and disconnect invalidate older retries; each retry captures its original wire result. The change preserves current errors and loading state, blocks duplicate pending retries, and handles switching away and back to the same group/month.
- Before the fix, seven stale-response regression cases failed and the current-selection recovery case passed. After the fix, all **nine budget-panel tests** passed, including duplicate retry protection, group/month switches, stale success/failure, a newer pending retry, and disconnect/reconnect.
- Full Jest passed **147 tests across 16 suites**. Lint, targeted formatting, and diff checks passed. Salesforce check-only validation `0AfgK00000VKeSTSA1` compiled the `budgetPanel` LWC successfully; no Apex tests were run for this LWC-only change.
- Deployment to `mainDevOrg` succeeded on 2026-10-04 (`0AfgK00000VKfJhSAL`), updating only the `budgetPanel` LWC. No Apex tests were run for this LWC-only deployment. Existing budget save/delete behavior is outside this fix.

## Recurring Catch-up Warning Verification — 2026-10-04

- Source retains generation-limit flags across batch chunks and persists an internal outcome keyed to the exact Salesforce job. Both manual-run screens warn that catch-up may remain and offer an explicit rerun; the daily scheduler does not chain more batches. Failed chunks retain priority over warnings, and missing historical outcomes are reported as unknown.
- Combined check-only validation `0AfgK00000VJj7eSAD` against `mainDevOrg` passed **55/55 Apex tests** and all **14 components**. Batch, automation controller, and run-status DTO coverage is **100%**; recurring service coverage is **96.30%** (52/54), and settings service coverage is **94.48%** (154/163).
- Actual generation tests lower the cap to two expenses, verify the first ungenerated pointer, resume from a stale candidate without duplicate dates, and distinguish exact-cap completion from unfinished catch-up. Outcome tests cover job isolation from latest settings, missing historical outcomes, and rejection of another user's job even when its outcome exists. Tests do not establish concurrent multi-transaction behavior.
- Jest passed **138 tests across 15 suites**; lint, targeted formatting, and diff checks passed. UI regressions cover both warning screens, terminal refresh, explicit reruns, unknown outcomes, errors taking precedence, and rejection of mismatched job replies.
- Initial check-only validation `0AfgK00000VJnj8SAD` was blocked by the existing daily scheduled job. The previously authorized temporary Deployment Settings option was enabled for validation and restored to disabled afterward. The original schedule `08egK00000hRaZiQAK` retained its ID, owner, `Asia/Manila` timezone, and `0 0 8 * * ?` cron.
- Deployment to `mainDevOrg` succeeded on 2026-10-04 (`0AfgK00000VJrl7SAD`): all **14 components** deployed and **55/55 Apex tests** passed. The temporary Deployment Settings option was restored to disabled, and the original daily schedule retained its identity, owner, timezone, and cron.
- This change adds one private outcome record per finished job; automated retention cleanup is not implemented.

## Dashboard Aggregate Verification — 2026-10-04

- Source replaces the dashboard's full matching expense-row read with `ExpenseController.getDashboardSummary()`. Complete summary aggregates drive totals, counts, charts, insights, empty states, and budget spending; detail payload contains at most five recent expenses and one largest expense. Six-month trend and budget history remain separate reads.
- Final combined check-only validation `0AfgK00000VJUOjSAP` compiled all nine components and passed **43/43 Apex tests** across dashboard service, expense controller, expense pagination, and budgets. `ExpenseDashboardService` coverage is **93.46%** (100/107 executable lines); controller and all three new DTOs are **100%**.
- Regression fixtures include **1,006 matching expenses**, complete totals independent of five recent rows, group/category/month predicates, merged category/bank names, inactive historical assignments, top-bank count ranking and ties, highest day, null/negative amounts, undated buckets, empty scopes, and deterministic recent/largest ordering.
- Jest passed **132 tests across 15 suites**, including aggregate summary presentation and budget spending, bounded detail mapping with FX/inactive-bank context, stale group replies, summary memoization, and unchanged report/list/recurring behavior. Lint, targeted formatting, and diff checks passed.
- Deployment to `mainDevOrg` succeeded on 2026-10-04 (`0AfgK00000VJZufSAH`): all nine components deployed and **43/43 Apex tests** passed.
- Dashboard expense-detail payload is bounded; Salesforce aggregate-group/query governors and full bank-chart cardinality remain limits.

## Recurring Batch Tracking Verification — 2026-10-04

- Both manual-run screens share job-specific progress tracking. Terminal jobs refresh results once; failed/aborted jobs also refresh partial writes. Polling failures and the 150-check limit preserve the pending job and run guard, with an explicit Retry status check.
- Jest passed **128 tests across 14 suites**. Coverage includes delayed completion, completed-with-errors, failed/aborted jobs, retry and polling limits, duplicate submission, cross-screen tracking, disconnect during status/enqueue requests, group/navigation changes, terminal replay, and stale settings reads. Lint, targeted formatting, and diff checks passed.
- Check-only Apex validation `0AfgK00000VJRHBSA5` passed **35/35 tests** across the automation controller, recurring service, batch, and scheduler. `RecurringExpenseAutomationController` coverage is **100%** (32/32 executable lines). The status endpoint rejects other users' jobs, unrelated job types/classes, and invalid inputs.
- Final combined check-only validation `0AfgK00000VJSmjSAH` compiled all seven changed/new components with no errors; it used `NoTestRun` because the unchanged Apex package had already passed the focused validation above. Deployment `0AfgK00000VJSunSAH` then deployed all seven components to `mainDevOrg` and passed **35/35 Apex tests**, with **100%** controller coverage.
- Tracking is retained in page memory during navigation/disconnect and resumes on reconnect. It does not recover active runs across full browser reloads or separate tabs. The minimally privileged Admin permission-set/profile combination has not been separately exercised in a live browser; Apex tests validate ownership using the same profile as the validation user.

## Manual Automation Permission Verification — 2026-10-04

- Source now gates Run Recurring in both UI entry points with `Manage_Recurring_Expense_Automation`, granted only to Admin and All Access. The User permission set and existing Apex authorization are unchanged.
- Jest passed **116 tests across 13 suites**. Regression checks cover denied visibility and handler invocation, retained Refresh/template management, permitted runs, and duplicate-request prevention. Lint and targeted formatting checks passed.
- Check-only validation `0AfgK00000VJ5gVSAT` and deployment `0AfgK00000VJHo5SAH` succeeded for the custom permission, two permission sets, and two LWC bundles. `NoTestRun` was used because no Apex changed; these operations ran no Apex tests. The permission fix is deployed to `mainDevOrg`.

## Schedule Recovery Deployment — 2026-10-04

- Schedule recovery is deployed to `mainDevOrg`. Check-only validation `0AfgK00000VJEBtSAP` and deployment `0AfgK00000VJEF7SAP` each passed **25/25 tests** across the settings service, settings trigger handler, recurring batch, and scheduler test classes.
- `BudgetExpenseSettingsService` coverage is **93.14%** (163/175 executable lines). Live source inspection confirmed the recovery helper is present.
- Existing recurring job `08egK00000hRaZiQAK` remains WAITING with the same owner, cron `0 0 8 * * ?`, timezone `Asia/Manila`, and next run `2026-10-05T00:00:00Z`.
- The user-approved temporary Deployment Settings option allowing deployment with pending Apex jobs was restored to disabled after deployment. No live schedule was aborted or recreated.

## Recurring Pagination Verification — 2026-10-03

- Recurring overview pagination and complete summaries are deployed to `mainDevOrg`; deployment `0AfgK00000VH2I5SAL` succeeded with **154/154 Apex tests** across all 18 repository test classes.
- Full check-only validation `0AfgK00000VH1U5SAL` passed **154/154 tests**. Final focused validation `0AfgK00000VH2BdSAL` passed **25/25 tests**, including traversal across 507 matching templates, null-date/active-status cursor boundaries, complete totals, ended-schedule catch-up, and invalid cursors.
- `ExpenseQueryService` coverage is **99.47%** (187/188 executable lines); recurring controller and overview DTO coverage are **100%**.
- Jest passed **111 tests across 11 suites**. Lint and targeted frontend formatting checks passed. Paging tests cover full-result summaries, retry, stale group/refresh responses, disconnection, duplicate rows, and looping cursors.
- `Due_For_Generation__c` is a read-only formula; its deployment needs no record initialization. All three supplied permission sets grant read access without edit access.

## Review Baseline — 2026-09-30

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
