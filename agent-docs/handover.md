# Spendly Handover

## Current State

- Main branch is pushed through `6945acf refactor: organize Apex classes and align handler tests`.
- The working tree currently has an uncommitted focused batch-test coverage improvement deployed to `mainDevOrg`.
- Spendly is centered around a custom LWC workspace in `force-app/main/default/lwc/spendlyApp`.
- The app currently uses `Expense_Group__c`, `Category__c`, `Expense__c`, recurring expense automation, and Spendly Settings.
- Recent UI direction: keep the custom workspace, but make it feel closer to Salesforce Lightning/SLDS and avoid heavy custom styling unless needed.

## Recent Work

- Organized the 18 Apex classes and paired metadata into `classes/controller`, `classes/handler`, `classes/service`, and `classes/test` without changing their source contents.
- Added dedicated `RecurringExpenseTriggerHandlerTest` and `SpendlySettingsTriggerHandlerTest` coverage with direct handler invocation plus trigger wiring.
- Code Analyzer now reports 592 Low findings with 0 High and 0 Moderate findings; the handler and batch test improvements fixed nine Low findings from the prior 601 baseline.
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

- Git reports the path-only class reorganization as deleted root files and untracked categorized folders until the changes are staged; rename detection should resolve the moves when committed.
- If committing LWC changes, watch the pre-commit hook. Prettier may still adjust old hand-wrapped lines, but the config now avoids the prior whole-file quote/indent churn.
- Verify the app in the org after deploys because Salesforce shell height and page scroll behavior can differ from local expectations.
- Keep dashboard and expenses views in sync after create, edit, duplicate, delete, and bulk delete actions.
- For UI polish, prefer `lightning-*` base components and SLDS utility classes first.
- Check PHP currency formatting behavior before touching amount display.
- Do not commit `AGENTS.md`, `agent-docs/`, or this handover unless the user explicitly asks.

## Next Likely Work

- Commit the deployed Apex source reorganization. Suggested message: `chore: organize Apex classes by responsibility`.
- Continue the Low analyzer pass, prioritizing the three `AvoidNonRestrictiveQueries` findings before documentation-only and SLDS findings.
- Consider the test `runAs` and ApexDoc findings as separate, reviewable changes.
- Save broad CSS Low cleanup for a separate pass because `spendlyApp.css` has many SLDS hardcoded-value findings and can create large diffs.
