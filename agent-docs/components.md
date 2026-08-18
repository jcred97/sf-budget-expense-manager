# Components

| Path                                       | Role                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `lwc/budgetExpenseManager`                 | Main workspace shell and coordinator: owns Expense Group context, mutable state, Apex loading, actions, print, and modal orchestration       |
| `lwc/expenseWorkspaceConfig`               | Non-exposed workspace view keys, labels, navigation items, and active-view configuration                                                     |
| `lwc/expenseCsvExport`                     | Non-exposed CSV construction and browser download boundary for filtered expense rows                                                         |
| `lwc/expenseDashboard`                     | Dashboard presentation: hero, loading/empty states, summary cards, charts, latest expenses, insights, responsive styling, and View All event |
| `lwc/expenseDashboardViewModel`            | Non-exposed pure builder for dashboard totals, summaries, charts, trends, recent rows, and insight data                                      |
| `lwc/expenseList`                          | Expenses presentation: filters, loading/empty states, grouped rows, selection, actions, pagination, and responsive styling                   |
| `lwc/expenseListViewModel`                 | Non-exposed pure builder for filtered/grouped expense rows, totals, empty states, pagination, and print data                                 |
| `lwc/recurringExpenses`                    | Recurring-expense presentation: summary cards, template list, due/inactive states, and row actions                                           |
| `lwc/recurringExpenseTransforms`           | Non-exposed mapper for recurring-template display labels, formatted values, statuses, and active windows                                     |
| `lwc/recurringExpenseViewModel`            | Non-exposed pure builder for recurring summary cards, counts, totals, and row data                                                           |
| `lwc/expenseBarChart`                      | Reusable horizontal bar chart                                                                                                                |
| `lwc/expenseTrendChart`                    | Monthly trend visualization                                                                                                                  |
| `lwc/expenseSummaryCards`                  | Reusable data-driven summary metric cards; accepts one card configuration collection                                                         |
| `lwc/expenseFormatters`                    | Non-exposed pure utilities for PHP currency, compact currency, date/time and ranges, ISO dates, month labels/bounds, and date parsing        |
| `lwc/expenseTransforms`                    | Non-exposed pure utilities for expense mapping, grouping, summaries, chart construction, chart colors, totals, and count labels              |
| `lwc/expenseModal`                         | Add/Edit Expense modal: form, animations, focus management, and document-level lifecycle cleanup                                             |
| `lwc/budgetExpenseSettings`                | Settings page for recurring automation controls, global run time, and last-run status                                                        |
| `classes/controller/ExpenseController.cls` | Apex backend: expense group/category/expense queries, dashboard trend query, recurring template overview query, and scoped DML actions       |
| `classes/handler/`                         | Trigger handlers for recurring expense defaults and Budget & Expense Manager settings singleton enforcement                                  |
| `classes/service/`                         | Expense query/command services and recurring expense calculation, generation, batch, scheduling, and settings services                       |
| `classes/test/`                            | Apex tests grouped separately from production classes                                                                                        |
