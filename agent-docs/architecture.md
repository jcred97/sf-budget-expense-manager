# Architecture

## Data Model

```text
Expense_Group__c
  -> Budget__c (optional monthly master-detail child)
       - Budget_Month__c (normalized to first day)
       - Amount__c
       - Description__c (optional)
       - Budget_Key__c (generated unique group/month key)
  -> Expense_Group_Bank__c (Bank assignment; master-detail child)
       - Bank__c (required restricted lookup to the global Bank record)
       - Active__c
       - Expense_Group_Bank_Key__c (generated unique group/bank key)
  -> Category__c (Expense_Group__c master-detail)
       - Display_Name__c
       - Total_Amount__c (roll-up, read-only)
       -> Expense__c (Category__c lookup)
            - Amount__c
            - Expense_Date__c
            - Transaction_Time__c (optional)
            - Bank_Assignment__c (optional restricted lookup during migration)
            - Bank__c (temporary legacy global-value-set fallback)
            - Transaction_Type__c (picklist)
            - Description__c
            - Recurring_Expense__c (lookup, optional)

Recurring_Expense__c
  -> Category__c (required lookup)
       - Amount__c
       - Bank_Assignment__c (optional restricted lookup during migration)
       - Bank__c (temporary legacy global-value-set fallback)
       - Transaction_Type__c
       - Description__c
       - Frequency__c (Daily, Weekly, Monthly, Yearly)
       - Start_Date__c
       - End_Date__c
       - Next_Run_Date__c
       - Active__c

Bank__c (global, Public Read Only catalog)
  - Name
  - Active__c
  - Bank_Key__c (generated normalized unique key)

Budget_Expense_Manager_Setting__c
  - Recurring_Expenses_Enabled__c
  - Global_Recurring_Run_Time__c
  - Last_Recurring_Run_DateTime__c
  - Last_Recurring_Run_Status__c
  - Last_Recurring_Run_Message__c

Legacy `Spending__c` metadata has been removed. `Expense_Group__c` is the active top-level object.
```

`Bank__c` stores each institution once. `Expense_Group_Bank__c` is a logical junction with a master-detail relationship to the Expense Group and a deletion-restricted lookup to the global Bank. Its generated composite key prevents duplicate group/Bank assignments. Expense and recurring records reference the assignment so the database retains the selected group context; deleting a referenced assignment or an assigned global Bank is restricted. Deactivation removes a choice from new selections without changing historical labels. During the additive migration, application reads prefer the assignment relationship and fall back to the unchanged legacy picklist.

`Budget__c` is opt-in by record presence. A group/month with no budget record keeps the original expense-only behavior. `BudgetTrigger` normalizes the month and regenerates the unique group/month key for every insert and update, so only one budget can exist for that context. Removing a budget does not remove or change expenses. The standard `Budget__c` tab provides list-view and record-level administration alongside the Dashboard budget panel.

Recurring expenses are managed as templates. The generator Apex creates due
`Expense__c` records, links them back through `Expense__c.Recurring_Expense__c`,
sets `Expense__c.Transaction_Time__c` to the user-local time of generation, then
advances the template's `Next_Run_Date__c`.
Monthly and yearly recurrence calculations use `Start_Date__c` as the anchor.
If the target day does not exist in a later month, the generator uses that
month's last day without permanently shifting the anchor.
`Next_Run_Date__c` is the system pointer. `RecurringExpenseTrigger` defaults it
from `Start_Date__c` when a template is created and keeps it aligned with
`Start_Date__c` until the pointer has advanced. Generation remains catch-up based:
each occurrence from the pointer through the run date is created, bounded by
`End_Date__c`. If the transaction cap is reached, the first ungenerated occurrence
is persisted so the next run resumes without replay. Templates whose pointer is
after their End Date remain visible but are neither due nor processed, and the
trigger rejects an End Date before the Start Date. Reactivation and frequency edits
preserve an already-advanced pointer; changing that policy is a separate product decision.
The synchronous selector first applies user-mode access and the batch retains its sharing
boundary. Generation then inserts the system-managed recurring link and advances a sparse
`Next_Run_Date__c` record in system mode because both fields are intentionally read-only in
the app permission sets; trigger validation still runs for both DML operations.
The workspace Add/Edit path is the non-exposed `recurringExpenseModal`. It uses
`lightning-record-edit-form` for mutation, UI API for current record context, and the
group-scoped Category and Bank selectors owned by `budgetExpenseManager`. The modal never
submits `Next_Run_Date__c`; it displays the value as read-only guidance. The manager retains
the cacheable Category and recurring-overview wire results so opening/retrying the dialog and
saving a template can use `refreshApex()`. Bank options use a non-cacheable imperative request
with group and request-token guards so every modal open receives fresh assignments without a
stale response replacing newer state. Imperative expense, Dashboard, trend, and Bank-option
reads are grouped behind the non-visual `expenseWorkspaceData` boundary; the manager still
owns request tokens and applies results only when their workspace context is current.
`Budget_Expense_Manager_Setting__c` is a singleton app settings object. `BudgetExpenseSettingsTrigger`
prevents more than one settings record. The settings service creates the default
record when it is missing. Recurring automation currently uses these global
settings; `Expense_Group__c` has no group-specific settings fields.

Lightning calls enter Apex only through classes under `classes/controller`. Their request and
response contracts are top-level, data-only classes under `classes/dto`; services own validation,
query composition, mapping, and mutations. Reusable workspace lookups are isolated under
`classes/selector` with sharing and user-mode SOQL. The UI keeps `"All"` as a combobox-only value
and translates it to `null`, while Apex group/category contracts use `Id`. Batch and scheduled
entry points live under `classes/async` without changing their Salesforce metadata names.

## Apex Methods

- `ExpenseController.getAllExpenseGroups()` - cacheable façade over `ExpenseGroupSelector`, returning the bounded workspace list ordered by Name.
- `BankController.getAvailableExpenseGroupBanks(expenseGroupId)` - non-cacheable, returns fresh active global Banks assigned to the requested accessible Expense Group; modal loads are request-guarded to ignore stale responses.
- `BankService` - owns user-mode group-scoped Bank assignment lookup and option mapping.
- `BudgetController.getMonthlyBudget(expenseGroupId, budgetMonth)` - cacheable, normalizes the month and returns the optional group budget or `null`.
- `BudgetController.saveMonthlyBudget(request)` - creates or updates the single budget for a group/month using user-mode DML.
- `BudgetController.deleteMonthlyBudget(budgetId)` - removes the accessible budget record without affecting expenses.
- `BudgetService` - owns user-mode budget queries, validation, mutations, lookup normalization, and Lightning-safe responses; `BudgetSaveRequest` is data-only.
- `ExpenseController.getCategoriesByExpenseGroup(expenseGroupId)` - cacheable façade over `CategorySelector`; a null ID returns the bounded compatibility list.
- `ExpenseController.getExpensesByFilters(filters)` - delegates dynamic user-mode querying to `ExpenseQueryService`; filter DTO group/category values are `Id` or null.
- `ExpenseController.deleteExpense(expenseId)` - delegates the null check and scoped user-mode deletion to `ExpenseCommandService`.
- `RecurringExpenseController.getRecurringExpenseOverview(expenseGroupId)` and `deactivateRecurringExpense(recurringExpenseId)` - normal-user recurring read/command entry points.
- `RecurringExpenseAutomationController.generateDueExpenses()` - creates due recurring expenses up to a bulk-safe cap, updates recurrence tracking dates, and returns a top-level generation DTO.
- `RecurringExpenseAutomationController.runDueExpensesBatch()` - Admin/All Access entry point that starts the Batch Apex generator and returns the batch job ID.
- `RecurringExpenseCalculator` - owns recurrence due-date checks and next-run-date calculations for daily, weekly, monthly, and yearly frequencies.
- `RecurringExpenseBatch` - Batch Apex processor for due recurring expenses. Each batch chunk creates expenses and advances `Next_Run_Date__c`.
- `RecurringExpenseScheduler.execute(context)` - scheduled Apex wrapper that starts `RecurringExpenseBatch`.
- `SettingsController.getSettings()` and `saveSettings(request)` - Admin/All Access Lightning entry points for global settings.
- `BudgetExpenseSettingsService` - creates/updates the singleton settings record and tracks recurring run status without exposing Lightning methods directly.

## Custom Application

`Budget_Expense_Manager.app-meta.xml` supports Small and Large form factors. Its tabs are `Budget_Expense_Manager`, `Expense_Group__c`, `Bank__c`, `Budget__c`, `Expense__c`, `Recurring_Expense__c`, `Category__c`, and `Budget_Expense_Manager_Settings`; its utility bar is `Budget_Expense_Manager_UtilityBar`. The renamed `budgetExpenseManagerLogo` content asset is retained in source but is not currently referenced by the application metadata.

## Permission Sets

- `Budget_Expense_Manager_User` - Day-to-day app access. Grants the Bank, Budget, Expense, and normal recurring-template controllers, read-only access to the global Bank catalog, and normal CRUD on group Bank assignments, budgets, expense groups, categories, expenses, and recurring expense templates without `viewAllRecords` or `modifyAllRecords`. The Banks tab is hidden from this permission set; assignments are managed from the Expense Group related list.
- `Budget_Expense_Manager_Admin` - Operational admin access. Grants the four normal controllers plus `SettingsController` and `RecurringExpenseAutomationController`, full access to global Banks and group assignments, and access to budgets and settings.
- `Budget_Expense_Manager_All_Access` - Development/admin convenience set. Uses the same controller-only Apex access boundary as Admin and grants broad CRUD plus `viewAllRecords` and `modifyAllRecords` on the app objects. Generated key fields stay hidden.

## Pages And Tabs

- `Budget_Expense_Manager` - LWC custom tab backed directly by `budgetExpenseManager`, which avoids the standard Lightning App Page title strip.
- `Budget_Expense_Manager_Settings` - LWC custom tab backed directly by `budgetExpenseSettings`.
- `Bank__c` - standard Banks tab for Admin/All Access catalog maintenance; group assignments remain contextual on Expense Group records and have no standalone tab.
- `Budget__c` - standard Budgets tab for list-view and record-level administration.
- `Budget_Expense_Manager_UtilityBar` - UtilityBar, left-aligned desktop.
- `Expense_Record_Page` - RecordPage for `Expense__c`, overrides the View action.
