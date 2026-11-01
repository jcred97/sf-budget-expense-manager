# Budget & Expense Manager

Track spending, compare monthly budgets, and automate recurring expenses inside Salesforce.

Expense records should help answer practical questions: Where did the money go? How much of this month's budget remains? Which regular payments are due? Budget & Expense Manager brings those workflows into one Lightning workspace.

Built for Salesforce users who want to organize spending by expense group and category, with PHP as the reporting currency.

**Lightning Web Components · Apex · Batch Apex · SLDS · Jest**

[Try it in a development org](docs/getting-started.md) · [Architecture](docs/architecture.md) · [Verification](docs/testing-and-tooling.md) · [Known limitations](docs/review-findings.md)

## What you can do

- **Understand monthly spending.** Review category and bank breakdowns, trends, and recent purchases. Add an optional monthly budget without changing how expenses are recorded.
- **Manage daily expenses.** Add, edit, duplicate, filter, and delete entries; export filtered records to CSV or a print/PDF view.
- **Keep foreign purchases explainable.** Store the original amount and historical exchange-rate details alongside the PHP amount used in reports.
- **Reduce repeated entry.** Create recurring templates and generate due expenses through scheduled or manually queued Batch Apex.

## A quick walkthrough

In a development org with synthetic data:

1. Create a **Demo Household** expense group with **Food** and **Bills** categories.
2. Add an expense for PHP 250 and set a PHP 5,000 monthly budget. The Dashboard shows spending against the target.
3. Filter the Expenses screen to Food, inspect the entry, and export the matching records.
4. Add a monthly recurring bill and inspect its next-run date. An admin can configure the daily run in Settings.

The [setup guide](docs/getting-started.md) takes you from a checkout to this workflow. Screenshots and a recorded walkthrough are not included yet.

## Engineering decisions

### Preserve the financial record

Foreign-currency expenses retain the original amount, currency, rate, effective date, and source. Reports use a canonical PHP amount instead of recalculating old purchases at today's rate. Apex trigger validation checks the snapshot for UI, import, and API writes; a manual settled-rate option supports cases where a reference estimate is unsuitable.

See [currency validation](force-app/main/default/classes/service/ExpenseCurrencyService.cls) and its [regression tests](force-app/main/default/classes/test/ExpenseCurrencyServiceTest.cls).

### Treat recurring dates as business rules

Monthly and yearly recurrence preserve the original date anchor across short months and leap years. The generator tracks the next unprocessed date so later runs can continue catching up. Settings saves repair a missing schedule when automation is enabled, while unchanged valid schedules keep their owner and timezone.

See [recurrence calculation](force-app/main/default/classes/service/RecurringExpenseCalculator.cls), [date tests](force-app/main/default/classes/test/RecurringExpenseCalculatorTest.cls), and [schedule recovery tests](force-app/main/default/classes/test/BudgetExpenseSettingsServiceTest.cls).

### Give each screen clear ownership

Dashboard, Expenses, and Recurring own their loading state, data, and actions. The app shell coordinates navigation, shared lookups, and refreshes. Recent refactoring moved workflows back to their screens and removed unnecessary indirection. The lesson: extract abstractions when substantial logic or actual reuse warrants them.

The central data hierarchy is Expense Group → Category → Expense, with optional monthly budgets per group. Generated expenses reference their recurring template through an optional lookup.

[View the architecture diagram](docs/assets/architecture.svg) · [Component responsibilities](docs/components.md)

## Run and test

You need Salesforce CLI, Node.js/npm, and a Salesforce development org with administrative access. A namespace-linked Dev Hub is needed for the future namespaced packaging workflow, not for the unpackaged demo route.

```bash
git clone https://github.com/jcred97/sf-budget-expense-manager.git
cd sf-budget-expense-manager
npm ci
npm run lint
npm run test:unit -- -- --runInBand
```

The frontend runs in Salesforce; there is no standalone npm start server. Follow [Getting started](docs/getting-started.md) for validation, source deployment, permissions, and first records.

Recorded verification on 2026-09-30:

- Frontend baseline: 66 tests across 9 suites and lint passed; a later settings suite added 5 passing regression tests.
- Schedule-recovery check-only validation: 19/19 Apex tests passed across settings, batch, and scheduler suites; the changed settings service had 93.14% coverage.

These are scoped results, not a claim that every component or live-org workflow was tested. See [verification details and remaining coverage gaps](docs/testing-and-tooling.md).

## Scope and next improvements

Reporting and recurring templates remain PHP-focused. Expense groups and recurring templates use shared internal access rather than private per-user budgeting.

The next improvements are clearer batch-completion feedback, permission-aware visibility for Run Recurring, and complete recurring summaries beyond 500 templates. Dashboard and full-report memory usage also need consideration for larger datasets. [Tracked findings](docs/review-findings.md) explain the triggers and proposed fixes.

The latest settings fixes and screen refactors are in source; deployment to the existing development org and obsolete-metadata cleanup remain deferred. A fresh source deployment and the existing org may therefore differ. Managed-package creation under the configured bemgr namespace is pending.

For deeper detail, start with the [documentation index](docs/README.md). Implementation inventories, conventions, and migration history live there.
