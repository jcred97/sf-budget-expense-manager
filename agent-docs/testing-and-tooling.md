# Testing And Tooling

## Apex Formatting — 2026-09-20

`.prettierrc` overrides `printWidth` to 140 for `.cls` and `.trigger` files; other file types retain 100. An in-memory formatting check confirmed that the user's three single-line calls/conditions in `RecurringExpenseBatch.cls` remain on one line. Config formatting and diff checks passed.

### Clarifications

Prettier is now opt-in: `package.json` no longer runs `prettier --write` through lint-staged, while ESLint and related Jest checks remain enabled. Workspace `.vscode/settings.json` disables format-on-save, format-on-paste, and format-on-type, with explicit save overrides for the repository's main languages. Manual `npm run prettier` and `npm run prettier:verify` remain available. JSON configuration and diff checks passed.

No repository-wide formatting was run. Manually invoking Prettier may still wrap longer expressions. These configuration changes are not committed or pushed.

## Apex Tests

### Expense-list server pagination — 2026-09-17

- `ExpenseController.getExpensePage(filters, pagination)` delegates to `ExpensePageService`, returns at most 200 rows, and uses user-mode queries for both records and first-page COUNT/SUM. Keyset cursors preserve date/time/CreatedDate/Id ordering and validate filter scope. The DTOs and test class are included in `manifest/package.xml`.
- Check-only validation `0AfgK00000TP7c6SAD` passed all 130 Apex tests with zero component failures, test failures, or coverage warnings. ExpensePageService (90/90), ExpenseController (14/14), ExpenseQueryService (128/128), and ExpensePageRequest (3/3) had 100% executable coverage. ExpensePageDto has no executable lines.
- New Apex tests cover full-filter totals, literal wildcard search, category/group/date search, picklist and canonical-bank search, null dates/times, tied sort keys, deleted anchors, invalid/filter-mismatched cursors, bounded sizes, and traversal of 2,030 records.
- All 14 Jest tests pass (11 new pagination/report tests plus 3 existing modal tests). New UI checks cover duplicate clicks, preserved selection/totals, stale responses, debounced search, retry, full CSV, complete DOM rendering before print, and cancellation after filter changes. Targeted ESLint and PMD recommended rules pass with zero findings.

#### Clarifications

- Deployed to `mainDevOrg` on 2026-09-19 as `0AfgK00000TmnXBSAZ`: all 10 components and 130 Apex tests passed with zero component errors, test errors, or coverage warnings. Committed and pushed to `origin/main` on 2026-09-20 as `30dc502` (`feat(expenses): add server-side pagination`); precommit formatting, ESLint, and related Jest checks passed. No recurring schedule changes were needed for validation or deployment.
- Final user-approved recheck on 2026-09-19 succeeded in `mainDevOrg` as `0AfgK00000TlnW1SAJ`, including the final client date-validation guard. All 130 Apex tests passed with zero component errors, test errors, or coverage warnings; changed executable Apex classes retained 100% coverage. The initial LWC-only check could not resolve the undeployed `ExpenseController.getExpensePage` method, so the successful combined check included all pagination Apex dependencies and UI bundles. This check-only validation preceded the successful deployment above.
- Pagination applies to the expense list. Dashboard loading still uses the existing full-row query/calculations. CSV and Print/PDF intentionally accumulate complete results only on demand, so very large reports still consume browser memory. Aggregate queries retain Salesforce governor limits.
- Pages do not provide a transactionally frozen snapshot across requests. Edits by another session may move rows; refreshing resets cursors and recomputes totals. Local save/delete actions reload from page one.

### Recurring batch failure reporting — 2026-09-16

- The batch finish handler queries its own `AsyncApexJob.NumberOfErrors` in user mode. Failed chunks produce `Failed` when no expenses were committed or `Completed with errors` when successful chunks created expenses. The existing Settings Last Run fields display the outcome, committed expense count, failed chunk count, and job ID. Both statuses were added to the restricted picklist.
- Two tests use deserialized read-only job snapshots to verify failure and partial-success reporting through the finish helper and persisted settings. Existing real batch runs exercise the job query and successful/empty completion paths.
- Final check-only validation `0AfgK00000TNvzNSAT` passed all 125 tests with no component errors, test errors, or coverage warnings. Focused PMD recommended rules found zero violations. Formatting and diff checks passed.
- Restored and verified the daily scheduler as the single active matching job `08egK00000g4qHzQAI`, `WAITING`, same owner, cron `0 0 8 * * ?`, timezone `Asia/Manila`, next fire `2026-09-17T00:00:00Z`.

#### Clarifications

- Deployed to `mainDevOrg` on 2026-09-17 as `0AfgK00000TPXmUSAX`: all 4 components and 125 tests passed with zero component errors, test errors, or coverage warnings. Committed and pushed to `origin/main` as `f2796bc` (`fix(recurring): report failed and partially successful batch runs`). No UI bundle changes were required.
- Daily schedule restored and verified as the single matching active job `08egK00000g6lYkQAI`, `WAITING`, original owner, cron `0 0 8 * * ?`, timezone `Asia/Manila`, next fire `2026-09-17T00:00:00Z` (08:00 local).
- This covers execute-chunk errors in jobs that reach `finish`. Aborted jobs, start failures, or failures within the finish handler itself require separate monitoring. Failure tests inject job error counts; they do not induce a platform-level failed asynchronous chunk.

### Recurring generation concurrency fix — 2026-09-13

- `RecurringExpenseGenerator` deduplicates candidate IDs, checks read access, locks accessible templates by ID with `FOR UPDATE`, and separately reloads current active records after obtaining the locks. Generation and pointer updates remain in the same transaction. Both manual and batch entry points use this boundary.
- Three new regressions cover a stale batch scope after manual generation, duplicate IDs plus updated amounts, and deactivated/deleted candidates. Existing catch-up, capped generation, bulk batch, and restricted-user tests remain included.
- Check-only validation `0AfgK00000T8tRdSAJ` passed all 123 Apex tests with no errors or coverage warnings. Generator coverage: 85/87 locations (97.70%). Focused `pmd:Recommended` analysis found zero violations; formatting and diff checks passed.
- Initial validation was blocked by the scheduler. An intermediate run exposed missing active-state revalidation, corrected before final validation.
- The idle recurring schedule was briefly paused and restored with its original owner, cron `0 0 8 * * ?`, and `Asia/Manila` timezone. Verified job `08egK00000fcGQzQAM` is the single active matching schedule, `WAITING`, with next fire `2026-09-13T00:00:00Z`.

#### Clarifications

- Committed and pushed to `origin/main` as `50ca593` (`fix(recurring): prevent duplicate expenses from overlapping runs`). Deployed to `mainDevOrg` on 2026-09-16 as `0AfgK00000TNeIbSAL`: both Apex components succeeded and all 123 specified tests passed with no component errors, test errors, or coverage warnings. Existing duplicate records were not modified.
- The daily scheduler was paused for deployment and restored as the single matching active job `08egK00000g21eTQAQ`, verified `WAITING` with the original owner, cron `0 0 8 * * ?`, timezone `Asia/Manila`, and next fire `2026-09-17T00:00:00Z` (08:00 local).
- Tests simulate stale snapshots deterministically; simultaneous multi-transaction testing was not performed. Lock contention can fail a run before writing. Batch failure-status reporting remains a separate issue.

Apex tests live in `BankAssignmentValidatorTest.cls`, `BankControllerTest.cls`, `BankTriggerHandlerTest.cls`, `ExpenseGroupBankTriggerHandlerTest.cls`, `ExpenseControllerTest.cls`, `ExchangeRateControllerTest.cls`, `ExpenseCurrencyServiceTest.cls`, `BudgetControllerTest.cls`, `BudgetTriggerHandlerTest.cls`, `RecurringExpenseTriggerHandlerTest.cls`, `BudgetExpenseSettingsTriggerHandlerTest.cls`, `CurrencyContextServiceTest.cls`, `RecurringExpenseBatchTest.cls`, `RecurringExpenseCalculatorTest.cls`, `RecurringExpenseServiceTest.cls`, `RecurringExpenseSchedulerTest.cls`, and `BudgetExpenseSettingsServiceTest.cls`.

The test setup creates:

- 2 expense groups: Food and Transport
- 3 categories: Groceries, Dining, Taxi
- 3 expenses with amounts 100, 200, and 300

Covered behavior includes:

- normalized unique global Bank keys and duplicate prevention
- unique Expense Group/Bank assignment keys, immutable Bank identity, and inactive-Bank rejection
- group-scoped active Bank selector options
- Expense and Recurring Expense assignment/group validation, active-choice validation, legacy fallback, and recurring-generation assignment copying
- `getAllExpenseGroups`
- `getCategoriesByExpenseGroup`
- `getExpensesByFilters`
- single expense delete
- bulk expense delete
- monthly trend data
- handled delete failures
- Frankfurter request construction, prior-business-day rates, PHP identity behavior, provider status/error mapping, malformed responses, and stale/future observation rejection
- optional foreign-currency snapshot completeness, normalization, bulk behavior, update recalculation, snapshot clearing, transaction-date validation, and exact half-up PHP rounding
- optional monthly budget opt-out, create, normalized lookup, update, group/month upsert, validation, ownership mismatch, and removal
- budget trigger month/key normalization, key regeneration, duplicate prevention, and invariant errors
- recurring expense trigger defaults for `Next_Run_Date__c`
- recurring expense batch generation for more than the manual run cap, default construction, and null run-date validation
- recurring expense next-run-date calculation for daily, weekly, monthly, and yearly frequencies
- recurring expense generation, catch-up behavior, end dates, inactive records, future records, manual batch start, and null run-date validation
- recurring generation under a restricted automation user while the generated link and next-run pointer remain read-only through FLS
- scheduled recurring expense generation
- Budget & Expense Manager Settings default creation, updates, singleton protection, and recurring run status tracking
- stable base-currency initialization/backfill, pinning, normalization, cacheable sanitized reads, and configuration errors

## Budget Analyzer Cleanup (2026-09-10)

`BudgetService` consolidates expense-group/month validation and reuses the monthly lookup after saving, removing duplicate query/helper code that triggered class-level cyclomatic complexity. `BudgetControllerTest.testBudgetHistoryValidation` now asserts the returned validation messages directly in the test method so PMD recognizes its assertions.

- Full-source recommended ESLint and PMD scan: 0 reported violations with existing inline suppressions retained; no new suppressions were added.
- Check-only validation `0AfgK00000StnrCSAR` in `mainDevOrg`: both changed classes compiled, all 12 budget tests passed, and `BudgetService` coverage was 98/104 lines (94.2%).
- Targeted Prettier and diff checks passed.

### Clarifications

These Apex changes were committed and pushed to `origin/main` as `7e488f4` (`fix: resolve budget Apex analyzer violations`). They remain check-only validated and have not been deployed. The Low CSS exceptions are unchanged, and this scan did not run Graph Engine.

## LWC Tests

LWC tests use `@salesforce/sfdx-lwc-jest`. `expenseModal/__tests__/expenseModal.test.js` covers delayed Save & New submission, field clearing with the modal staying open, duplicate in-flight submits, and regular Save after validation blocks Save & New. A Jest run with `--passWithNoTests` validates the test harness only when no tests are found and does not provide behavioral coverage in that case.

The Save & New timing fix (2026-09-10) preserves the selected action until submission instead of clearing it in a click microtask, protects the in-flight action from duplicate submissions, and restores initial-field focus after clearing the form. All three focused Jest tests, lint, targeted Prettier, and diff checks passed. Check-only validation `0AfgK00000Su6aUSAR` and deployment `0AfgK00000SuDTtSAN` each succeeded for the single `expenseModal` bundle in `mainDevOrg` with `NoTestRun` and zero component errors. Signed-in smoke testing is pending.

## Base Currency Context Workstream

The app now pins a reporting currency on the singleton settings record. First-time initialization
uses the Salesforce organization default in a single-currency org and the corporate currency in a
multi-currency org. A cacheable controller returns only the validated currency context; it never
performs initialization or DML. Validation rules require an uppercase three-letter ISO code and
prevent the initialized value from being changed or cleared.

Validation and deployment completed on 2026-09-01:

- A read-only `mainDevOrg` probe reported a single-currency organization with `PHP` as its default; no settings data or metadata was changed.
- Targeted Prettier, `git diff --check`, XML parsing, source/manifest inventory, and Salesforce source-to-Metadata-API conversion: passed.
- Targeted Salesforce Code Analyzer `pmd:Recommended` and `sfge:Recommended`: 0 findings at the Low threshold.
- The isolated Metadata API package contained exactly 17 base-currency components and zero foreign-exchange fields, classes, credentials, bundles, or references.
- Final corrected-package check-only deployment `0AfgK00000SD509SAD` compiled all 17 components and passed all 22 specified tests with zero component errors, test errors, or coverage warnings. `CurrencyContextController` and `CurrencyContextService` reported 100% coverage, `SalesforceOrganizationCurrencyProvider` 94.12%, and `BudgetExpenseSettingsService` 90.68%.
- Deployment `0AfgK00000SCailSAD` released the same 17 components to `mainDevOrg` and passed the same 22 tests with zero component errors, test errors, or coverage warnings. The package preserved the existing hidden Bank tab setting and excluded the foreign-exchange draft.
- The provider tests cover the single-currency default, the injected corporate-currency result, and the real `CurrencyType` query behavior in both single- and multi-currency organizations.
- The recurring schedule was restored as the only active job, `08egK00000eBB4RQAW`, in `WAITING` state with cron `0 0 8 * * ?`, timezone `Asia/Manila`, owner `005gK000034mODtQAM`, and next fire `2026-09-02T00:00:00.000+0000`.
- The deployed singleton field is available but remains blank. Pinning it to the organization currency is a separate persistent data initialization and remains pending explicit approval.
- No LWC Jest tests were added or run. No commit or push was performed.

## Foreign Exchange Workstream

### Deployment on 2026-09-06

- Compact modal follow-up `8f8dcb2`: paired Date/Time and Transaction Type/Bank using responsive SLDS columns, reduced FX panel spacing, and moved reference-rate guidance into field help. Lint, formatting, check-only deployment `0AfgK00000Se16xSAB`, and deployment `0AfgK00000SdcmsSAB` passed. The LWC-only deployments used `NoTestRun`; signed-in visual verification remains pending.

- Released the 34 components from currency commit `34f6da4`, with deployment fixes in `1802df2`, to `mainDevOrg`.
- Initial validation `0AfgK00000SdzDBSAZ` rejected the external credential's `NoAuthentication` protocol. The credential now uses `Custom` with no authentication headers or secrets.
- Validation `0AfgK00000SdzmfSAB` compiled metadata but exposed five test assertions counting `System.runAs` setup as service DML. Tests now compare against the DML count immediately before the lookup calls.
- Final check-only deployment `0AfgK00000SdqTGSAZ` and deployment `0AfgK00000SdlYRSAZ` passed all 120 specified Apex tests with zero component errors, test errors, or coverage warnings. Affected executable Apex coverage was 89.66%–100%.
- A read-only live USD-to-PHP lookup through `ExchangeRateController` and the deployed Named Credential succeeded with a positive PHP rate.
- Both source fixes were committed and pushed. Local agent notes remain uncommitted. No expense records or base-currency initialization were changed; signed-in UI smoke testing remains pending.

The optional Expense foreign-exchange path keeps `Amount__c` canonical in PHP while preserving a historical original amount, ISO currency code, PHP-per-unit rate, effective date, and source. Reference lookups use the public Frankfurter v2 endpoint through a no-auth Salesforce Named Credential and are pinned to ECB observations. Manual settled rates remain available when the provider is unavailable or a user needs the actual bank/card rate.

Local validation completed on 2026-08-28:

- Targeted Prettier, `npm run lint`, `git diff --check`, parsing of all 24 changed/new XML files, and Salesforce source-to-Metadata-API conversion: passed.
- Targeted Salesforce Code Analyzer `eslint:Recommended`, `pmd:Recommended`, and `sfge:Recommended`: 0 findings at the Low threshold.
- Eight exact decimal conversion cases, including the `1 × 1.005 = PHP 1.01` half-up boundary shared with Apex: passed.
- Source inventory contains 16 Apex test classes, including the two focused FX classes. Their org execution remains pending until the metadata is validated/deployed together.
- No LWC Jest tests were added or run. No org validation, deployment, commit, or push was performed.

## Modal Readiness Workstream

### Currency section styling — 2026-09-07

- Commit `717e692` uses a named section with an internal SLDS heading, a white SLDS box, a shaded SLDS conversion summary, and a separate rate-label row above the input/button row. The compact responsive modal layout remains in place.
- Formatting, ESLint, diff checks, check-only deployment `0AfgK00000SiX8FSAV`, and deployment `0AfgK00000SiOD0SAN` passed. Both deployments targeted only `expenseModal` in `mainDevOrg` with `NoTestRun` and zero component errors. Commit-hook Jest allowed no tests; signed-in visual verification remains pending.

The Expense and Recurring Expense dialogs now reveal their controls atomically after LDS form
metadata/record data and the group-scoped Category and Bank sources have settled. Their loading
state keeps fields mounted for LDS initialization, limits keyboard focus to visible recovery
controls, and exposes source-specific errors once loading ends. Category and Bank errors remain
retryable; an LDS form-load error keeps partial fields blocked and gives close/reopen guidance.
Expense Group context changes also close the Expense dialog through its full cleanup path so body
scroll, animation state, and document listeners cannot leak.

Local validation completed on 2026-08-27:

- Targeted Prettier, `npm run lint`, `git diff --check`, and local LWC compilation of all six
  changed JavaScript/template sources: passed.
- Targeted Salesforce Code Analyzer `eslint:Recommended`: 0 findings; 17 established inline
  suppressions were recognized.
- Focused check-only deployment `0AfgK00000RkPS7SAN` compiled all 3 LWC bundles and 16 files in
  `mainDevOrg` with zero component errors and `NoTestRun`.
- Deployment `0AfgK00000Rl1vaSAB` released the same 3 bundles and 16 files to `mainDevOrg` with
  zero component errors and `NoTestRun`.
- Runtime verification exposed a shared Category loader that could remain active when
  `refreshApex()` resolved without re-emitting unchanged wire data. The manager follow-up gives
  the latest group-scoped refresh sole ownership of settling that flag, clears it in a guarded
  `finally`, and invalidates in-flight refreshes when workspace context changes. Targeted
  Prettier, ESLint, local LWC compilation, `git diff --check`, and Code Analyzer passed with zero
  findings. Check-only deployment `0AfgK00000Rl8ozSAB` and deployment `0AfgK00000Rl9EnSAJ`
  each compiled and released the manager bundle successfully with `NoTestRun`.
- No LWC Jest tests were added or run. Signed-in smoke testing, commit, and push remain pending.

## LWC Boundary Refactor Workstream

The local follow-up after the Apex boundary deployment keeps Salesforce's required flat LWC
bundle layout while extracting shared presentation and infrastructure boundaries:
`expenseMonthNavigator`, `expensePrintReport`, `modalFocusUtils`, `expenseErrorUtils`,
`expenseWorkspaceData`, and `expenseWorkspaceViewModels`. The manager retains shared workspace
state, cacheable wire results, stale-response guards, mutations, and modal orchestration.

Local validation completed on 2026-08-21:

- Targeted Prettier, `npm run lint`, `git diff --check`, XML parsing, custom-import resolution, and exact source/manifest inventory: passed.
- The inventory contains 26/26 LWC bundles, and the local LWC compiler transformed all 51 JavaScript, HTML, and CSS sources successfully.
- Salesforce source-to-Metadata-API conversion: passed.
- Targeted Salesforce Code Analyzer `eslint:Recommended`: 0 findings. The full `--no-suppressions` LWC audit reports 143 established Low CSS exceptions across 10 files, two fewer than the prior 145 baseline; the additional file count reflects moving existing scoped month/print CSS into their owning bundles.
- The shared error normalizer was subsequently hardened for Apex, LDS/UI API, record-form, network, and JavaScript shapes. Its 11-case semantic check, targeted Prettier and ESLint, 51-file LWC compilation, `git diff --check`, and targeted `eslint:Recommended --no-suppressions` Code Analyzer scan passed with 0 findings.
- LWC-only check-only deployment `0AfgK00000RBEBOSA5` compiled all 12 affected bundles and 51 files successfully with `NoTestRun`.
- Deployment `0AfgK00000RBLRNSA5` released the same 12 bundles and 51 files to `mainDevOrg` with zero component errors. Signed-in smoke testing, commit, and push remain pending; no Jest tests were added or run.

## Budget History Workstream

The Dashboard now joins the existing six-month spending trend with optional monthly budget records and presents Budget, Spent, Variance, and Usage without treating an absent budget as zero.

Validation and deployment completed on 2026-08-22:

- Targeted Prettier, `npm run lint`, manifest parsing, `git diff --check`, and Salesforce Code Analyzer `eslint:Recommended`, `pmd:Recommended`, and `sfge:Recommended`: passed with no findings.
- Check-only deployment `0AfgK00000REwNxSAL` compiled all 9 components and passed all 8 `BudgetControllerTest` methods with zero component, test, or coverage warnings.
- Deployment `0AfgK00000REtJeSAL` released the same 9 components to `mainDevOrg` and passed the same 8 tests. `BudgetController` reported 100% coverage and `BudgetService` reported 94.74% coverage.
- The visual follow-up replaced the two Lightning cards with the Dashboard's standard bordered SLDS boxes, restored explicit spacing above history, and orders history newest-first. LWC-only validation `0AfgK00000RFBYHSA5` and deployment `0AfgK00000RFBgLSAX` each compiled all 4 affected bundles successfully with `NoTestRun`.
- The final radius alignment uses the same `--slds-g-radius-border-1` token as the summary and chart panels. Code Analyzer reported zero findings; validation `0AfgK00000RF7T4SAL` and deployment `0AfgK00000RFDF7SAP` each compiled both budget bundles successfully with `NoTestRun`.
- The final spacing follow-up removed the Monthly Budget panel's redundant bottom margin so the summary row supplies the single standard Dashboard gap. Validation `0AfgK00000RignBSAR` and deployment `0AfgK00000Rih05SAB` each compiled `budgetPanel` successfully with `NoTestRun`.
- The recurring schedule was restored as the only active job, `08egK00000ciBzlQAE`, in `WAITING` state with cron `0 0 8 * * ?`, timezone `Asia/Manila`, owner `005gK000034mODtQAM`, and next fire `2026-08-23T08:00:00+08:00`.
- No LWC Jest tests were added or run. Signed-in smoke testing, commit, and push remain pending.

## Apex Boundary Architecture Workstream

The local follow-up after commit `0a8f201` makes controllers the only Lightning-facing Apex entry points, extracts every LWC contract into a top-level DTO, moves budget validation into `BudgetService`, isolates reusable Expense Group and Category lookups in user-mode selectors, and places Batch/Schedulable classes under `classes/async`. UI-only `"All"` Category values are translated to null before Apex; server group/category contracts use `Id`.

Local validation completed on 2026-08-21:

- Targeted Prettier, `npm run lint`, `git diff --check`, changed/new XML parsing, architecture-policy scans, and Salesforce source-to-Metadata-API conversion: passed.
- Exact source/manifest inventory passed with 49 Apex classes, 49 paired class metadata files, 14 Apex test classes, and 20 LWC bundles.
- Salesforce Code Analyzer `eslint:Recommended`, `pmd:Recommended`, and `sfge:Recommended`: 0 findings at the Low threshold.
- The `eslint:Recommended --no-suppressions` audit remains exactly 145 established Low CSS exceptions across nine unchanged files: 142 `no-hardcoded-values-slds2` and 3 `no-slds-class-overrides`. No new suppression was added.
- Controller SOQL, non-controller `@AuraEnabled` methods, stale inner-class references, and stale direct-service LWC imports: 0.
- No Jest, org Apex tests, check-only deployment, deployment, commit, or push was performed for this local architecture workstream.

## Record-Based Bank Workstream

The additive Bank work introduces `Bank__c`, `Expense_Group_Bank__c`, the optional `Bank_Assignment__c` lookups, `BankController`, `ExpenseGroupBankOptionDto`, `BankService`, `BankAssignmentValidator`, Bank/assignment/Expense trigger handlers and triggers, and four focused Bank test classes. The legacy `Bank__c` picklists and `Bank` global value set remain in source during the compatibility window. The verified one-off migration scripts were removed from the app repository afterward.

Local validation completed on 2026-08-19:

- Whole-change targeted Prettier, `npm run lint`, and `git diff --check`: passed.
- Salesforce Code Analyzer `eslint:Recommended`, `pmd:Recommended`, and `sfge:Recommended`: 0 findings. The normal combined scan retained the established 145 inline-suppressed CSS exceptions without reporting a violation.
- Salesforce source-to-Metadata-API conversion: passed.
- All 39 changed or new XML files parsed successfully.
- Manifest/source inventory matched exactly: 37 Apex classes, 6 triggers, 8 custom objects, 39 custom fields, 8 tabs, 7 layouts, 7 list views, 19 LWC bundles, and 3 permission sets.
- Permission audit passed: regular users have read-only global Banks and no Bank tab, administrators and all-access users can manage global Banks, all three sets can manage group assignments and edit the new lookups, and generated key fields remain hidden.

Org validation and deployment completed on 2026-08-19:

- Initial full-manifest check-only deployment `0AfgK00000Quh3JSAR` was blocked before compilation by the active recurring Apex schedule; no metadata changed and no tests ran.
- After the approved guarded scheduler pause, full-manifest check-only deployment `0AfgK00000Qu99kSAB` compiled the Bank source but exposed three test-fixture issues plus unrelated full-manifest coverage warnings. The fixtures were corrected locally; no metadata changed.
- Focused check-only deployment `0AfgK00000QusoLSAR` compiled all 51 metadata components and passed all 58 focused tests with zero component errors, test errors, or coverage warnings. Touched production coverage ranged from 92.96% to 100%.
- Deployment `0AfgK00000Qun3uSAB` released the same 51 components to `mainDevOrg` and passed the same 58 tests with zero errors or coverage warnings.
- The recurring schedule was restored as job `08egK00000cGpiDQAS`, `WAITING`, with cron `0 0 8 * * ?`, timezone `Asia/Manila`, owner `005gK000034mODtQAM`, and next fire `2026-08-20T00:00:00.000+0000`.
- The pre-migration baseline found 505 Expenses totaling PHP 1,667,469.07 and 11 Recurring Expenses totaling PHP 16,871.00. Of those, 483 Expenses and 8 Recurring Expenses retained legacy Bank values; no lookup was populated and both new Bank objects were empty.
- The first one-off tooling compile attempts stopped before DML. They exposed an invalid describe chain and then anonymous-Apex visibility of the intentionally hidden generated-key fields. Check-only deployment `0AfgK00000Qux87SAB` confirmed both fields already existed unchanged, so no corrective deployment was needed. The migration and verification tooling was corrected to identify records through normalized visible Bank names and Expense Group/Bank relationships while the deployed triggers remain the sole owners of hidden keys.
- The one-off Bank migration completed successfully: 5 active Banks were inserted, 15 active assignments established the complete 3-group-by-5-Bank matrix, 483 Expenses were backfilled, and 8 Recurring Expenses were backfilled. Legacy picklists were unchanged.
- Read-only post-migration verification passed with 5 active Banks, 15 active assignments, and zero Expense or Recurring Expense mismatches. Post-migration counts and amount totals exactly matched the baseline; all 483 legacy-banked Expenses and all 8 legacy-banked Recurring Expenses now have assignments.
- The scheduler remains `WAITING` as job `08egK00000cGpiDQAS` with its original 08:00 Asia/Manila schedule. Signed-in smoke testing remains pending.

## Custom Recurring Editor Workstream

## Apex Boundary Architecture Deployment

The controller/DTO/service/selector/async boundary refactor was released to `mainDevOrg` on 2026-08-21:

- Check-only deployment `0AfgK00000R9f64SAB`: 155/155 components and 90/90 specified tests passed, with zero component or test errors.
- Deployment `0AfgK00000R9xz6SAB`: 155/155 components and 90/90 specified tests passed, with zero errors or coverage warnings.
- The recurring schedule was paused for the Apex dependency cutover and restored as the only active job, `08egK00000cahiIQAQ`, in `WAITING` state with cron `0 0 8 * * ?`, timezone `Asia/Manila`, owner `005gK000034mODtQAM`, and next fire `2026-08-22T08:00:00+08:00`.
- No LWC Jest tests were added or run. Commit, push, and signed-in smoke testing remain pending.

The follow-up adds the non-exposed `recurringExpenseModal`, replaces workspace Add/Edit navigation with an LDS form, refreshes group-scoped Category and Bank choices, and preserves legacy or inactive Bank history. It also enforces the recurring date window, prevents capped generation from replaying expenses, and keeps already-ended pointers out of due status and generation.

Local validation completed on 2026-08-21:

- Targeted Prettier, `npm run lint`, and `git diff --check`: passed.
- Salesforce Code Analyzer `eslint:Recommended`, `pmd:Recommended`, and `sfge:Recommended`: 0 findings. The `eslint:Recommended --no-suppressions` audit retained exactly 145 established Low CSS exceptions across nine unchanged files, with no High or Moderate findings.
- Changed XML parsing, exact manifest/source inventory with 20 LWC bundles, and Salesforce source-to-Metadata-API conversion: passed.
- No LWC Jest tests were added or run, as requested.
- Initial focused check-only deployment `0AfgK00000R9SOvSAN` compiled all 12 components and ran 51 tests. Three test-fixture failures exposed omitted direct-handler fields and an org-profile assumption; no metadata changed. The fixtures were corrected locally, reformatted, and rescanned with 0 PMD findings.
- Final focused check-only deployment `0AfgK00000R8yNfSAJ` compiled all 12 components and passed all 51 specified tests with zero errors or coverage warnings.
- Deployment `0AfgK00000R9RZKSA3` released the same 12 components and passed the same 51 tests with zero errors or coverage warnings.
- The recurring schedule was restored as the only active job, `08egK00000cZuPiQAK`, in `WAITING` state with cron `0 0 8 * * ?`, timezone `Asia/Manila`, owner `005gK000034mODtQAM`, and next fire `2026-08-22T08:00:00+08:00`.
- Signed-in smoke testing, commit, and push remain pending.

The LWC readability refactor and lifecycle cleanup follow-up were validated on 2026-08-19 with:

- Targeted Prettier checks, `npm run lint`, and `git diff --check`: passed.
- The normal Salesforce Code Analyzer `eslint:Recommended` scan: 0 findings. The `--no-suppressions` audit retained the established 145 Low CSS exceptions, with no High or Moderate findings.
- Manifest-to-source inventory: all 17 LWC bundles matched, including the new workspace configuration, recurring-row transform, and CSV export modules.
- Salesforce source-to-Metadata-API conversion: passed.
- The manager guards static-resource loading across renders, while the expense modal removes its document listener and restores page state when disconnected.
- LWC-only check-only deployment `0AfgK00000Qpm8TSAR` to `mainDevOrg`: all 17 bundles compiled successfully with `NoTestRun`.
- No Jest tests were added or run. Deployment `0AfgK00000QpZeKSAV` then released the ten affected LWC bundles to `mainDevOrg` successfully with `NoTestRun`.

The optional monthly budget first version was validated on 2026-08-19 with:

- Targeted Prettier checks, `npm run lint`, `git diff --check`, XML parsing, manifest/source inventory, and Salesforce source conversion: passed.
- Salesforce Code Analyzer `eslint:Recommended`, `pmd:Recommended`, and `sfge:Recommended` scans: 0 findings. The `eslint:Recommended --no-suppressions` audit retained the established 145 Low CSS exceptions across nine unchanged files, with no High or Moderate findings.
- Initial check-only deployment `0AfgK00000QpzGzSAJ` compiled all 25 components and ran 10 tests; 9 passed and one direct-handler test exposed an incorrect multiple-`addError` count assumption. No org metadata changed.
- Intermediate check-only deployment `0AfgK00000Qq2unSAB` compiled all 25 components and ran 10 tests; 9 passed and one assertion caught a changed null-group validation message during complexity cleanup. The original API message was restored through request-level validation, and no org metadata changed.
- Final check-only deployment `0AfgK00000Qptd0SAB` to `mainDevOrg`: 25/25 components compiled and all 10 specified tests passed. `BudgetController`, both top-level DTOs, `BudgetTrigger`, and `BudgetTriggerHandler` reported 100% coverage; `BudgetService` reported 91%.
- No LWC Jest tests were added or run.
- Deployment `0AfgK00000Qs215SAB` released all 25 components to `mainDevOrg` and passed all 10 specified tests with zero component or test errors.
- Budgets-navigation check-only deployment `0AfgK00000QsAwHSAV` validated the app, standard `Budget__c` tab, and three permission sets: 5/5 components passed with `NoTestRun`. Deployment `0AfgK00000QsGX5SAN` then released the same five components to `mainDevOrg` successfully with `NoTestRun`; the follow-up is committed and pushed as `82d6ef1`.
- Signed-in budget smoke testing passed the opt-out state, create, edit, budget-month change, within-budget and over-budget calculations, capped progress with the true percentage label, removal without expense deletion, and standard Budgets list-view access.

The API rebrand source was validated locally on 2026-08-15 with:

- ESLint: passed.
- Targeted Prettier checks for rebrand-owned files: passed.
- JSON/XML parsing and source-reference/manifest consistency checks: passed.
- Salesforce source-to-Metadata-API conversion: passed.
- Salesforce Code Analyzer: 431 Low findings across six existing CSS files, with no High or Moderate findings.
- LWC Jest with `--passWithNoTests`: exited successfully with no tests found.

The add-only rebrand was deployed to `mainDevOrg` with deployment `0AfgK00000QRFgkSAH`. Validation `0AfgK00000QRZnWSAX` compiled all 47 components and passed all 52 specified Apex tests. Rebranded production-class and trigger coverage ranged from 88.71% to 100%.

The post-cutover read-only migration verification, LWC-facing Apex endpoint smoke test, and signed-in visual smoke test all passed. The visual check also caught and verified the corrected SLDS 2 horizontal-bar radius behavior.

The repository-wide SLDS cleanup was validated locally on 2026-08-16:

- Targeted Prettier checks passed for all six changed CSS files.
- `npm run lint` and `git diff --check` passed.
- The normal Salesforce Code Analyzer `eslint:Recommended` scan for `force-app/main/default` reported 0 findings.
- The audit scan with `--no-suppressions` reported 145 Low findings across nine files: 142 `@salesforce-ux/slds/no-hardcoded-values-slds2` exceptions and 3 `@salesforce-ux/slds/no-slds-class-overrides` exceptions.
- The retained findings are intentional exact-value or platform-override exceptions and remain auditable through bounded `code-analyzer-suppress` / `code-analyzer-unsuppress` regions. No ESLint disable directives or `code-analyzer-suppress-next-line` / `code-analyzer-suppress-line` directives remain under `force-app/main/default`.
- The cleanup corrects earlier semantic-hook mismatches and preserves unsupported layout, typography, print/PDF, and data-visualization geometry rather than substituting visually different hooks.
- The six combined CSS changes are committed and pushed as `9f925e5`. Check-only deployment `0AfgK00000QVRwFSAX` and deployment `0AfgK00000QVnjpSAD` each succeeded for all six affected LWC bundles with `NoTestRun`.
- A signed-in visual smoke test on 2026-08-16 confirmed the deployed Dashboard, Expenses, and Recurring views, pale active navigation with dark text, neutral inactive hover, chart radii, semantic colors, and desktop content. No application console errors were present; Salesforce emitted only its disabled component-profiler warning.
- Responsive inspection found no document overflow at an explicit 800px viewport, where the existing responsive rules activate. At the default approximately 989px viewport, Recurring's 652px panel had 728px of row content and clipped its action column, while the Expenses header actions wrapped awkwardly. Treat this as an intermediate-width breakpoint/container-layout follow-up.
- The follow-up adds an 1100px intermediate breakpoint to the manager, Expenses, and Recurring styles while retaining the existing 900px full-mobile rules. Targeted Prettier, `npm run lint`, and `git diff --check` passed. The normal `eslint:Recommended` scan remains at 0 findings, and the `--no-suppressions` audit remains at the established 145 documented Low exceptions. Check-only deployment `0AfgK00000QcwwrSAB` and deployment `0AfgK00000QcwyTSAR` succeeded for all three LWC bundles with `NoTestRun`; signed-in responsive verification is pending.
- A subsequent narrow-screen screenshot showed the mobile brand row stretching below its content. The CSS follow-up content-sizes the mobile sidebar sections without adding hardcoded design values or suppression markers. Targeted Prettier, `npm run lint`, and `git diff --check` passed; the analyzer results remain 0 normal findings and 145 documented Low exceptions. Check-only deployment `0AfgK00000Qczl4SAB` and deployment `0AfgK00000Qd0u1SAB` succeeded for `budgetExpenseManager` with `NoTestRun`; signed-in visual verification is pending.

Before the combined cleanup, the settings bundle was validated with `0AfgK00000QVV6zSAH` and deployed with `0AfgK00000QVVBpSAP`. The manager shell was validated with `0AfgK00000QVXgfSAH` and deployed with `0AfgK00000QVJLySAP`; its active-tab hook correction was then validated with `0AfgK00000QVYeLSAX` and deployed with `0AfgK00000QVYfxSAH`.

Legacy cleanup check-only deployment `0AfgK00000QSD8ESAX` and actual deployment `0AfgK00000QSI4fSAH` each passed 42/42 deletion actions and all 52 specified Apex tests. Post-cleanup metadata inventory found zero Spendly/TrackSpend members in the cleaned types, and the read-only endpoint and relationship reconciliation checks passed with the original `3 / 18 / 11 / 504` record counts and 23 recurring links.

A separate direct `RunLocalTests` diagnostic ran 171 org tests with 91% org-wide coverage. The 168 passing tests include every Budget & Expense Manager test. The only three failures are unrelated methods in `PortfolioLeadEmailActionTest` whose assertions conflict with the org's current notification custom metadata: `testMissingConfig`, `testNullRequestInList`, and `testResolveConfig_ReturnsNullWhenNoOverride` (test run `707gK00000mkb7x`).

Once `Budget Expense Manager Recurring Daily` is active, Salesforce blocks deployments that include its schedulable dependency graph unless the org's Deployment Settings allow deployments with pending Apex jobs. Do not abort the schedule for ordinary metadata-only diagnostics; run Apex tests directly, or use the guarded scheduler scripts when an Apex deployment genuinely requires a cutover window.

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

The recurring expense generator uses `Next_Run_Date__c` as its continuation pointer.

The completed same-org migration scripts were intentionally removed from this app repository after verification. A future unpackaged-to-`bemgr` managed-package data migration is a separate workstream and must use separately reviewed tooling and rollback artifacts.

## Currency

`Budget_Expense_Manager_Setting__c.Base_Currency_Code__c` is the stable app reporting-currency foundation. The non-cacheable admin settings path initializes a blank value once; the cacheable currency-context endpoint only reads the persisted value. The Salesforce provider uses `UserInfo.getDefaultCurrency()` in single-currency orgs and a system-mode dynamic corporate `CurrencyType` query in multi-currency orgs. This foundation does not yet replace the PHP-specific FX fields, calculations, or UI formatting.

`Expense__c.Amount__c`, budgets, totals, averages, charts, and monthly trends are canonical PHP (Philippine Peso). Shared PHP and optional ISO-currency display formatting is centralized in `expenseFormatters` with cached `Intl.NumberFormat` instances; view models and expense transforms provide formatted values to presentation components.

Optional foreign-currency Expenses store the original Number amount (4 decimals), three-letter code, PHP-per-unit Number rate (8 decimals), effective date, and source. These fields are all blank for an ordinary PHP Expense. The before-trigger service requires the full snapshot when any one is present and recalculates the PHP Currency amount with half-up precision. Recurring templates remain PHP-only in this version.

The public `Exchange_Rates_API` Named Credential points to `https://api.frankfurter.dev`; its `Exchange_Rates_Public` External Credential uses no authentication and permission-set principal access. Requests use Frankfurter v2's single-rate endpoint with `providers=ECB`. The provider's returned effective date is retained because weekend/holiday requests can resolve to a prior business day; observations older than seven days are rejected. These are informational reference estimates, so the modal supports a manual settled-rate fallback.
