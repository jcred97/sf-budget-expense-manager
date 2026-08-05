# Spendly Handover

## Current State

- Main branch is clean and pushed through `ee982e3 refactor: extract Spendly dashboard view`.
- The current committed LWC source is deployed to `mainDevOrg`.
- Spendly uses `spendlyApp` as the workspace shell and state coordinator. Dashboard presentation now lives in `spendlyDashboardView`; shared formatting and data transformations live in non-exposed utility modules.
- The app currently uses `Expense_Group__c`, `Category__c`, `Expense__c`, recurring expense automation, and Spendly Settings.
- Recent UI direction: keep the custom workspace, but make it feel closer to Salesforce Lightning/SLDS and avoid heavy custom styling unless needed.

## Recent Work

- Extracted pure PHP/date/time helpers into `spendlyFormatters` and grouping/chart/row transformations into `spendlyDataTransforms` in commit `943801d`.
- Changed `spendlySummaryCards` from seven dashboard-specific properties to one reusable, data-driven `cards` collection in commit `8ce8ca7`.
- Extracted dashboard content and dashboard-specific styling into `spendlyDashboardView` in commit `ee982e3`. `spendlyApp` now supplies a dashboard view model and handles the child navigation event.
- Validated the dashboard extraction with dry run `0AfgK00000Pa0RKSAZ` and deployed it to `mainDevOrg` with deployment `0AfgK00000PZhZzSAL`; both LWC bundles succeeded with `NoTestRun`.
- Deployed the utility and summary-card refactors with deployment `0AfgK00000PZ87dSAD`; all four LWC bundles succeeded with `NoTestRun`.
- The current Code Analyzer baseline is 471 Low findings, all from `@salesforce-ux/slds/no-hardcoded-values-slds2`; there are no High or Moderate findings. The readability extractions did not increase this baseline.
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
- During Apex deploys, the `Spendly Recurring Expense Daily` scheduled job must be temporarily aborted because Salesforce blocks Apex deploys while the job is pending. Restore it immediately after deploy with cron `0 0 8 * * ?`.
- Updated `.prettierrc` in the committed analyzer cleanup to reduce noisy JS formatting churn by pinning `singleQuote`, `tabWidth`, `printWidth`, and `arrowParens`.
- Cleared `spendlyExpenseModal` Recommended analyzer findings:
    - Removed `slds-button_icon-inverse` from the SLDS modal close button.
    - Removed the modal `setTimeout` async operation and focused the first focusable element directly in `renderedCallback`.
    - Removed duplicate/unsupported modal CSS rules for `.date-format-hide .slds-form-element__help` and `.transaction-time-field`; date helper styling is already covered by the app-level `RemoveDateFormatStyle` static resource.
- Verified `spendlyExpenseModal` with `sf code-analyzer run --workspace . --target force-app/main/default/lwc/spendlyExpenseModal --rule-selector Recommended --view table`; result was `Found 0 violations`.
- Deployed `spendlyExpenseModal` to `mainDevOrg` with deploy ID `0AfgK00000OzllmSAB`; tests were skipped with `NoTestRun` because it was LWC-only.
- Spendly Settings global recurring automation can be enabled/disabled and is being expanded to let the global daily run time be changed from the Settings UI.
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
- Keep data loading, cross-view state, modal ownership, and server calls in `spendlyApp`; extracted view components should remain presentation-focused and communicate actions through events.
- `force-app/main/default/lwc/jsconfig.json` is ignored by Git and may be regenerated by Salesforce tooling. For TypeScript 6 compatibility, omit `baseUrl` and keep the `c/*` mapping target as `./*`.
- For UI polish, prefer `lightning-*` base components and SLDS utility classes first.
- Check PHP currency formatting behavior before touching amount display.
- Do not commit `AGENTS.md`, `agent-docs/`, or this handover unless the user explicitly asks.

## Next Likely Work

- Extract the Recurring view into a presentation-focused LWC using the same view-model/event pattern as the Dashboard.
- Extract the Expenses view after Recurring because it has the largest state and interaction surface.
- Reduce `spendlyApp` to the workspace shell/coordinator, then resume the 471-finding SLDS hardcoded-value migration in focused slices.

## Clarifications

- The utility, summary-card, and dashboard readability refactors are committed, pushed, and deployed to `mainDevOrg`.
- The TypeScript `jsconfig.json` fix is local tooling configuration only. It is intentionally ignored by Git and is not Salesforce metadata.
- The recent deployments were LWC-only, so Apex tests were not required or run; lint, analyzer comparison, focused UI smoke tests, and Salesforce compilation were used instead.
