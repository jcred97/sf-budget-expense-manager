# Testing And Tooling

## Apex Tests

Apex tests live in `ExpenseControllerTest.cls`, `RecurringExpenseTriggerHandlerTest.cls`, `BudgetExpenseSettingsTriggerHandlerTest.cls`, `RecurringExpenseBatchTest.cls`, `RecurringExpenseCalculatorTest.cls`, `RecurringExpenseServiceTest.cls`, `RecurringExpenseSchedulerTest.cls`, and `BudgetExpenseSettingsServiceTest.cls`.

The test setup creates:

- 2 expense groups: Food and Transport
- 3 categories: Groceries, Dining, Taxi
- 3 expenses with amounts 100, 200, and 300

Covered behavior includes:

- `getAllExpenseGroups`
- `getCategoriesByExpenseGroup`
- `getExpensesByFilters`
- single expense delete
- bulk expense delete
- monthly trend data
- handled delete failures
- recurring expense trigger defaults for `Next_Run_Date__c`
- recurring expense batch generation for more than the manual run cap, default construction, and null run-date validation
- recurring expense next-run-date calculation for daily, weekly, monthly, and yearly frequencies
- recurring expense generation, catch-up behavior, end dates, inactive records, future records, manual batch start, and null run-date validation
- scheduled recurring expense generation
- Budget & Expense Manager Settings default creation, updates, singleton protection, and recurring run status tracking

## LWC Tests

LWC tests use `@salesforce/sfdx-lwc-jest`, but no LWC Jest tests are currently checked in. A Jest run with `--passWithNoTests` validates the test harness only and does not provide behavioral coverage.

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
- These six combined CSS changes have not yet been committed, pushed, deployment-validated, or deployed. Run a signed-in visual smoke test after deployment because semantic hooks resolve from the active Salesforce theme rather than their fallback values.

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

Same-org unpackaged migration and verification scripts live in `scripts/migration/`. They are intentionally separate from the future unpackaged-to-`bemgr` managed-package data migration.

## Currency

All amounts are in PHP (Philippine Peso). Shared display formatting is centralized in `expenseFormatters` with `Intl.NumberFormat`; view models and expense transforms provide formatted values to presentation components.
