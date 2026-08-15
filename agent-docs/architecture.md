# Architecture

## Data Model

```text
Expense_Group__c
  -> Category__c (Expense_Group__c master-detail)
       - Display_Name__c
       - Total_Amount__c (roll-up, read-only)
       -> Expense__c (Category__c lookup)
            - Amount__c
            - Expense_Date__c
            - Transaction_Time__c (optional)
            - Bank__c (global value set: BPI, BDO, MariBank, Metrobank, GCash)
            - Transaction_Type__c (picklist)
            - Description__c
            - Recurring_Expense__c (lookup, optional)

Recurring_Expense__c
  -> Category__c (required lookup)
       - Amount__c
       - Bank__c
       - Transaction_Type__c
       - Description__c
       - Frequency__c (Daily, Weekly, Monthly, Yearly)
       - Start_Date__c
       - End_Date__c
       - Next_Run_Date__c
       - Active__c

Budget_Expense_Manager_Setting__c
  - Recurring_Expenses_Enabled__c
  - Global_Recurring_Run_Time__c
  - Last_Recurring_Run_DateTime__c
  - Last_Recurring_Run_Status__c
  - Last_Recurring_Run_Message__c

Legacy `Spending__c` metadata has been removed. `Expense_Group__c` is the active top-level object.
```

Recurring expenses are managed as templates. The generator Apex creates due
`Expense__c` records, links them back through `Expense__c.Recurring_Expense__c`,
sets `Expense__c.Transaction_Time__c` to the user-local time of generation, then
advances the template's `Next_Run_Date__c`.
Monthly and yearly recurrence calculations use `Start_Date__c` as the anchor.
If the target day does not exist in a later month, the generator uses that
month's last day without permanently shifting the anchor.
`Next_Run_Date__c` is the system pointer. `RecurringExpenseTrigger` defaults it
from `Start_Date__c` when a template is created and keeps it aligned with
`Start_Date__c` until the pointer has advanced.
`Budget_Expense_Manager_Setting__c` is a singleton app settings object. `BudgetExpenseSettingsTrigger`
prevents more than one settings record. The settings service creates the default
record when it is missing. Recurring automation currently uses these global
settings; `Expense_Group__c` has no group-specific settings fields.

## Apex Methods

- `getAllExpenseGroups()` - cacheable, returns all `Expense_Group__c` ordered by Name.
- `getCategoriesByExpenseGroup(expenseGroupId)` - cacheable, filters by expense group or returns all.
- `getExpensesByFilters(expenseGroupId, categoryId, startDate, endDate)` - dynamic SOQL; filters by `Category__r.Expense_Group__c`, selects category and expense group names; ordered by `Expense_Date__c DESC`, then `Transaction_Time__c DESC`.
- `deleteExpense(expenseId)` - non-cacheable, null-checks `expenseId`, deletes a single `Expense__c`, catches `DmlException`.
- `RecurringExpenseService.generateDueExpenses()` - creates due recurring expenses up to a bulk-safe cap, updates recurrence tracking dates, and returns a generation summary.
- `RecurringExpenseService.runDueExpensesBatch()` - starts the batch Apex recurring expense generator for manual UI runs and returns the batch job id.
- `RecurringExpenseCalculator` - owns recurrence due-date checks and next-run-date calculations for daily, weekly, monthly, and yearly frequencies.
- `RecurringExpenseBatch` - Batch Apex processor for due recurring expenses. Each batch chunk creates expenses and advances `Next_Run_Date__c`.
- `RecurringExpenseScheduler.execute(context)` - scheduled Apex wrapper that starts `RecurringExpenseBatch`.
- `BudgetExpenseSettingsService` - creates/updates the singleton settings record and tracks recurring run status.

## Custom Application

`Budget_Expense_Manager.app-meta.xml` supports Small and Large form factors. Its tabs are `Budget_Expense_Manager`, `Expense_Group__c`, `Expense__c`, `Recurring_Expense__c`, `Category__c`, and `Budget_Expense_Manager_Settings`; its utility bar is `Budget_Expense_Manager_UtilityBar`. The renamed `budgetExpenseManagerLogo` content asset is retained in source but is not currently referenced by the application metadata.

## Permission Sets

- `Budget_Expense_Manager_User` - Day-to-day app access. Grants CRUD on expense groups, categories, expenses, and recurring expense templates without `viewAllRecords` or `modifyAllRecords`. Grants `ExpenseController` Apex access and standard app tabs, but not the settings tab or settings object.
- `Budget_Expense_Manager_Admin` - Operational admin access. Grants full access to the app objects, settings fields and tab, and recurring-automation Apex controls.
- `Budget_Expense_Manager_All_Access` - Development/admin convenience set. Grants broad CRUD plus `viewAllRecords` and `modifyAllRecords` on the app objects. Read-only fields stay non-editable.

## Pages And Tabs

- `Budget_Expense_Manager` - LWC custom tab backed directly by `budgetExpenseManager`, which avoids the standard Lightning App Page title strip.
- `Budget_Expense_Manager_Settings` - LWC custom tab backed directly by `budgetExpenseSettings`.
- `Budget_Expense_Manager_UtilityBar` - UtilityBar, left-aligned desktop.
- `Expense_Record_Page` - RecordPage for `Expense__c`, overrides the View action.
