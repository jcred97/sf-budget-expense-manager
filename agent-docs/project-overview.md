# Project Overview - Budget & Expense Manager

Budget & Expense Manager is a Salesforce Lightning Web Components expense-management app being prepared for a `bemgr` second-generation managed package.

Users log expenses under a two-level hierarchy:

```text
Expense Group -> Category -> Expense
```

The main app lets users filter, summarize, visualize, edit, duplicate, delete, export, and print expenses. Expenses store a required date and optional transaction time so same-day activity can be ordered without converting the date field to DateTime.
