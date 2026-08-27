# Key Patterns

## Workspace Shell

`budgetExpenseManager` owns the shared context and mutable state for an internal workspace
shell driven by the view keys and configuration in `expenseWorkspaceConfig`. Imperative
expense, Dashboard, trend, and Bank-option reads enter through `expenseWorkspaceData`, while
cacheable Category and recurring-overview wires remain in the component because `refreshApex`
depends on their wire results. Derived view models pass through
`expenseWorkspaceViewModels`, which memoizes them per manager instance by input references and
scalar values so repeated template access within one render cycle reuses the same model.
Desktop uses a collapsible left sidebar so Budget & Expense Manager can have app-like
navigation inside Salesforce, while smaller screens fall back to a horizontal
view strip. The first available `Expense_Group__c` is selected automatically,
and the sidebar dropdown is the workspace group switcher. Dashboard,
Expenses, and Recurring only load data after that group context is
selected. Dashboard is the default view and shows a current-period hero, header
month navigation, summary cards, category/bank charts, six-month trend, latest
expenses, and insight cards. Expenses uses a
two-column workspace: a left filter rail for search, date, and category
controls; and a right expense panel with date-grouped expense rows,
period summary, total amount, export, print, bulk delete, and row actions.
Expense row actions should use a Salesforce-style action menu instead of
multiple exposed icon buttons when there is more than one row action.
Recurring uses a custom grouped workspace view for template summaries, due
status, schedule details, manual run, edit, and deactivate actions. Settings is
reserved for app-level controls.

Custom views should stay close to Salesforce Lightning styling: neutral card
borders, light typography, compact headings, and restrained custom shadows.
Dashboard rows should share the same workspace edges; avoid adding horizontal
padding inside child dashboard row components unless the adjacent rows use the
same inset.
Dashboard labels and values should handle long category/bank names and large
currency values with truncation or compact display. Do not rely on hover for
important dashboard values; show exact amounts in summary cards, lists, or
insight details where precision matters.

## Reactive Filters

`budgetExpenseManager.js` binds filters to the UI state. Changing the workspace
`expenseGroupId` reloads the scoped expense data and resets `categoryId` to
`All`. Changing `categoryId`, `startDate`, or `endDate` reloads the data inside
the selected expense group. Dashboard and Expenses both show previous/next
month controls in their view headers. These controls set `startDate` and
`endDate` to the selected calendar month, then reload through the same filter
path so both views stay on the same selected month.

## Date Validation

`validateDates()` prevents invalid expense-filter ranges by showing an inline error when
`startDate` is later than `endDate`. The recurring editor mirrors the same ordering check
for template Start and End dates before its LDS submission; the recurring trigger remains
the database-level authority for records saved through other entry points.

## Default Date Range

The app defaults to the current month on load.

## Incremental Loading

The expense list loads 20 rows initially and adds 10 rows when users click
Load More. All filtered rows stay in memory, while `rowsToDisplay` controls the
visible slice.

## Totals And Summaries

`totalAmount` sums all filtered rows, not only visible rows. `formattedTotal`
uses PHP currency formatting via `Intl.NumberFormat`.

Summary cards show total amount, expense count, average expense, top
category, and top bank. Dashboard chart and summary fallbacks should match the
expense row display labels, such as `No bank` for blank bank values.

## Optional Monthly Budgets

`Budget__c` stores at most one budget per `Expense_Group__c` and calendar month. Budgeting is data-driven rather than controlled by a global toggle: when no record exists, the Dashboard shows a quiet Set Budget invitation and all expense behavior remains unchanged. Saving creates or updates the normalized month record; ID-less saves lock the parent expense group so concurrent first-time requests converge on the same record. Removing it opts that group/month back out without changing expenses.

`budgetPanel` owns the budget wire, mutation state, retry handling, confirmation, and toasts. It receives the selected expense group, the Dashboard month, and that month's total spending from `expenseDashboard`. It displays budget, spent, remaining or over-budget amount, percentage used, and a capped visual progress value while retaining the exact uncapped percentage label. `budgetModal` owns positive PHP amount validation, the optional description, initial focus, Escape handling, and local Tab focus trapping.

The Dashboard also requests a bounded six-month budget history alongside its existing monthly expense trend. `expenseDashboardViewModel` joins both sources by calendar month, and `budgetHistory` renders Budget, Spent, Variance, and Usage without treating an absent budget as zero. Successful budget mutations emit an explicit change event so the comparison refreshes immediately.

## Record-Based Banks

`Bank__c` is the global catalog; `Expense_Group_Bank__c` assigns reusable Banks to Expense Groups. New selectors query only active assignments whose global Bank is also active. Expense and recurring records store `Bank_Assignment__c`, while row transformation keeps one canonical `bank` display value so search, charts, summaries, print, and CSV do not need separate migration logic.

The compatibility read order is assignment Bank name first, then the temporary legacy `Bank__c` picklist. Editing preserves an existing inactive assignment so historical data remains editable; Add and Duplicate do not offer inactive choices. Server validation, rather than the optional lookup filter, enforces that the assignment belongs to the Category's Expense Group and that newly chosen assignments are active. Assignment Bank identity is immutable after creation because changing it would relabel every historical record that references that junction row.

Standard layouts show the new Bank lookup plus the legacy value read-only during migration. The assignment Name is an auto-number, so the Expense and Recurring workspace dialogs present `Bank__r.Name` through group-scoped comboboxes. The standard Recurring record page remains available through the record-name link and object tab, so the legacy field cannot be destructively removed until that compatibility boundary is separately approved and verified.

## Charts

The app renders category, bank, and monthly trend visualizations from the
filtered expense set and monthly Apex trend data. The expense list uses the
selected date range, while the trend request expands the start date to the
first day of the fifth previous month so the dashboard can show a six-month
window for the currently selected month. The trend chart shows per-month PHP
totals, uses a small minimum height for non-zero months, and highlights the
currently selected month.

## Empty State

When no expenses match the filters, the app shows a friendly empty state
instead of an empty datatable.
Dashboard loading uses a clear spinner state before cards/charts render, and
dashboard empty states should use Salesforce-style boxes/media patterns rather
than custom decorative treatments.

## Modal

- Opened via `isOpen`; closed by firing a `close` custom event.
- Supports Add, Edit, and Duplicate flows.
- Uses standard SLDS modal structure with Lightning form controls and an SLDS
  footer; keep custom modal CSS minimal.
- Uses `recordId` for edit mode and `duplicateData` for duplicate mode.
- Uses `isClosing` to trigger the CSS fade-out animation.
- Dispatches `close` only after `animationend`.
- Implements Escape-to-close, Tab focus trapping, body scroll lock, and focus restoration.
- On Save & New, clears fields and stays open.
- On regular Save, closes after success.
- Uses `lightning-record-edit-form`.
- Expense and recurring-expense dialogs keep their LDS fields mounted but hidden until the
  record form, Category options, Bank options, and any edit-only record context have all settled.
  A single modal-level spinner is shown during that readiness window so controls never appear in
  stages.
- Category and Bank loading failures count as settled states, so the modal reveals their retry
  controls instead of leaving an indefinite spinner. An LDS form-load failure keeps the fields
  and footer hidden and presents close/reopen recovery guidance. While loading or blocked, only
  visible recovery controls participate in the modal focus cycle.
- Category selection is a required `lightning-combobox` populated from the
  current workspace `Expense_Group__c`; the selected category is injected into
  the record form on submit.

## Date Input Styling

`RemoveDateFormatStyle.css` hides the browser date format hint. Components add
the `date-format-hide` class to date inputs.

## Transaction Time Input

`Expense__c.Transaction_Time__c` stays as a Salesforce Time field, but the
expense modal uses `lightning-input type="time"` and injects the normalized
time value into `lightning-record-edit-form` on submit. This allows exact
minute entry while preserving Lightning Data Service save behavior.

## Expense List

The Expenses view uses custom date-grouped rows instead of
`lightning-datatable`. Each row shows the expense name, category, bank,
transaction type, time, date, and PHP amount. Checkboxes populate
`selectedExpenseIds` for bulk delete, while row action menus call the shared
edit/duplicate/delete behavior. Prefer Lightning button/icon controls and
quiet SLDS-like row typography over custom button chrome.

## Row Actions

Rows support Edit, Duplicate, and Delete. Delete uses `LightningConfirm.open()`
and calls Apex delete methods.

## Bulk Delete

Selected rows can be deleted in bulk through `deleteExpenses`. Keep this
bulkified and avoid one-DML-per-row implementations.

## Export And Print

The app can export filtered rows to CSV through `expenseCsvExport` and render a
print-only expense report through `expensePrintReport`. Dashboard and Expenses share
`expenseMonthNavigator`; shared date-range labels come from `expenseFormatters`.

Modal components share body scroll locking, focus restoration, focusable-element discovery,
and Tab trapping through `modalFocusUtils`, while each modal retains its own close, save, and
initial-focus policy. Components normalize Apex, LDS/UI API, record-form, network, and JavaScript
error shapes through `expenseErrorUtils`, while retaining contextual fallback messages and display
behavior at each call site.

## Recurring Expense Templates

Recurring expense templates are represented by `Recurring_Expense__c`.
`Expense__c.Recurring_Expense__c` links an expense back to the template that
generated it. The custom Recurring workspace view loads templates through
`RecurringExpenseController.getRecurringExpenseOverview()`, scoped by the current
`Expense_Group__c`, and displays active count, due-today count, and a normalized
monthly estimate. Deactivation uses the same normal-user controller. Manual generation
calls `RecurringExpenseAutomationController.runDueExpensesBatch()`, whose Apex class
access remains limited to Admin and All Access. Generation automation uses Batch Apex so
more than 100 due templates can be processed without hitting per-transaction governor
limits.

Generation catches up from `Next_Run_Date__c` through the run date and stops at
`End_Date__c`. Reaching the transaction cap persists the first ungenerated date so a
later run resumes without replay. A template whose pointer is already after its End
Date remains visible but is not due or processed, and the recurring trigger rejects
an End Date before the Start Date. Reactivation and frequency edits continue to
preserve an already-advanced pointer.

The Recurring header opens `recurringExpenseModal` for Add, and row-menu Edit opens the
same dialog instead of a new browser tab. The dialog uses `lightning-record-edit-form`
for CRUD/FLS-aware saves and UI API `getRecord` for the current Category, Bank assignment,
legacy Bank, active state, and read-only Next Run Date. Category and Bank choices are
refreshed from the current Expense Group whenever the dialog opens. An untouched legacy
or inactive Bank remains available for historical edits; an explicit Bank/No bank change
updates the assignment and clears the legacy field. The standard record-name link remains
an intentional View path outside this workspace-only editor.

## Budget & Expense Manager Settings

`Budget_Expense_Manager_Setting__c` stores singleton app-level controls. `BudgetExpenseSettingsTrigger`
prevents multiple settings records, while `BudgetExpenseSettingsService` creates the
default record when missing. The `budgetExpenseSettings` LWC enters Apex through
`SettingsController` and `RecurringExpenseAutomationController`; service classes are not
Lightning entry points. The page lets authorized users enable or disable recurring expense
generation, manually queue a recurring run, and view the most recent run status.
