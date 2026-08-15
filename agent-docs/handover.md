# Budget & Expense Manager Handover

## Current State

- The working tree contains the Spendly-to-Budget & Expense Manager API rebrand. It and the approved legacy cleanup are deployed to `mainDevOrg`, but the work has not been committed, pushed, packaged, or used to rename the repository.
- `mainDevOrg` is the interim unpackaged development org and has no namespace. Direct deployments remain unprefixed; `bemgr` stays in `sfdx-project.json` for later namespaced scratch-org and managed-package work.
- Deployment `0AfgK00000QRFgkSAH` succeeded for all 47 rebrand components. Validation `0AfgK00000QRZnWSAX` passed all 52 specified Apex tests with zero component or test errors.
- The singleton settings record, all-access assignment, and 08:00 Asia/Manila scheduler were migrated and verified. The neutral business records remained in place: 3 expense groups, 18 categories, 11 recurring templates, and 504 expenses, including 23 recurring links.
- Cleanup deployment `0AfgK00000QSI4fSAH` removed all live Spendly-named app metadata, Apex, LWCs, permissions, settings metadata/data, and both legacy content assets after check-only deployment `0AfgK00000QSD8ESAX` passed. The obsolete permission assignment was removed first; the current all-access assignment remains.
- Budget & Expense Manager uses `budgetExpenseManager` as the workspace shell and state coordinator. Dashboard, Expenses, and Recurring presentation live in dedicated child components; pure derived data lives in feature-specific view-model modules.
- `budgetExpenseManager.js` is 858 lines after the readability refactor, down from 1,257 lines before the view-model extraction.
- The app currently uses `Expense_Group__c`, `Category__c`, `Expense__c`, `Recurring_Expense__c`, recurring expense automation, and `Budget_Expense_Manager_Setting__c`.
- Recent UI direction: keep the custom workspace, but make it feel closer to Salesforce Lightning/SLDS and avoid heavy custom styling unless needed.
- Local rebrand validation on 2026-08-15 passed ESLint, targeted Prettier checks, JSON/XML parsing, reference and manifest consistency checks, and Salesforce source-to-Metadata-API conversion.
- The post-rebrand Code Analyzer scan found 431 Low findings across six existing CSS files, all from `@salesforce-ux/slds/no-hardcoded-values-slds2`; it found no High or Moderate findings. Jest completed with `--passWithNoTests`, but there are no checked-in LWC Jest suites, so this is harness validation only.
- Read-only endpoint smoke tests and a signed-in visual click-through passed against `mainDevOrg`, including the corrected horizontal category bars.
- Direct `RunLocalTests` ran 171 tests with 91% org-wide coverage: 168 passed. The only failures are three unrelated `PortfolioLeadEmailActionTest` methods caused by existing notification custom metadata assumptions (test run `707gK00000mkb7x`).
- A signed-in comparison found the newly compiled horizontal chart bars resolving the SLDS circle-radius hook as ellipses. `expenseBarChart` now uses the pill-radius hook for both tracks and fills. Dry run `0AfgK00000QRteCSAT` and deployment `0AfgK00000QReiNSAT` each succeeded for the bundle; focused Code Analyzer reported 0 violations.
- The cleanup retained 3 expense groups, 18 categories, 11 recurring templates, 504 expenses, and 23 recurring links. The renamed 08:00 Asia/Manila schedule fired successfully during post-cleanup verification, reported no expenses due, and remains the only active recurring job.
- The deleted settings row was exported before cleanup to the Git-ignored `scripts/migration/backups/legacy-spendly-2026-08-15/` directory with hashes and rollback identifiers. The legacy custom object was not purged.
- Salesforce also retains an auto-created, current-brand `Budget_Expense_Manager_Setting__c-Budget & Expense Manager Setting Layout` beside the source-controlled plural `...Settings Layout`. It is not legacy Spendly metadata and was left outside the approved cleanup scope.

## Historical Pre-Rebrand Work

The component names and scheduled-job names in this section are intentionally preserved as historical facts. The referenced deployments predate the local API rebrand.

- Extracted pure PHP/date/time helpers into `spendlyFormatters` and grouping/chart/row transformations into the module later renamed `spendlyExpenseTransforms`.
- Changed `spendlySummaryCards` from seven dashboard-specific properties to one reusable, data-driven `cards` collection in commit `8ce8ca7`.
- Extracted dashboard content and dashboard-specific styling into `spendlyDashboardView` in commit `ee982e3`. `spendlyApp` supplied a dashboard view model and handled the child navigation event.
- Validated the dashboard extraction with dry run `0AfgK00000Pa0RKSAZ` and deployed it to `mainDevOrg` with deployment `0AfgK00000PZhZzSAL`; both LWC bundles succeeded with `NoTestRun`.
- Deployed the utility and summary-card refactors with deployment `0AfgK00000PZ87dSAD`; all four LWC bundles succeeded with `NoTestRun`.
- Extracted Recurring presentation into `spendlyRecurringExpenses` in commit `5c440dc` and deployed it with deployment `0AfgK00000Pe1GkSAJ`.
- Extracted Expenses presentation into `spendlyExpenses` in commit `822b2fc` and deployed it with deployment `0AfgK00000PguDtSAJ`.
- Extracted pure Dashboard, Expenses, and Recurring view-model builders and renamed `spendlyDataTransforms` to `spendlyExpenseTransforms` in commit `919e8a1`.
- Validated the view-model refactor with dry run `0AfgK00000Pk7HpSAJ` and deployed it with deployment `0AfgK00000Pk7L3SAJ`; `spendlyDataTransforms` was removed post-deploy.
- Audited local and deployed LWC usage after deployment. All 14 remaining Spendly bundles are referenced; no unused Spendly bundles remain in `mainDevOrg`.
- The current Code Analyzer baseline is 451 Low findings, all from `@salesforce-ux/slds/no-hardcoded-values-slds2`; there are no High or Moderate findings. The final changed-JavaScript scan found 0 violations.
- Updated the local, Git-ignored `lwc/jsconfig.json` for TypeScript 6 by removing deprecated `baseUrl` and changing the `c/*` target from `*` to `./*`.
- Organized the 18 Apex classes and paired metadata into `classes/controller`, `classes/handler`, `classes/service`, and `classes/test` without changing their source contents.
- Added dedicated `RecurringExpenseTriggerHandlerTest` and `SpendlySettingsTriggerHandlerTest` coverage with direct handler invocation plus trigger wiring.
- The handler and batch test improvements reduced the earlier analyzer baseline from 601 to 592 Low findings before the later SLDS cleanup.
- Validated the reorganized classes with dry-run deployment `0AfgK00000P676sSAB`; all 18 components and 47 Apex tests passed.
- Deployed the reorganized classes with deployment `0AfgK00000P5YVjSAN`; all 18 components and 47 Apex tests passed.
- Validated the handler-test refactor with dry-run deployment `0AfgK00000P5sixSAB`; all 20 component actions and 48 Apex tests passed.
- Deployed the handler-test refactor with deployment `0AfgK00000P6GbZSAV`; both dedicated handler tests were created and the obsolete trigger test was deleted.
- Restored `Spendly Recurring Expense Daily` as job `08egK00000a4qoBQAQ`, `WAITING`, with cron `0 0 8 * * ?`, timezone `Asia/Manila`, and next fire `2026-07-31T00:00:00.000+0000`.
- Created inactive manual-test templates under `Screenshot Test Expense Group` in category `Trigger Handler Tests` (`a00gK00001AHntZQAT`): default-next-date `a0EgK000009BdaLUAS`, realign-start-date `a0EgK000009BdbxUAC`, and preserve-advanced-date `a0EgK000009BddZUAS`.
- Added focused batch tests for the default constructor and null run-date validation, and added `System.runAs` coverage to all batch test methods. The modified test file has 0 Recommended analyzer findings.
- Validated the expanded batch test with dry-run `0AfgK00000P6RwnSAF` and deployed it with `0AfgK00000P6S3FSAV`; all three test methods passed in both runs.
- Ran all eight Apex test classes independently after deployment; every run passed. Isolated aggregate coverage / intended production-class coverage: recurring handler 100% / 100%, controller 95.5% / 96.6%, batch 60.4% / 100%, calculator 100% / 100%, scheduler 78.8% / 100%, recurring service 84.4% / 93.6%, settings service 81.8% / 91.2%, and settings handler 36.6% / 100%. Aggregate percentages include every dependency touched by a test, so the intended production-class figure is the relevant focused-test measure.
- Cleared the initial Spendly Code Analyzer High findings in `SpendlyController.cls`, `SpendlyRecurringExpenseService.cls`, `SpendlySettingsService.cls`, and `spendlyApp.js`.
- Deployed that analyzer cleanup to `mainDevOrg` with deploy ID `0AfgK00000OkVkYSAV`; relevant Apex tests passed `33/33`.
- During pre-rebrand Apex deploys, the `Spendly Recurring Expense Daily` scheduled job had to be temporarily aborted because Salesforce blocked Apex deploys while the job was pending.
- Updated `.prettierrc` in the committed analyzer cleanup to reduce noisy JS formatting churn by pinning `singleQuote`, `tabWidth`, `printWidth`, and `arrowParens`.
- Cleared `spendlyExpenseModal` Recommended analyzer findings:
    - Removed `slds-button_icon-inverse` from the SLDS modal close button.
    - Removed the modal `setTimeout` async operation and focused the first focusable element directly in `renderedCallback`.
    - Removed duplicate/unsupported modal CSS rules for `.date-format-hide .slds-form-element__help` and `.transaction-time-field`; date helper styling is already covered by the app-level `RemoveDateFormatStyle` static resource.
- Verified `spendlyExpenseModal` with a focused Recommended Code Analyzer scan; result was `Found 0 violations`.
- Deployed `spendlyExpenseModal` to `mainDevOrg` with deploy ID `0AfgK00000OzllmSAB`; tests were skipped with `NoTestRun` because it was LWC-only.
- Spendly Settings global recurring automation was enabled/disabled and expanded to let the global daily run time be changed from the Settings UI.
- Recurring view summary cards, template panel, rows, due/inactive states, and row actions were polished toward the same Salesforce/SLDS direction as Dashboard and Expenses.
- Dashboard panels, summary cards, charts, latest expenses, and insight cards were tightened toward Salesforce/SLDS styling with better truncation and responsive behavior.
- Expenses UI was polished with a fixed/scrollable list area, loading state, footer status, and Load More behavior.
- Export CSV and Print / PDF actions were moved beside Add Expense in the Expenses header.
- Dashboard and Expenses language was changed from Transactions to Expenses in the custom UI.
- Dashboard month controls, empty/loading states, and chart presentation were adjusted toward Salesforce-style UI.

## Watch Points

- If committing LWC changes, watch the pre-commit hook. Prettier may still adjust old hand-wrapped lines, but the config now avoids the prior whole-file quote/indent churn.
- Verify the app in the org after deploys because Salesforce shell height and page scroll behavior can differ from local expectations.
- Keep dashboard and expenses views in sync after create, edit, duplicate, delete, and bulk delete actions.
- Keep data loading, mutable cross-view state, modal ownership, server calls, and action orchestration in `budgetExpenseManager`. Presentation components communicate actions through events, while view-model modules remain pure and side-effect free.
- `force-app/main/default/lwc/jsconfig.json` is ignored by Git and may be regenerated by Salesforce tooling. For TypeScript 6 compatibility, omit `baseUrl` and keep the `c/*` mapping target as `./*`.
- For UI polish, prefer `lightning-*` base components and SLDS utility classes first.
- Check PHP currency formatting behavior before touching amount display.
- Do not commit `AGENTS.md`, `agent-docs/`, or this handover unless the user explicitly asks.

## Next Likely Work

- Finish the repository-identity workstream in `agent-docs/repository-rename.md`: create an approved local commit checkpoint, rename GitHub from `jcred97/sf-spendly` to `jcred97/sf-budget-expense-manager`, update `origin`, rename the local checkout directory, reopen the workspace, and verify Git and tooling. None of those actions has run yet.
- Continue feature development and violation cleanup in unnamespaced `mainDevOrg` using the rebranded APIs.
- Reduce the 431 Low SLDS hardcoded-value findings and add real LWC Jest coverage before package creation.
- When feature scope is stable, link `bemgr` to the intended Dev Hub, validate in a namespaced scratch org, and create the managed 2GP package.
- Treat the later unpackaged-to-namespaced data migration as a separate hierarchy-aware cutover; package installation will create distinct `bemgr__*` object identities.

## Clarifications

- The utility, summary-card, Dashboard, Recurring, Expenses, and view-model readability refactors are committed, pushed, and deployed to `mainDevOrg`.
- The TypeScript `jsconfig.json` fix is local tooling configuration only. It is intentionally ignored by Git and is not Salesforce metadata.
- The historical UI-refactor deployments were LWC-only, so Apex tests were not required or run for those deployments; later API-rebrand validation and cleanup each ran the focused Apex suite documented above.
- The API rebrand and legacy cleanup are deployed to `mainDevOrg`; no commit, push, package creation, or repository rename has occurred.
- The current remote is `https://github.com/jcred97/sf-spendly.git`; the planned remote is `https://github.com/jcred97/sf-budget-expense-manager.git`.
- `mainDevOrg` remains unpackaged and unnamespaced. Cleanup removed only obsolete unmanaged branding; it did not create `bemgr__` metadata or migrate the shared records into a managed package.
