# Testing And Tooling

## Apex Tests

Apex tests live in `SpendlyControllerTest.cls`, `RecurringExpenseTriggerHandlerTest.cls`, `SpendlySettingsTriggerHandlerTest.cls`, `SpendlyRecurringExpenseBatchTest.cls`, `SpendlyRecurringExpenseCalculatorTest.cls`, `SpendlyRecurringExpenseServiceTest.cls`, `SpendlyRecurringExpenseSchedulerTest.cls`, and `SpendlySettingsServiceTest.cls`.

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
- Spendly Settings default creation, updates, singleton protection, and recurring run status tracking

## LWC Tests

LWC tests use `@salesforce/sfdx-lwc-jest`.

Current known test location:

- `spendlyExpenseModal/__tests__/spendlyExpenseModal.test.js`

## Tooling

- ESLint with Aura and LWC recommended rules
- Prettier with Apex and XML plugins
- Husky pre-commit hooks
- lint-staged
- Jest ignores `.localdevserver`

## Destructive Deploy

The Git-ignored `destructive/` directory is used for task-specific destructive manifests. Verify every member against local references and the target org before running it:

```bash
sf project deploy start --dry-run --manifest destructive/package.xml --post-destructive-changes destructive/destructiveChanges.xml --target-org your-org-alias
```

Run the same command without `--dry-run` only after the validation succeeds. The latest destructive deployment removed the obsolete `spendlyDataTransforms` bundle after its replacement, `spendlyExpenseTransforms`, was deployed.

The recurring expense generator uses `Next_Run_Date__c` as its continuation pointer.

## Currency

All amounts are in PHP (Philippine Peso). Shared display formatting is centralized in `spendlyFormatters` with `Intl.NumberFormat`; view models and expense transforms provide formatted values to presentation components.
