# Budget & Expense Manager

Budget & Expense Manager is a Salesforce Lightning Web Components application for organizing expenses, optional monthly budgets, recurring entries, foreign-currency purchases, and spending insights in Salesforce.

```text
Expense_Group__c
|- Budget__c (optional, one per month)
|- Expense_Group_Bank__c -> Bank__c (global institution)
`- Category__c -> Expense__c
```

The project is being prepared as a second-generation managed package with the registered namespace `bemgr`. Local source remains namespace-neutral; Salesforce applies `bemgr` when source is deployed to a namespaced scratch org or built into the managed package.

## Features

- Manage expenses under expense groups and categories.
- Optionally record a foreign-currency purchase with its original amount, historical PHP rate, effective date, and source while keeping reporting in PHP.
- Reuse global Bank records while each expense group controls which Banks are available.
- Filter and search expenses by group, category, date, name, bank, and transaction type.
- Review total spending, averages, leading categories and banks, recent expenses, and monthly trends.
- Optionally set monthly budgets for an expense group, track spent/remaining/over amounts, and compare the last six months on the Dashboard.
- Add, edit, duplicate, delete, and bulk-delete expenses.
- Add and edit recurring-expense templates in the workspace, then generate due expenses through Batch Apex.
- Configure global recurring automation.
- Export filtered expenses to CSV and open a print/PDF-friendly report.
- Use responsive, accessible modal and workspace interactions built with Lightning and SLDS patterns.

Reporting remains PHP-focused and is centralized in `expenseFormatters`. Foreign-currency details are optional audit data on an expense; `Expense__c.Amount__c` remains the converted PHP amount used by budgets, totals, charts, CSV, and print output.

## Data Model

- `Expense_Group__c` — top-level expense workspace.
- `Bank__c` — global, reusable financial-institution record.
- `Expense_Group_Bank__c` — active/inactive assignment of one global Bank to one expense group.
- `Budget__c` — optional monthly spending target for an expense group; absence of a record means budgeting is off for that month.
- `Category__c` — master-detail child of an expense group.
- `Expense__c` — master-detail child of a category and optionally to its recurring template; it can also retain an original amount/currency and the historical rate used to calculate its canonical PHP amount.
- `Recurring_Expense__c` — recurring template with frequency, active state, and next-run pointer.
- `Budget_Expense_Manager_Setting__c` — singleton global automation settings, stable base-currency code, and last-run state.

## Architecture

Source reviewed on **2026-09-30**, at application commit `6d0e13d`. The diagram describes the repository, not the live org. The latest simplifications are pushed; deployment and obsolete-metadata cleanup remain deferred.

![Current Salesforce application architecture](docs/assets/architecture.svg)

[Documentation index](docs/README.md) · [Detailed architecture](docs/architecture.md) · [Component inventory](docs/components.md) · [Open review findings](docs/review-findings.md) · [Testing notes](docs/testing-and-tooling.md)

### Apex

- `BankController`, `BudgetController`, `CurrencyContextController`, `ExchangeRateController`, `ExpenseController`, `RecurringExpenseController`, `RecurringExpenseAutomationController`, and `SettingsController` — the only Lightning-facing Apex entry points.
- Top-level classes under `classes/dto` define stable LWC request and response contracts; DTOs contain data and mapping only, not validation or persistence logic.
- `ExpenseController` owns its simple Expense Group and Category lookups; `BankController` owns its group-scoped Bank lookup and DTO mapping. All three lookups use user-mode queries.
- Extract services for substantial business logic or actual reuse; simple endpoint-specific queries do not need a separate service or selector class.
- `BudgetService` — user-mode lookup, validation, and mutation of optional monthly expense-group budgets.
- `ExpenseQueryService`, `ExpensePageService`, and `ExpenseCommandService` — scoped user-mode reads, keyset pagination, and deletion.
- `ExchangeRateService`, `FrankfurterExchangeRateProvider`, and `ExpenseCurrencyService` — validated ECB reference-rate lookup plus bulk-safe foreign-currency snapshot validation and PHP calculation.
- `CurrencyContextService` and `SalesforceOrganizationCurrencyProvider` — read-only access to the pinned app reporting currency plus Salesforce single-/multi-currency initialization.
- `RecurringExpenseCalculator`, `RecurringExpenseGenerator`, and `RecurringExpenseService` — recurring-expense calculation and generation services; Batch and Schedulable entry points live under `classes/async`.
- `BudgetExpenseSettingsService` — singleton settings, one-time base-currency initialization, pinned-code validation rules, and scheduler coordination.
- Bank assignment, budget, recurring-expense, and settings trigger handlers keep generated keys and cross-object invariants outside thin triggers.

### Lightning Web Components

- `budgetExpenseManager` — group selection, navigation, shared Category/Bank lookups, and cross-screen refresh coordination. The three screen components remain mounted across navigation and own their workflows.
- `expenseWorkspaceData` — imperative workspace read gateway for expenses, dashboard trend and budget-history data, and group-scoped Bank options.
- `expenseWorkspaceViewModels` — per-owner memoization for the Dashboard and Expenses builders. Recurring builds its display model directly.
- `expenseMonthNavigator` and `expensePrintReport` — reusable month navigation and isolated print/PDF presentation.
- `expenseDashboard` and `expenseDashboardViewModel` — independent month selection, dashboard data loading/errors, budget refresh, and pure derived presentation.
- `budgetPanel`, `budgetModal`, and `budgetHistory` — optional monthly budget status and mutations plus a six-month budget-versus-spending comparison.
- The Salesforce app navigation includes a standard **Budgets** tab for list-view and record-level administration.
- `expenseList` and `expenseListViewModel` — filters, cursor pagination, selection, deletion/rollback, modal ownership, CSV/print orchestration, and derived list presentation.
- `recurringExpenses` and `recurringExpenseViewModel` — recurring overview loading, Add/Edit modal ownership, deactivation, batch launch, and derived summaries.
- `recurringExpenseModal` — accessible Add/Edit workflow with group-scoped Category and Bank choices and a system-managed next-run pointer.
- `expenseModal` — add, edit, and duplicate workflow.
- `expenseCurrencyMath` and `expenseExchangeRateData` — exact decimal HALF_UP conversion plus the imperative, nonvisual gateway from the expense modal to the exchange-rate controller.
- `budgetExpenseSettings` — global recurring-automation controls.
- `expenseBarChart`, `expenseTrendChart`, and `expenseSummaryCards` — reusable visualization components.
- `recurringExpenseViewModel` — recurring row display values and summary cards, built together from the server overview.
- `expenseTransforms`, `expenseFormatters`, `expenseWorkspaceConfig`, `expenseErrorUtils`, `modalFocusUtils`, and `expenseCsvExport` — focused mapping, formatting, workspace-configuration, error, modal-accessibility, and export modules.

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

The GitHub repository is `jcred97/sf-budget-expense-manager`, `origin` uses `https://github.com/jcred97/sf-budget-expense-manager.git`, and the local checkout is `F:\Software Development\Salesforce\Personal\sf-budget-expense-manager`. The completed repository-identity work is recorded in `docs/history/repository-rename.md`.

## Project Structure

```text
sf-budget-expense-manager/
|- AGENTS.md
|- README.md
|- docs/  # current project documentation
|  |- assets/  # architecture diagram
|  `- history/  # earlier verification and migration records
|- config/
|- manifest/
|- force-app/main/default/
|  |- applications/
|  |- classes/{async,controller,dto,handler,service,test}/
|  |- contentassets/
|  |- flexipages/
|  |- layouts/
|  |- lwc/
|  |- objects/
|  |- permissionsets/
|  |- tabs/
|  `- triggers/
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

Eighteen Apex test classes cover global Bank assignments, expense queries and commands, optional monthly budgets, exchange-rate callouts, foreign-currency integrity, recurring calculation and generation, batch and scheduler behavior, trigger handlers, singleton settings, and run-status tracking.

The 2026-09-30 source review passed **66 Jest tests across 9 suites** and `npm run lint`. Suites cover the workspace integration, three screens, expense modal, recurring view model, transforms, workspace data, and CSV export. Screen tests mount their owning component directly; integration tests remain with the manager.

Apex tests were not rerun and the live org was not inspected during that review. Direct settings, budget-panel/dialog, recurring-dialog and FX-interaction coverage remains incomplete; Jest does not verify browser print layout. See [testing notes](docs/testing-and-tooling.md) for current checks and historical deployment evidence.

## Open Review Findings

The five confirmed issues remain **open**, not fixed by the ownership refactors: saving settings before successful load, failure to create a missing same-time schedule, Run Recurring exposed to the regular User role, refreshing on batch enqueue rather than completion, and incomplete recurring summaries above 500 templates. [Reproduction conditions and proposed fixes](docs/review-findings.md).

Groups and recurring templates use internal Public Read/Write sharing; this is not private-per-user budgeting by default. Admin and All Access currently grant equivalent object/controller capabilities. Permission sets remain additive to other org permissions.

## Historical Rebrand and Existing Data

The following is the recorded rebrand outcome, not a fresh live-org assertion as of 2026-09-30. It does not imply the later refactors or their cleanup have been deployed.

The unpackaged API rebrand and its approved legacy cleanup are deployed to `mainDevOrg`. The existing expense-group, category, expense, and recurring-template APIs were deliberately left unchanged, so their records and IDs remain in place. The settings record, all-access assignment, and recurring schedule were mapped to the rebranded identities and verified.

The recorded inventory found no live Spendly-named metadata after cleanup deployment `0AfgK00000QSI4fSAH`. The old settings row was exported first, the legacy custom object was not purged, and post-cleanup reconciliation retained 3 expense groups, 18 categories, 11 recurring templates, 504 expenses, and 23 recurring links. See `docs/history/api-rebrand.md` and `manifest/legacy-spendly-destructive.xml` for the rename matrix, deployment evidence, and cleanup boundary. The one-off migration scripts were removed after the verified cutovers. The rebrand is committed and pushed as `50e1eeb`, and the GitHub repository and local checkout now use `sf-budget-expense-manager`; managed-package creation remains pending.
