# Project Overview - Budget & Expense Manager

Budget & Expense Manager is a Salesforce Lightning Web Components expense-management app being prepared for a `bemgr` second-generation managed package.

Users log expenses under a two-level hierarchy and can optionally add one budget per expense group and calendar month:

```text
Expense Group
|- Monthly Budget (optional)
|- Bank Assignment -> Global Bank
`- Category -> Expense
```

Recurring templates belong to Categories and generate Expenses linked back to their
`Recurring_Expense__c` source. App-level settings configure recurring execution and retain
the latest run status; Batch Apex and a daily scheduler perform generation.

The main workspace has three persistently mounted screens: Dashboard, Expenses, and Recurring.
Each screen owns its data, loading state, and actions. `budgetExpenseManager` coordinates
group selection, navigation, shared Category/Bank lookups, and cross-screen refreshes.
Dashboard and Expenses retain independent selected months. The separate Settings page controls
automation and is not a fourth workspace view. Salesforce record tabs and layouts remain
additional entry points alongside the custom workspace.

The main app lets users filter, summarize, visualize, edit, duplicate, delete, export, and print expenses. Global `Bank__c` records are reused across groups through `Expense_Group_Bank__c`; only active Banks assigned to the selected Expense Group are offered for new expense choices. The Dashboard also lets a user opt into a monthly spending target, compare it with the selected month's expenses, edit it, or remove it without affecting any expenses. Expenses store a required date and optional transaction time so same-day activity can be ordered without converting the date field to DateTime.

Foreign-currency entry is optional per Expense. When enabled, the record retains the original amount and ISO currency code together with the PHP-per-unit rate, effective date, and source. `Expense__c.Amount__c` remains the rounded PHP amount used by every budget, total, average, chart, export, and print aggregate; ordinary PHP expenses keep the original blank-FX behavior.

The record-based Bank migration is additive. `Expense__c.Bank_Assignment__c` and `Recurring_Expense__c.Bank_Assignment__c` are optional during the compatibility window, while the original shared-picklist `Bank__c` fields remain as temporary read-only fallback data until a separately approved cleanup.

The latest screen-ownership refactors are source changes; deployment and obsolete-org-metadata
cleanup remain deferred. Review findings in `key-patterns.md` describe current limitations,
including settings writes before initial loading completes and the ungated manual Run control.
They are not assertions that those issues have already been repaired.
