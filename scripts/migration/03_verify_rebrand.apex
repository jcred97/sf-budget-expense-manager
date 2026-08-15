// Read-only verification for the same-org, unpackaged API rebrand.
// Assertions fail closed and this script performs no DML or scheduler mutation.

String legacyScheduleName = 'Spendly Recurring Expense Daily';
String destinationScheduleName = 'Budget Expense Manager Recurring Daily';
String expectedCronExpression = '0 0 8 * * ?';
Set<String> terminalScheduleStates = new Set<String>{ 'COMPLETE', 'DELETED' };

List<Spendly_Settings__c> legacySettingsRecords = [
    SELECT
        Name,
        Recurring_Expenses_Enabled__c,
        Global_Recurring_Run_Time__c,
        Last_Recurring_Run_DateTime__c,
        Last_Recurring_Run_Status__c,
        Last_Recurring_Run_Message__c
    FROM Spendly_Settings__c
];
List<Budget_Expense_Manager_Setting__c> destinationSettingsRecords = [
    SELECT
        Name,
        Recurring_Expenses_Enabled__c,
        Global_Recurring_Run_Time__c,
        Last_Recurring_Run_DateTime__c,
        Last_Recurring_Run_Status__c,
        Last_Recurring_Run_Message__c
    FROM Budget_Expense_Manager_Setting__c
];
System.assertEquals(1, legacySettingsRecords.size(), 'Expected one legacy settings record.');
System.assertEquals(1, destinationSettingsRecords.size(), 'Expected one renamed settings record.');

Spendly_Settings__c legacySettings = legacySettingsRecords[0];
Budget_Expense_Manager_Setting__c destinationSettings = destinationSettingsRecords[0];
System.assertEquals(legacySettings.Name, destinationSettings.Name, 'Settings Name mismatch.');
System.assertEquals(
    legacySettings.Recurring_Expenses_Enabled__c,
    destinationSettings.Recurring_Expenses_Enabled__c,
    'Recurring enablement mismatch.'
);
System.assertEquals(
    legacySettings.Global_Recurring_Run_Time__c,
    destinationSettings.Global_Recurring_Run_Time__c,
    'Recurring run-time mismatch.'
);
System.assertEquals(
    legacySettings.Last_Recurring_Run_DateTime__c,
    destinationSettings.Last_Recurring_Run_DateTime__c,
    'Last-run date/time mismatch.'
);
System.assertEquals(
    legacySettings.Last_Recurring_Run_Status__c,
    destinationSettings.Last_Recurring_Run_Status__c,
    'Last-run status mismatch.'
);
System.assertEquals(
    legacySettings.Last_Recurring_Run_Message__c,
    destinationSettings.Last_Recurring_Run_Message__c,
    'Last-run message mismatch.'
);

List<CronTrigger> activeLegacyJobs = [
    SELECT Id, State
    FROM CronTrigger
    WHERE CronJobDetail.Name = :legacyScheduleName AND State NOT IN :terminalScheduleStates
];
List<CronTrigger> activeDestinationJobs = [
    SELECT CronExpression, OwnerId, State, TimeZoneSidKey
    FROM CronTrigger
    WHERE CronJobDetail.Name = :destinationScheduleName AND State NOT IN :terminalScheduleStates
];
System.assertEquals(0, activeLegacyJobs.size(), 'An active legacy schedule still exists.');
System.assertEquals(1, activeDestinationJobs.size(), 'Expected one active renamed schedule.');
System.assertEquals(
    'WAITING',
    activeDestinationJobs[0].State,
    'The renamed schedule is not in WAITING state.'
);
System.assertEquals(
    expectedCronExpression,
    activeDestinationJobs[0].CronExpression,
    'The renamed schedule does not use the expected 08:00 cron expression.'
);
System.assertEquals(
    UserInfo.getUserId(),
    activeDestinationJobs[0].OwnerId,
    'The renamed schedule owner does not match the verified cutover user.'
);
System.assertEquals(
    UserInfo.getTimeZone().getID(),
    activeDestinationJobs[0].TimeZoneSidKey,
    'The renamed schedule timezone does not match the verified cutover user.'
);

Integer expenseGroupCount = [SELECT COUNT() FROM Expense_Group__c];
Integer categoryCount = [SELECT COUNT() FROM Category__c];
Integer linkedCategoryCount = [
    SELECT COUNT()
    FROM Category__c
    WHERE Expense_Group__c != NULL
];
Integer recurringExpenseCount = [SELECT COUNT() FROM Recurring_Expense__c];
Integer linkedRecurringExpenseCount = [
    SELECT COUNT()
    FROM Recurring_Expense__c
    WHERE Category__c != NULL
];
Integer expenseCount = [SELECT COUNT() FROM Expense__c];
Integer linkedExpenseCount = [SELECT COUNT() FROM Expense__c WHERE Category__c != NULL];
Integer recurringLinkedExpenseCount = [
    SELECT COUNT()
    FROM Expense__c
    WHERE Recurring_Expense__c != NULL
];
System.assertEquals(3, expenseGroupCount, 'Expense-group count changed during rebrand.');
System.assertEquals(18, categoryCount, 'Category count changed during rebrand.');
System.assertEquals(
    categoryCount,
    linkedCategoryCount,
    'A category lost its required expense-group relationship.'
);
System.assertEquals(11, recurringExpenseCount, 'Recurring-expense count changed during rebrand.');
System.assertEquals(
    recurringExpenseCount,
    linkedRecurringExpenseCount,
    'A recurring expense lost its required category relationship.'
);
System.assertEquals(504, expenseCount, 'Expense count changed during rebrand.');
System.assertEquals(
    expenseCount,
    linkedExpenseCount,
    'An expense lost its required category relationship.'
);
System.assertEquals(
    23,
    recurringLinkedExpenseCount,
    'The number of expenses linked to recurring templates changed during rebrand.'
);
System.debug(
    LoggingLevel.INFO,
    'Rebrand verification passed. Existing neutral-API record counts: ' +
        'expense groups=' +
        expenseGroupCount +
        ', categories=' +
        categoryCount +
        ', recurring expenses=' +
        recurringExpenseCount +
        ', expenses=' +
        expenseCount +
        '.'
);
