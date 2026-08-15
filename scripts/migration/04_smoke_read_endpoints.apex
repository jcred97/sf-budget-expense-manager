// Read-only application smoke test for the rebranded LWC-facing Apex APIs.
// Assertions verify that the current user can read the complete existing dataset.

List<Expense_Group__c> expenseGroups = ExpenseController.getAllExpenseGroups();
List<Category__c> categories = ExpenseController.getCategoriesByExpenseGroup('All');
List<Expense__c> expenses = ExpenseController.getExpensesByFilters(null);
ExpenseController.RecurringExpenseOverview recurringOverview = ExpenseController.getRecurringExpenseOverview(
    'All'
);
List<ExpenseController.MonthlyTotal> monthlyTrend = ExpenseController.getMonthlyTrend(null);
BudgetExpenseSettingsService.SettingsState settingsState = BudgetExpenseSettingsService.getSettings();

System.assertEquals(3, expenseGroups.size(), 'The app did not return all expense groups.');
System.assertEquals(18, categories.size(), 'The app did not return all categories.');
System.assertEquals(504, expenses.size(), 'The app did not return all expenses.');
System.assertEquals(
    11,
    recurringOverview.rows.size(),
    'The app did not return all recurring-expense templates.'
);
System.assertNotEquals(null, monthlyTrend, 'The monthly-trend endpoint returned null.');
System.assertNotEquals(
    null,
    settingsState.settingsId,
    'The settings endpoint returned no record ID.'
);
System.assertEquals(
    true,
    settingsState.recurringExpensesEnabled,
    'The settings endpoint changed recurring-expense enablement.'
);
System.assertEquals(
    '08:00',
    settingsState.globalRecurringRunTime,
    'The settings run time changed.'
);
System.assertEquals(
    true,
    settingsState.recurringScheduleActive,
    'The settings endpoint did not find the renamed schedule.'
);
System.assertEquals(
    'WAITING',
    settingsState.recurringScheduleState,
    'The renamed schedule is not waiting.'
);
System.assertEquals(
    '0 0 8 * * ?',
    settingsState.recurringScheduleCronExpression,
    'The settings endpoint returned an unexpected cron expression.'
);
System.assertEquals(
    'Asia/Manila',
    settingsState.recurringScheduleTimeZone,
    'The settings endpoint returned an unexpected timezone.'
);

System.debug(
    LoggingLevel.INFO,
    'LWC-facing endpoint smoke test passed: groups=' +
        expenseGroups.size() +
        ', categories=' +
        categories.size() +
        ', recurring templates=' +
        recurringOverview.rows.size() +
        ', expenses=' +
        expenses.size() +
        ', trend buckets=' +
        monthlyTrend.size() +
        '.'
);
