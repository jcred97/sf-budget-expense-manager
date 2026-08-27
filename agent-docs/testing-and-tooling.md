# Testing And Tooling

## Apex Tests

Apex tests live in `BankAssignmentValidatorTest.cls`, `BankControllerTest.cls`, `BankTriggerHandlerTest.cls`, `ExpenseGroupBankTriggerHandlerTest.cls`, `ExpenseControllerTest.cls`, `BudgetControllerTest.cls`, `BudgetTriggerHandlerTest.cls`, `RecurringExpenseTriggerHandlerTest.cls`, `BudgetExpenseSettingsTriggerHandlerTest.cls`, `RecurringExpenseBatchTest.cls`, `RecurringExpenseCalculatorTest.cls`, `RecurringExpenseServiceTest.cls`, `RecurringExpenseSchedulerTest.cls`, and `BudgetExpenseSettingsServiceTest.cls`.

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
- optional monthly budget opt-out, create, normalized lookup, update, group/month upsert, validation, ownership mismatch, and removal
- budget trigger month/key normalization, key regeneration, duplicate prevention, and invariant errors
- recurring expense trigger defaults for `Next_Run_Date__c`
- recurring expense batch generation for more than the manual run cap, default construction, and null run-date validation
- recurring expense next-run-date calculation for daily, weekly, monthly, and yearly frequencies
- recurring expense generation, catch-up behavior, end dates, inactive records, future records, manual batch start, and null run-date validation
- recurring generation under a restricted automation user while the generated link and next-run pointer remain read-only through FLS
- scheduled recurring expense generation
- Budget & Expense Manager Settings default creation, updates, singleton protection, and recurring run status tracking

## LWC Tests

LWC tests use `@salesforce/sfdx-lwc-jest`, but no LWC Jest tests are currently checked in. A Jest run with `--passWithNoTests` validates the test harness only and does not provide behavioral coverage.

## Modal Readiness Workstream

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

All amounts are in PHP (Philippine Peso). Shared display formatting is centralized in `expenseFormatters` with `Intl.NumberFormat`; view models and expense transforms provide formatted values to presentation components.
