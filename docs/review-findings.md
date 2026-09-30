# Architecture Review Findings

Reviewed on **2026-09-30**, against application commit `6d0e13d`, with separate frontend, Apex, and metadata reviews. F1 and F2 are fixed in source; F2 passed Salesforce check-only validation. F3–F5 remain open. Deployment remains deferred.

The review inspected source and ran local lint/Jest checks; it did not reproduce issues in the live org, rerun Apex tests, or deploy metadata. P2 denotes a normal-priority functional issue, not a claim of an outage in the current org.

![Current source architecture](assets/architecture.svg)

## Confirmed Findings

### F1 — Settings can save defaults before existing configuration loads (P2)

**Fixed in source:** Save, editing, and manual run require a successful settings load. Failed loads show an inline error and Retry. Handler guards block duplicate saves and overlapping refresh/mutation requests. Five Jest regression tests cover pending, failed, retried, empty, and overlapping operations. The trigger and evidence below describe the original issue; this fix has not been deployed.

- **Trigger:** Initial settings loading is slow or fails, and the user clicks Save. Defaults are `true` and `08:00`, while Save is disabled only during saving. A load response can also race a save response.
- **Impact:** Existing disabled automation or a custom time can be overwritten; the UI may apply an older response after newer work.
- **Evidence:** [settings template](../force-app/main/default/lwc/budgetExpenseSettings/budgetExpenseSettings.html), Save `disabled={isSaving}`; [settings component](../force-app/main/default/lwc/budgetExpenseSettings/budgetExpenseSettings.js), initial fields, `loadSettings()` and `handleSave()`.
- **Proposed fix:** Require a successful load before editing/saving, retain a load-error state, and sequence overlapping reads/mutations.
- **Required regression checks:** Save during pending/failed initial load; older load response arriving after save; retry after load failure.

### F2 — Saving enabled automation does not create a missing schedule (P2)

**Fixed in source; check-only validation passed:** Enabled saves repair a missing or unusable schedule even when the time is unchanged. Same-time saves retain a usable job and its owner/timezone; new jobs use the saving user's timezone. Disabled-save behavior remains unchanged. Added tests cover first-time default saves, repeated saves, same-time re-enable, removed-job recovery, and inactive job states. Validation `0AfgK00000UzpUBSAZ` passed 19/19 settings, batch, and scheduler tests with 93.14% service coverage. This fix is not deployed. The evidence below describes the original issue.

- **Trigger:** Fresh settings default to enabled at `08:00`, or the existing job is removed. Saving the same clock time, including disabled-to-enabled, does not schedule a replacement.
- **Impact:** Automation can be enabled in the settings record without any daily job.
- **Evidence:** [settings service](../force-app/main/default/classes/service/BudgetExpenseSettingsService.cls), `getOrCreateSettings()` inserts defaults without a schedule, and `saveSettings()` calls rescheduling only when `originalRunTime != requestedRunTime`.
- **Proposed fix:** Reconcile missing/inactive schedule state when saving enabled automation, while preserving the intended timezone and avoiding duplicate jobs.
- **Required regression checks:** Fresh same-time save, same-time re-enable, missing-job recovery, existing valid schedule unchanged.

### F3 — Run Recurring is exposed to the regular User role without execution access (P2)

- **Trigger:** A user has the supplied User permission set and no additional automation Apex access, then clicks Run Recurring.
- **Impact:** The visible action fails authorization. Permission sets are additive; users with other grants may not encounter it.
- **Evidence:** [recurring template](../force-app/main/default/lwc/recurringExpenses/recurringExpenses.html) always renders the button; [component](../force-app/main/default/lwc/recurringExpenses/recurringExpenses.js) checks loading/running only; [User permission set](../force-app/main/default/permissionsets/Budget_Expense_Manager_User.permissionset-meta.xml) omits `RecurringExpenseAutomationController` and settings-object permissions.
- **Proposed fix:** Gate the UI with an explicit capability consistent with the admin automation boundary. Do not automatically broaden normal-user settings access.
- **Required regression checks:** Regular-user visibility, admin availability, and server authorization remaining enforced.

### F4 — Recurring results refresh on enqueue rather than completion (P2)

- **Trigger:** Batch execution starts after the immediate refresh requests have finished.
- **Impact:** Template pointers, due counts, expense rows and dashboard data can remain stale after generation finishes. This is not evidence that the batch failed.
- **Evidence:** [recurring screen](../force-app/main/default/lwc/recurringExpenses/recurringExpenses.js), `handleRunRecurringExpenses()`; [service](../force-app/main/default/classes/service/RecurringExpenseService.cls), `runDueExpensesBatch()` returns the queued job ID; [manager](../force-app/main/default/lwc/budgetExpenseManager/budgetExpenseManager.js), `handleRecurringGenerationStarted()`.
- **Proposed fix:** Retain the job ID and refresh after known completion, or expose explicit pending status and a manual refresh. Avoid claiming that queue acceptance means completion.
- **Required regression checks:** Delayed completion, failure, navigation/group changes while running, and no duplicate refresh loop.

### F5 — Recurring overview silently truncates after 500 templates (P2)

- **Trigger:** More than 500 templates match the overview query.
- **Impact:** Records beyond the cap are hidden; counts and monthly totals are derived only from the returned subset, without a truncation indicator.
- **Evidence:** [query service](../force-app/main/default/classes/service/ExpenseQueryService.cls), `queryRecurringExpenses()` has `LIMIT 500`; `getRecurringExpenseOverview()` and `updateRecurringOverview()` derive all summaries from that list.
- **Proposed fix:** Separate complete summary aggregation from paginated rows, or clearly disclose an intentionally bounded view.
- **Required regression checks:** More than 500 templates, complete active/due/monthly totals, and traversal without missing or repeated records.

## Separate Limits and Follow-up Questions

- **Dashboard scale:** Full matching expense rows are read for client-side summaries. There is no explicit row cap in `getExpensesByFilters()`; governor, heap and payload limits still apply. This is separate from the paginated expense list.
- **Report scale:** CSV/print deliberately fetch all matching pages and retain them in browser memory. Pagination does not make the final report memory-bounded or transactionally frozen.
- **Recurring catch-up status:** Generation preserves remaining pointers when its 9,000-expense batch-transaction cap is reached, but batch completion does not clearly advertise remaining backlog.
- **Singleton concurrency:** Settings singleton enforcement is check-before-insert without a unique singleton key. Concurrent first initialization is a robustness concern; it was not reproduced in an org during this review.
- **Currency scope:** Pinned base-currency context exists, but FX conversion and reporting remain PHP-focused. This is not complete generic Salesforce multicurrency support.
- **Sharing policy:** Groups and recurring templates are internally Public Read/Write. Confirm that shared budgeting, rather than private per-user records, is intended; the current policy alone is not a defect.
- **Frontend tests:** Direct settings, budget-panel/dialog, recurring-modal and FX-interaction coverage remains incomplete. Jest does not validate actual browser print layout.

## Verification and Deployment Boundary

- `npm run lint`: passed during the source review.
- Jest: **66 passing tests across 9 suites**.
- Apex: **18 test classes in source**; no fresh execution/coverage result from this review.
- Latest refactor commits are pushed through `6d0e13d`; their deployment and obsolete-org-metadata cleanup remain deferred.
- Historical rebrand/deployment job IDs and record counts are retained as history, not current live-org assertions.

See [architecture](architecture.md), [component ownership](components.md), and [testing history](testing-and-tooling.md).
