# Getting Started

This guide describes an unpackaged source deployment to a dedicated Salesforce Developer Edition org or sandbox. These are setup instructions; this documentation update did not deploy the application to a new org or verify a fresh installation.

## Prerequisites

- Salesforce CLI and Node.js/npm compatible with the repository tooling.
- Administrative access to a development org supporting source API version `65.0`.
- A local checkout with dependencies installed using `npm ci`.

Use `budget-demo` as a local alias for your chosen org. For a sandbox, add `--instance-url https://test.salesforce.com` to the login command.

```bash
sf org login web --alias budget-demo
sf org display --target-org budget-demo
```

Confirm the target before proceeding. Deployment adds custom objects, Apex, components, permission sets, and credentials to that org.

## Validate and deploy source

```bash
sf project deploy start --source-dir force-app --target-org budget-demo --dry-run --test-level RunLocalTests --wait 30
```

Review the result. `RunLocalTests` also runs other local Apex tests already in the target org. A timeout is not a successful validation; inspect the returned job before proceeding.

After successful validation, deploy the same source:

```bash
sf project deploy start --source-dir force-app --target-org budget-demo --test-level RunLocalTests --wait 30
sf org assign permset --name Budget_Expense_Manager_Admin --target-org budget-demo
sf org open --target-org budget-demo
```

The permission command assigns the app's Admin permission set to the authenticated user. It includes settings/automation controller access and the public exchange-rate credential principal. The narrower User permission set supports everyday expense workflows but currently has the manual-run visibility limitation described in [review findings](review-findings.md).

Existing recurring Apex jobs can block later validation or deployment. See [scheduler deployment guidance](testing-and-tooling.md#scheduler-deployments); do not automatically cancel jobs or change org-wide settings.

## Create a small demo

Use synthetic records. No sample-data loader is shipped.

1. Open **Budget & Expense Manager** from the Salesforce App Launcher.
2. In **Expense Groups**, create `Demo Household`.
3. In **Categories**, create `Food` and `Bills`, each related to that group.
4. Return to the **Budget & Expense Manager** workspace and select `Demo Household`.
5. Add an expense named `Demo groceries`, choose Food, enter PHP 250, and use a date in the displayed month.
6. On Dashboard, set a PHP 5,000 budget for the same month. Confirm PHP 250 spent and PHP 4,750 remaining.
7. Open Expenses, filter by Food, and try CSV export or the print view.
8. Optionally add a monthly recurring bill in Recurring. In **Budget & Expense Manager Settings**, wait for settings to load, then save enabled automation with your chosen time. A newly created schedule uses the saving user's timezone. Check the schedule status and next run.

Manual generation is asynchronous. Queue acceptance does not mean generation has finished; inspect the last-run status and refresh the workspace after completion.

Bank assignment is optional. To demonstrate it, create an active Bank in the Banks tab and an active Expense Group Bank assignment connecting it to the group, using Salesforce's standard record UI. Reopen the workspace to refresh bank choices.

Foreign-currency estimates use the shipped public Frankfurter Named/External Credential with ECB reference rates; no API key is configured in source. A manual settled-rate fallback is available. All reporting remains PHP-focused.

## Source deployment versus packaging

Keep `bemgr` in `sfdx-project.json`. Direct deployment to an unnamespaced org uses unprefixed metadata; it does not install a managed package. Namespaced scratch-org and second-generation package work require a Dev Hub linked to that namespace and are a separate workflow. No managed-package installation link is currently provided.

For local checks, Apex verification evidence, currency details, and coverage gaps, see [Testing and tooling](testing-and-tooling.md).
