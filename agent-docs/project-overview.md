# Project Overview - Budget & Expense Manager

Budget & Expense Manager is a Salesforce Lightning Web Components expense-management app being prepared for a `bemgr` second-generation managed package.

Users log expenses under a two-level hierarchy and can optionally add one budget per expense group and calendar month:

```text
Expense Group
|- Monthly Budget (optional)
|- Bank Assignment -> Global Bank
`- Category -> Expense
```

The main app lets users filter, summarize, visualize, edit, duplicate, delete, export, and print expenses. Global `Bank__c` records are reused across groups through `Expense_Group_Bank__c`; only active Banks assigned to the selected Expense Group are offered for new expense choices. The Dashboard also lets a user opt into a monthly spending target, compare it with the selected month's expenses, edit it, or remove it without affecting any expenses. Expenses store a required date and optional transaction time so same-day activity can be ordered without converting the date field to DateTime.

The record-based Bank migration is additive. `Expense__c.Bank_Assignment__c` and `Recurring_Expense__c.Bank_Assignment__c` are optional during the compatibility window, while the original shared-picklist `Bank__c` fields remain as temporary read-only fallback data until a separately approved cleanup.
