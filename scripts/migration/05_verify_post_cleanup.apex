// Read-only verification after the legacy Spendly metadata cleanup.
// Assertions fail closed and this script performs no DML or scheduler mutation.

String legacyScheduleName = 'Spendly Recurring Expense Daily';
String destinationScheduleName = 'Budget Expense Manager Recurring Daily';
Set<String> terminalScheduleStates = new Set<String>{ 'COMPLETE', 'DELETED' };
Id currentUserId = UserInfo.getUserId();

System.assertEquals(
    1,
    [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c],
    'Expected one Budget & Expense Manager settings record.'
);

List<CronTrigger> activeLegacyJobs = [
    SELECT Id
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
    'The renamed schedule is not waiting.'
);
System.assertEquals(
    '0 0 8 * * ?',
    activeDestinationJobs[0].CronExpression,
    'The renamed schedule has an unexpected cron expression.'
);
System.assertEquals(
    'Asia/Manila',
    activeDestinationJobs[0].TimeZoneSidKey,
    'The renamed schedule has an unexpected timezone.'
);

System.assertEquals(
    1,
    [
        SELECT COUNT()
        FROM PermissionSetAssignment
        WHERE
            AssigneeId = :currentUserId
            AND PermissionSet.Name = 'Budget_Expense_Manager_All_Access'
    ],
    'The current user is missing the renamed all-access permission set.'
);

Integer expenseGroupCount = [SELECT COUNT() FROM Expense_Group__c];
Integer categoryCount = [SELECT COUNT() FROM Category__c];
Integer linkedCategoryCount = [SELECT COUNT() FROM Category__c WHERE Expense_Group__c != NULL];
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

System.assertEquals(3, expenseGroupCount, 'Expense-group count changed during cleanup.');
System.assertEquals(18, categoryCount, 'Category count changed during cleanup.');
System.assertEquals(categoryCount, linkedCategoryCount, 'A category lost its expense-group link.');
System.assertEquals(11, recurringExpenseCount, 'Recurring-expense count changed during cleanup.');
System.assertEquals(
    recurringExpenseCount,
    linkedRecurringExpenseCount,
    'A recurring expense lost its category link.'
);
System.assertEquals(504, expenseCount, 'Expense count changed during cleanup.');
System.assertEquals(expenseCount, linkedExpenseCount, 'An expense lost its category link.');
System.assertEquals(
    23,
    recurringLinkedExpenseCount,
    'The number of expenses linked to recurring templates changed during cleanup.'
);

System.debug(
    LoggingLevel.INFO,
    'Post-cleanup verification passed: expense groups=' +
        expenseGroupCount +
        ', categories=' +
        categoryCount +
        ', recurring expenses=' +
        recurringExpenseCount +
        ', expenses=' +
        expenseCount +
        ', recurring links=' +
        recurringLinkedExpenseCount +
        '.'
);
