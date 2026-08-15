# Budget & Expense Manager API Rebrand

## Current Status

The source tree has been rebranded for the future `bemgr` second-generation managed package. The unpackaged rebrand and its approved legacy-metadata cleanup were deployed to `mainDevOrg` on 2026-08-15; they have not been committed, pushed, used to create a package, or used to rename the local checkout or GitHub repository.

`mainDevOrg` has no namespace. The deployed APIs are therefore unprefixed even though `sfdx-project.json` retains `"namespace": "bemgr"` for future namespaced scratch-org and managed-package work.

The previous `Spendly` names in this document are intentional migration and rollback references. No live Spendly-named metadata remains in `mainDevOrg` after cleanup deployment `0AfgK00000QSI4fSAH`.

## Package Identity

- Product and package label: **Budget & Expense Manager**
- Namespace: `bemgr`
- Project identity: `sf-budget-expense-manager`
- Application and main-tab API: `Budget_Expense_Manager`
- Main LWC: `budgetExpenseManager`

Local source uses unprefixed APIs. Installed custom metadata will receive the `bemgr__` namespace automatically; Apex types are externally qualified with `bemgr.`.

## Apex Rename Matrix

| Previous API                        | Current local API                     |
| ----------------------------------- | ------------------------------------- |
| `SpendlyController`                 | `ExpenseController`                   |
| `SpendlyExpenseQueryService`        | `ExpenseQueryService`                 |
| `SpendlyExpenseCommandService`      | `ExpenseCommandService`               |
| `SpendlyRecurringExpenseCalculator` | `RecurringExpenseCalculator`          |
| `SpendlyRecurringExpenseGenerator`  | `RecurringExpenseGenerator`           |
| `SpendlyRecurringExpenseService`    | `RecurringExpenseService`             |
| `SpendlyRecurringExpenseBatch`      | `RecurringExpenseBatch`               |
| `SpendlyRecurringExpenseScheduler`  | `RecurringExpenseScheduler`           |
| `SpendlySettingsService`            | `BudgetExpenseSettingsService`        |
| `SpendlySettingsTrigger`            | `BudgetExpenseSettingsTrigger`        |
| `SpendlySettingsTriggerHandler`     | `BudgetExpenseSettingsTriggerHandler` |

Matching test-class APIs were renamed with their production classes. `RecurringExpenseTrigger`, `RecurringExpenseTriggerHandler`, and `RecurringExpenseTriggerHandlerTest` remain unchanged because they were already product-neutral.

## LWC Rename Matrix

| Previous bundle             | Current local bundle        |
| --------------------------- | --------------------------- |
| `spendlyApp`                | `budgetExpenseManager`      |
| `spendlyDashboardView`      | `expenseDashboard`          |
| `spendlyDashboardViewModel` | `expenseDashboardViewModel` |
| `spendlyExpenses`           | `expenseList`               |
| `spendlyExpensesViewModel`  | `expenseListViewModel`      |
| `spendlyExpenseModal`       | `expenseModal`              |
| `spendlyRecurringExpenses`  | `recurringExpenses`         |
| `spendlyRecurringViewModel` | `recurringExpenseViewModel` |
| `spendlyBarChart`           | `expenseBarChart`           |
| `spendlyTrendChart`         | `expenseTrendChart`         |
| `spendlySummaryCards`       | `expenseSummaryCards`       |
| `spendlyFormatters`         | `expenseFormatters`         |
| `spendlyExpenseTransforms`  | `expenseTransforms`         |
| `spendlySettings`           | `budgetExpenseSettings`     |

Component public properties, custom events, controller method signatures, and settings DTO fields remain unchanged.

## Supporting Metadata Rename Matrix

| Metadata                  | Previous API                      | Current local API                        |
| ------------------------- | --------------------------------- | ---------------------------------------- |
| Custom object             | `Spendly_Settings__c`             | `Budget_Expense_Manager_Setting__c`      |
| Application               | `Spendly`                         | `Budget_Expense_Manager`                 |
| Main custom tab           | `Spendly`                         | `Budget_Expense_Manager`                 |
| Settings custom tab       | `Spendly_Settings`                | `Budget_Expense_Manager_Settings`        |
| Utility bar               | `Spendly_UtilityBar`              | `Budget_Expense_Manager_UtilityBar`      |
| Content asset             | `spendly1`                        | `budgetExpenseManagerLogo`               |
| User permission set       | `Spendly_User`                    | `Budget_Expense_Manager_User`            |
| Admin permission set      | `Spendly_Admin`                   | `Budget_Expense_Manager_Admin`           |
| All-access permission set | `Spendly_All_Access`              | `Budget_Expense_Manager_All_Access`      |
| Scheduled job             | `Spendly Recurring Expense Daily` | `Budget Expense Manager Recurring Daily` |

The settings fields retain their existing APIs. The neutral business APIs `Expense_Group__c`, `Category__c`, `Expense__c`, `Recurring_Expense__c`, and `Bank` also remain unchanged. `Budget__c` is future scope.

The org also contained an older, unreferenced `spendly` content asset that was no longer in the current source tree. Cleanup removed both `spendly` and `spendly1`; `budgetExpenseManagerLogo` remains.

## Data-Safe Deployment Requirements

Renaming local metadata paths does not rename deployed Salesforce metadata in place. Before any destructive cleanup in an existing unpackaged org:

1. Query and record the live scheduled-job name, cron expression, owner, and owner timezone.
2. Deploy the new settings object and renamed application metadata without deleting the previous settings object or activating a second schedule.
3. Capture existing permission-set assignments and recreate them against the renamed permission sets.
4. Copy or update the singleton settings record field-for-field:
    - `Name`
    - `Recurring_Expenses_Enabled__c`
    - `Global_Recurring_Run_Time__c`
    - `Last_Recurring_Run_DateTime__c`
    - `Last_Recurring_Run_Status__c`
    - `Last_Recurring_Run_Message__c`
5. Validate record counts, settings equality, permissions, and the rebranded Apex endpoints.
6. In one guarded cutover transaction under the verified schedule owner/timezone, abort the legacy job and create exactly one `Budget Expense Manager Recurring Daily` job using the preserved cron.
7. Validate the application, tabs, settings UI, expense CRUD, recurring generation, and final scheduler behavior.
8. Only after successful verification and explicit approval, remove the previous branded Apex, triggers, LWCs, settings object, tabs, app, utility bar, permission sets, layout, and content asset with a reviewed destructive manifest.

If the destination is a new namespaced package installation, every packaged custom object is a distinct metadata identity from the existing unpackaged object, even when the unprefixed developer name matches. Migrating existing unpackaged expense data into the managed package therefore requires a separate hierarchy-aware migration in this order:

```text
Expense_Group__c
  -> Category__c
     -> Recurring_Expense__c
     -> Expense__c
```

Preserve lookup mappings, recurrence pointers, transaction dates/times, and source identifiers for reconciliation.

## Validation Boundary

The following `mainDevOrg` operations completed on 2026-08-15:

- Staged the renamed settings object and fields with deployment `0AfgK00000QRZ4LSAX`.
- Deployed all 47 add-only rebrand components with deployment `0AfgK00000QRFgkSAH`.
- Validated all 47 components and 52 specified Apex tests with validation `0AfgK00000QRZnWSAX`; all tests passed and every rebranded production class/trigger reported at least 88% coverage.
- Assigned `Budget_Expense_Manager_All_Access` to the existing legacy all-access assignee.
- Copied and field-for-field verified the singleton settings record.
- Replaced the active legacy schedule with one `Budget Expense Manager Recurring Daily` job using the same owner, `0 0 8 * * ?` cron, and `Asia/Manila` timezone.
- Verified the unchanged business hierarchy: 3 expense groups, 18 categories, 11 recurring templates, and 504 expenses; all required relationships remain populated and 23 expenses retain their recurring-template link.
- Ran a read-only smoke test through the LWC-facing Apex endpoints; it returned the complete dataset, five trend buckets, the migrated settings, and the active renamed schedule.
- Corrected the SLDS 2 horizontal-bar radius regression and deployed `expenseBarChart` with deployment `0AfgK00000QReiNSAT` after successful dry run `0AfgK00000QRteCSAT`.
- Completed the signed-in visual application smoke test, including the corrected category bars, before cleanup approval.
- Exported the legacy settings row to the Git-ignored `scripts/migration/backups/legacy-spendly-2026-08-15/` rollback directory and recorded SHA-256 hashes and the source revision in its backup manifest.
- Removed obsolete assignment `0PagK00000QDjTQSA1` only after confirming replacement assignment `0PagK00000aoXNRSA2` for `Budget_Expense_Manager_All_Access`.
- The first cleanup validation `0AfgK00000QRnwxSAD` failed closed because the obsolete permission set was still assigned; no metadata was changed.
- Validated the complete cleanup with check-only deployment `0AfgK00000QSD8ESAX`: 42/42 deletion actions and 52/52 specified tests passed.
- Removed the legacy app, tabs, utility bar, permission sets, 14 LWCs, 17 Apex classes, trigger, settings object and layout, and both legacy content assets with deployment `0AfgK00000QSI4fSAH`. The deployment passed 42/42 actions and 52/52 tests. It did not use purge-on-delete.
- Verified zero live Spendly/TrackSpend metadata across the cleaned metadata types, retained the renamed all-access assignment, and reran the LWC-facing endpoint smoke test successfully.
- Post-cleanup reconciliation retained 3 expense groups, 18 categories, 11 recurring templates, 504 expenses, all required relationships, and 23 recurring-template links. The 08:00 renamed schedule fired successfully during the verification window, reported that no recurring expenses were due, and remains the single `WAITING` schedule for the next day.

Live cutover identifiers for audit and rollback:

- Legacy settings (deleted with recoverable legacy object; exported first): `a0FgK000009W2G1UAK`
- Rebranded settings: `a02gK00000OS1eZQAT`
- New all-access assignment: `0PagK00000aoXNRSA2`
- Aborted legacy schedule: `08egK00000abAWkQAM`
- Active renamed schedule: `08egK00000bdZGlQAM`

The legacy branded metadata and settings object no longer remain live in the org. Rollback requires restoring the old metadata from Git revision `7881645b558050f1599e6ec0be8fb1e9bda66f61` and then importing the ignored settings backup; do not overwrite the current settings singleton during rollback.

## Pending Repository Identity Rename

The remaining non-Salesforce rebrand is planned but not yet executed. GitHub repository `jcred97/sf-spendly` and local checkout `F:\Salesforce\Personal\sf-spendly` are both intended to become `sf-budget-expense-manager`. Follow `agent-docs/repository-rename.md`; repository renaming does not add a Salesforce namespace or create a managed package.
