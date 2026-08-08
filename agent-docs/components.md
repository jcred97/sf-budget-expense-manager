# Components

| Path                                       | Role                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lwc/spendlyApp`                           | Main workspace shell and coordinator: owns Expense Group context, navigation, mutable state, Apex loading, actions, export, print, and modal orchestration |
| `lwc/spendlyDashboardView`                 | Dashboard presentation: hero, loading/empty states, summary cards, charts, latest expenses, insights, responsive styling, and View All event               |
| `lwc/spendlyDashboardViewModel`            | Non-exposed pure builder for dashboard totals, summaries, charts, trends, recent rows, and insight data                                                    |
| `lwc/spendlyExpenses`                      | Expenses presentation: filters, loading/empty states, grouped rows, selection, actions, pagination, and responsive styling                                 |
| `lwc/spendlyExpensesViewModel`             | Non-exposed pure builder for filtered/grouped expense rows, totals, empty states, pagination, and print data                                               |
| `lwc/spendlyRecurringExpenses`             | Recurring-expense presentation: summary cards, template list, due/inactive states, and row actions                                                         |
| `lwc/spendlyRecurringViewModel`            | Non-exposed pure builder for recurring summary cards, counts, totals, and row data                                                                         |
| `lwc/spendlyBarChart`                      | Reusable horizontal bar chart                                                                                                                              |
| `lwc/spendlyTrendChart`                    | Monthly trend visualization                                                                                                                                |
| `lwc/spendlySummaryCards`                  | Reusable data-driven summary metric cards; accepts one card configuration collection                                                                       |
| `lwc/spendlyFormatters`                    | Non-exposed pure utilities for PHP currency, compact currency, date/time, ISO date, month label, month bounds, and date parsing                            |
| `lwc/spendlyExpenseTransforms`             | Non-exposed pure utilities for expense mapping, grouping, summaries, chart construction, chart colors, totals, and count labels                            |
| `lwc/spendlyExpenseModal`                  | Add/Edit Expense modal: form, animations, and focus management                                                                                             |
| `lwc/spendlySettings`                      | Settings page for recurring automation controls, global run time, and last-run status                                                                      |
| `classes/controller/SpendlyController.cls` | Apex backend: expense group/category/expense queries, dashboard trend query, recurring template overview query, and scoped DML actions                     |
| `classes/handler/`                         | Trigger handlers for recurring expense defaults and Spendly Settings singleton enforcement                                                                 |
| `classes/service/`                         | Expense query/command services and recurring expense calculation, generation, batch, scheduling, and settings services                                     |
| `classes/test/`                            | Apex tests grouped separately from production classes                                                                                                      |
