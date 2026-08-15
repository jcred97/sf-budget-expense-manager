# Budget & Expense Manager

Budget & Expense Manager is a Salesforce Lightning Web Components application for organizing expenses, recurring entries, and spending insights in Salesforce.

```text
Expense_Group__c -> Category__c -> Expense__c
```

The project is being prepared as a second-generation managed package with the registered namespace `bemgr`. Local source remains namespace-neutral; Salesforce applies `bemgr` when source is deployed to a namespaced scratch org or built into the managed package.

## Features

- Manage expenses under expense groups and categories.
- Filter and search expenses by group, category, date, name, bank, and transaction type.
- Review total spending, averages, leading categories and banks, recent expenses, and monthly trends.
- Add, edit, duplicate, delete, and bulk-delete expenses.
- Create recurring-expense templates and generate due expenses through Batch Apex.
- Configure global recurring automation.
- Export filtered expenses to CSV and open a print/PDF-friendly report.
- Use responsive, accessible modal and workspace interactions built with Lightning and SLDS patterns.

All currency presentation is PHP-focused and centralized in `expenseFormatters`.

## Data Model

- `Expense_Group__c` — top-level expense workspace.
- `Category__c` — master-detail child of an expense group.
- `Expense__c` — dated expense linked to a category and optionally to its recurring template.
- `Recurring_Expense__c` — recurring template with frequency, active state, and next-run pointer.
- `Budget_Expense_Manager_Setting__c` — singleton global automation settings and last-run state.

`Budget__c` is future scope and is not included in the current source.

## Architecture

### Apex

- `ExpenseController` — Lightning-facing query and command façade.
- `ExpenseQueryService` and `ExpenseCommandService` — scoped user-mode queries and DML.
- `RecurringExpenseCalculator`, `RecurringExpenseGenerator`, `RecurringExpenseService`, `RecurringExpenseBatch`, and `RecurringExpenseScheduler` — recurring-expense calculation, generation, batching, and scheduling.
- `BudgetExpenseSettingsService` — singleton settings and scheduler coordination.
- `RecurringExpenseTriggerHandler` and `BudgetExpenseSettingsTriggerHandler` — thin-trigger domain behavior.

### Lightning Web Components

- `budgetExpenseManager` — workspace shell, navigation, state, Apex orchestration, export, print, and modal ownership.
- `expenseDashboard` and `expenseDashboardViewModel` — dashboard presentation and pure derived state.
- `expenseList` and `expenseListViewModel` — filtered, grouped expense list and pagination.
- `recurringExpenses` and `recurringExpenseViewModel` — recurring-template presentation and summaries.
- `expenseModal` — add, edit, and duplicate workflow.
- `budgetExpenseSettings` — global recurring-automation controls.
- `expenseBarChart`, `expenseTrendChart`, `expenseSummaryCards`, `expenseTransforms`, and `expenseFormatters` — reusable visualization and transformation modules.

Public component properties, event contracts, Apex DTO fields, and the existing neutral business-object APIs were preserved during the API rebrand.

## Package Identity

| Concern                    | Value                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Product/package label      | Budget & Expense Manager                                                                           |
| Namespace                  | `bemgr`                                                                                            |
| Salesforce application API | `Budget_Expense_Manager`                                                                           |
| Main LWC                   | `budgetExpenseManager`                                                                             |
| Settings object            | `Budget_Expense_Manager_Setting__c`                                                                |
| Permission sets            | `Budget_Expense_Manager_User`, `Budget_Expense_Manager_Admin`, `Budget_Expense_Manager_All_Access` |
| Source API version         | `65.0`                                                                                             |

The checked-out directory and GitHub repository are still named `sf-spendly`. Their next planned names are `sf-budget-expense-manager`; the reviewed order and verification gates are documented in `agent-docs/repository-rename.md`. No repository or directory rename has run yet.

## Project Structure

```text
sf-spendly/
|- AGENTS.md
|- README.md
|- agent-docs/
|- config/
|- manifest/
|- force-app/main/default/
|  |- applications/
|  |- classes/{controller,handler,service,test}/
|  |- contentassets/
|  |- flexipages/
|  |- layouts/
|  |- lwc/
|  |- objects/
|  |- permissionsets/
|  |- tabs/
|  `- triggers/
|- scripts/migration/
|- package.json
`- sfdx-project.json
```

## Local Development

Requirements:

- Salesforce CLI
- Node.js and npm
- A Dev Hub linked to the `bemgr` namespace
- Namespaced scratch orgs for development and package validation

Useful commands:

```bash
npm install
npm run lint
npm run test:unit
npm run prettier:verify
sf code-analyzer run --workspace force-app --view detail
```

The repository-wide `prettier:verify` command currently reports legacy formatting debt outside the rebrand-owned files. Use targeted Prettier checks for changed files until that broader cleanup is handled separately.

`mainDevOrg` is currently the interim unpackaged development target while feature work and violation cleanup continue. Direct source deployments there remain unprefixed. Keep `bemgr` in `sfdx-project.json`; when package work begins, use a Dev Hub linked to that namespace and validate the same source in a namespaced scratch org before creating 2GP metadata.

## Testing

Eight Apex test classes cover expense queries and commands, recurring calculation and generation, batch and scheduler behavior, trigger handlers, singleton settings, and run-status tracking.

Jest tooling is configured through `@salesforce/sfdx-lwc-jest`, but no LWC Jest tests are currently checked in. A no-tests Jest result is therefore not behavioral coverage.

## Rebrand and Existing Data

The unpackaged API rebrand and its approved legacy cleanup are deployed to `mainDevOrg`. The existing expense-group, category, expense, and recurring-template APIs were deliberately left unchanged, so their records and IDs remain in place. The settings record, all-access assignment, and recurring schedule were mapped to the rebranded identities and verified.

No live Spendly-named metadata remains after cleanup deployment `0AfgK00000QSI4fSAH`. The old settings row was exported first, the legacy custom object was not purged, and post-cleanup reconciliation retained 3 expense groups, 18 categories, 11 recurring templates, 504 expenses, and 23 recurring links. See `agent-docs/api-rebrand.md`, `manifest/legacy-spendly-destructive.xml`, and `scripts/migration/` for the rename matrix, deployment evidence, rollback path, and verification tooling. No commit, push, managed-package creation, or GitHub repository rename has occurred.
