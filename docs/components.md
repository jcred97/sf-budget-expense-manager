# Components

| Path                                                          | Role                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `lwc/budgetExpenseManager`                                    | Workspace shell: group selection, navigation, shared category/bank lookups, and refresh coordination across the three screens |
| `lwc/expenseWorkspaceConfig`                                  | Non-exposed keys and navigation items for Dashboard, Expenses, and Recurring                                                     |
| `lwc/expenseWorkspaceData`                                    | Non-exposed imperative read gateway for expense rows, Dashboard trend/budget history, and group-scoped Bank options                          |
| `lwc/expenseWorkspaceViewModels`                              | WeakMap memoization by component owner and input identity for dashboard and expense-list builders only; recurring uses its builder directly |
| `lwc/expenseCsvExport`                                        | Non-exposed CSV construction and browser download boundary for filtered expense rows                                                         |
| `lwc/expenseCurrencyMath`                                     | Non-exposed exact decimal multiplication and HALF_UP rounding shared with the Apex conversion invariant                                      |
| `lwc/expenseExchangeRateData`                                 | Non-exposed imperative gateway to the PHP exchange-rate controller                                                                           |
| `lwc/expenseErrorUtils`                                       | Non-exposed shared normalization of Apex, LDS/UI API, record-form, network, and JavaScript error messages                                    |
| `lwc/modalFocusUtils`                                         | Non-exposed shared modal body locking, focus restoration, focusable-element discovery, and Tab trapping                                      |
| `lwc/expenseMonthNavigator`                                   | Non-exposed reusable previous/current/next month control used by Dashboard and Expenses                                                      |
| `lwc/expensePrintReport`                                      | Non-exposed print-only expense summary and detail table                                                                                      |
| `lwc/expenseDashboard`                                        | Owns dashboard data loading, month navigation, loading/error states, view-model assembly, and budget refresh; exposes refresh() for workspace changes and emits Add Expense/View All events |
| `lwc/expenseDashboardViewModel`                               | Non-exposed presentation builder for server dashboard summaries, charts, trends, budget variance history, bounded recent rows, and insights |
| `lwc/budgetPanel`                                             | Non-exposed optional monthly budget card: load, opt-in state, spent/remaining/over status, edit, remove, retry, and toasts                   |
| `lwc/budgetModal`                                             | Non-exposed accessible create/edit dialog for a positive PHP budget amount and optional description                                          |
| `lwc/budgetHistory`                                           | Non-exposed SLDS table comparing six months of optional budgets, spending, variance, and percentage used                                     |
| `lwc/expenseList`                                             | Owns expense filters, paginated loading, selection, mutations, Add/Edit/Duplicate modal, and CSV/print reporting; exposes refresh() and openExpenseModal() for shared workspace actions |
| `lwc/expenseListViewModel`                                    | Non-exposed pure builder for server-filtered expense rows, date groups, full-result totals, empty states, pagination, and print data                                 |
| `lwc/recurringExpenses`                                       | Owns recurring pages, summaries, modal state, deactivation, and manual-run status; receives shared lookup options and notifies the manager after terminal generation status |
| `lwc/recurringExpenseModal`                                   | Non-exposed LDS Add/Edit dialog with atomic loading, group-scoped Category/Bank selectors, legacy handling, and focus management             |
| `lwc/recurringExpenseViewModel`                               | Non-exposed pure builder for recurring row display values, summary cards, counts, and totals                                                           |
| `lwc/expenseBarChart`                                         | Reusable horizontal bar chart                                                                                                                |
| `lwc/expenseTrendChart`                                       | Monthly trend visualization                                                                                                                  |
| `lwc/expenseSummaryCards`                                     | Reusable data-driven summary metric cards; accepts one card configuration collection                                                         |
| `lwc/expenseFormatters`                                       | Non-exposed pure utilities for PHP/generic ISO currency, compact currency, date/time and ranges, ISO dates, month labels/bounds, and parsing |
| `lwc/expenseTransforms`                                       | Non-exposed pure utilities for PHP/FX expense mapping, grouping, summaries, chart construction, colors, totals, and count labels             |
| `lwc/expenseModal`                                            | Add/Edit Expense modal: atomic loading, optional FX conversion, animations, focus management, and document-level lifecycle cleanup           |
| `lwc/budgetExpenseSettings`                                   | Settings page for recurring automation controls, global run time, and last-run status                                                        |
| `classes/controller/BankController.cls`                       | Direct user-mode group-scoped active Bank query and option mapping                                                                                  |
| `classes/controller/BudgetController.cls`                     | Lightning-facing current-month and bounded six-month budget query/save/delete façade                                                         |
| `classes/controller/CurrencyContextController.cls`            | Lightning-facing cacheable façade over the initialized app reporting currency                                                                |
| `classes/controller/ExchangeRateController.cls`               | Lightning-facing read-only PHP exchange-rate façade with sanitized client errors                                                             |
| `classes/controller/ExpenseController.cls`                    | Expense entry points and direct user-mode Expense Group/Category lookups                                                            |
| `classes/service/ExpenseDashboardService.cls`                 | User-mode dashboard aggregates with complete summaries and bounded recent/largest expense details |
| `classes/controller/RecurringExpenseController.cls`           | Lightning-facing recurring-template overview/deactivate façade available to normal app users                                                 |
| `classes/controller/RecurringExpenseAutomationController.cls` | Admin-only Lightning façade for synchronous or Batch Apex recurring generation                                                               |
| `classes/controller/SettingsController.cls`                   | Admin-only Lightning façade for singleton settings reads and updates                                                                         |
| `classes/dto/`                                                | Top-level, data-only LWC requests and responses for budgets, expenses, recurring generation/overview, settings, and Bank options             |
| `classes/handler/`                                            | Trigger handlers for Bank assignments, expense Bank checks, budget invariants, recurring defaults/date validation, and settings              |
| `classes/service/BankAssignmentValidator.cls`                 | Bulk cross-object validation and legacy compatibility for Expense and Recurring Expense Bank assignments                                     |
| `classes/service/CurrencyContextService.cls`                  | Read-only pinned-currency lookup, validation, transaction caching, and organization-currency initialization boundary                         |
| `classes/service/SalesforceOrganizationCurrencyProvider.cls`  | Single-currency org-default or dynamic multi-currency corporate-code resolver                                                                |
| `classes/service/ExchangeRateService.cls`                     | Request/quote validation, PHP identity handling, business-day freshness policy, and provider normalization                                   |
| `classes/service/FrankfurterExchangeRateProvider.cls`         | HTTP and JSON boundary for ECB-pinned Frankfurter v2 reference rates                                                                         |
| `classes/service/ExpenseCurrencyService.cls`                  | Bulk-safe optional FX snapshot normalization, validation, and canonical PHP calculation                                                      |
| `classes/service/`                                            | Non-Lightning business/query services for bank validation, budgets, expenses, recurring generation, currency, and settings behavior                                 |
| `classes/async/`                                              | Batch and Schedulable recurring-expense execution entry points; batch completion persists job-specific generation-limit outcomes |
| `objects/Recurring_Expense_Run__c/`                           | Private automation-owned outcome keyed to a recurring batch job; no direct app object access grants |
| `classes/test/`                                               | Apex tests grouped separately from production classes                                                                                        |

## Screen Lifetime And Events

All three workspace screens stay mounted across navigation. The manager hides Dashboard
and Recurring sections; `expenseList` hides its interactive screen internally. This preserves
the independent dashboard month and expense filters, loaded pages, selection, and pending
actions. A group change resets each screen's scoped data and closes expense/recurring dialogs.

The manager supplies category and bank options with loading/error state. Expense actions
request bank refreshes and emit `expenseschanged` to refresh the dashboard. Recurring dialog
opening requests both category and bank refreshes; `generationcompleted` refreshes the other
screens and category lookup after terminal batch status. `recurringRunMonitor` shares pending
job tracking between both manual-run screens, including bounded polling and status retries.
Dashboard emits `addexpense` and `viewexpenses`; Add Expense calls the list's public
modal opener even while the list screen is hidden. Budget changes stay within the dashboard.

`expenseModal` and `recurringExpenseModal` save through Lightning Data Service record forms.
The list owns its modal and complete print report outside the hidden interactive section;
the recurring screen owns its modal. The standalone settings component is a separate page,
not a fourth workspace view.

## Verification Boundaries

Jest suites cover manager integration, dashboard, expense list, recurring screen,
expense modal, recurring view model, expense transforms, workspace data, and CSV output.
An additional settings suite covers load failures, retry, and save/refresh exclusion.
Expense modal FX suites cover quote cancellation and error recovery, Save blocking,
complete snapshot submission, PHP cleanup, and edit/duplicate preservation. Direct
currency-math and exchange-rate adapter suites cover decimal rounding and request contracts.
A direct budget-panel suite covers retry failure/recovery, pending retries, group/month
changes, stale completion, switching away and back, and disconnect/reconnect. There is
no direct suite for budget modal. A recurring-modal suite covers loading, record-context
retry isolation, date validation, pending-save guards, save-error recovery, and success events.
Lightning record responses and field validity are mocked; these tests do not establish live
LDS behavior or Salesforce print/PDF layout correctness. See `key-patterns.md`
for recurring-action review findings and asynchronous run limitations.
