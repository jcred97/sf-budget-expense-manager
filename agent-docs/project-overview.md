# Project Overview - Budget & Expense Manager

Budget & Expense Manager is a Salesforce Lightning Web Components expense-management app being prepared for a `bemgr` second-generation managed package.

Users log expenses under a two-level hierarchy and can optionally add one budget per expense group and calendar month:

```text
Expense Group
|- Monthly Budget (optional)
`- Category -> Expense
```

The main app lets users filter, summarize, visualize, edit, duplicate, delete, export, and print expenses. The Dashboard also lets a user opt into a monthly spending target, compare it with the selected month's expenses, edit it, or remove it without affecting any expenses. Expenses store a required date and optional transaction time so same-day activity can be ordered without converting the date field to DateTime.
