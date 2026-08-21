@IsTest
private class BudgetExpenseSettingsServiceTest {
    private static final String RECURRING_SCHEDULE_NAME = 'Budget Expense Manager Recurring Daily';

    @IsTest
    static void testGetSettingsCreatesDefaultRecord() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CronTrigger expectedSchedule = getRecurringSchedule();

            Test.startTest();
            BudgetExpenseSettingsState settings = SettingsController.getSettings();
            Test.stopTest();

            System.assertNotEquals(
                null,
                settings.settingsId,
                'Getting settings should create the default settings record.'
            );
            System.assertEquals(
                true,
                settings.recurringExpensesEnabled,
                'Recurring expenses should be enabled by default.'
            );
            System.assertEquals(
                '08:00',
                settings.globalRecurringRunTime,
                'The default recurring run time should be 08:00.'
            );
            System.assertEquals(
                expectedSchedule != null && expectedSchedule.NextFireTime != null,
                settings.recurringScheduleActive,
                'Schedule activity should reflect the currently visible recurring job.'
            );
            System.assertEquals(
                expectedSchedule == null ? 'Not scheduled' : expectedSchedule.State,
                settings.recurringScheduleState,
                'Schedule state should reflect the currently visible recurring job.'
            );
            System.assertEquals(
                expectedSchedule?.NextFireTime,
                settings.recurringScheduleNextRunDateTime,
                'Next run time should reflect the currently visible recurring job.'
            );
            System.assertEquals(
                expectedSchedule == null
                    ? UserInfo.getTimeZone().getID()
                    : expectedSchedule.TimeZoneSidKey,
                settings.recurringScheduleTimeZone,
                'Schedule timezone should reflect the job or current user timezone.'
            );
            System.assertEquals(
                1,
                [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c],
                'Only the default settings record should exist.'
            );
        }
    }

    @IsTest
    static void testSaveSettingsUpdatesExistingRecord() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SettingsController.getSettings();
            BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
            request.recurringExpensesEnabled = 'false';
            request.globalRecurringRunTime = '08:00';

            Test.startTest();
            BudgetExpenseSettingsState settings = SettingsController.saveSettings(request);
            Test.stopTest();

            System.assertEquals(
                false,
                settings.recurringExpensesEnabled,
                'Saving disabled settings should return a disabled state.'
            );
            System.assertEquals(
                false,
                BudgetExpenseSettingsService.areRecurringExpensesEnabled(),
                'The persisted setting should disable recurring expenses.'
            );
            System.assertEquals(
                1,
                [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c],
                'Saving settings should update the singleton record.'
            );
        }
    }

    @IsTest
    static void testSaveSettingsUpdatesGlobalRunTimeAndSchedule() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SettingsController.getSettings();
            BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
            request.recurringExpensesEnabled = 'true';
            request.globalRecurringRunTime = '10:30';

            BudgetExpenseSettingsState settings = SettingsController.saveSettings(request);

            System.assertEquals(
                '10:30',
                settings.globalRecurringRunTime,
                'Saving settings should return the requested run time.'
            );
            System.assertEquals(
                true,
                settings.recurringScheduleActive,
                'Changing the run time should create an active schedule.'
            );
            System.assertEquals(
                'WAITING',
                settings.recurringScheduleState,
                'The new recurring schedule should be waiting.'
            );
            System.assertNotEquals(
                null,
                settings.recurringScheduleNextRunDateTime,
                'The new recurring schedule should have a next run time.'
            );
            System.assertNotEquals(
                null,
                settings.recurringScheduleTimeZone,
                'The new recurring schedule should have a timezone.'
            );
            System.assertEquals(
                '0 30 10 * * ?',
                settings.recurringScheduleCronExpression,
                'The returned cron expression should represent 10:30 daily.'
            );

            Budget_Expense_Manager_Setting__c settingsRecord = [
                SELECT Global_Recurring_Run_Time__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];
            System.assertEquals(
                Time.newInstance(10, 30, 0, 0),
                settingsRecord.Global_Recurring_Run_Time__c,
                'The settings record should persist the requested run time.'
            );

            CronTrigger scheduledJob = [
                SELECT CronExpression, CronJobDetail.Name
                FROM CronTrigger
                WHERE CronJobDetail.Name = 'Budget Expense Manager Recurring Daily'
                LIMIT 1
            ];
            System.assertEquals(
                '0 30 10 * * ?',
                scheduledJob.CronExpression,
                'The scheduled job should use the requested daily run time.'
            );
        }
    }

    @IsTest
    static void testRunStatusUpdates() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            BudgetExpenseSettingsService.markRecurringRunQueued(UserInfo.getUserId());
            BudgetExpenseSettingsService.markRecurringRunCompleted(3, 2);
            Test.stopTest();

            Budget_Expense_Manager_Setting__c settings = [
                SELECT
                    Last_Recurring_Run_DateTime__c,
                    Last_Recurring_Run_Status__c,
                    Last_Recurring_Run_Message__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];

            System.assertNotEquals(
                null,
                settings.Last_Recurring_Run_DateTime__c,
                'Completing a run should record its completion time.'
            );
            System.assertEquals(
                'Completed',
                settings.Last_Recurring_Run_Status__c,
                'Completing a run should record a completed status.'
            );
            System.assert(
                settings.Last_Recurring_Run_Message__c.contains(
                    'Created 3 expenses from 2 recurring templates.'
                ),
                'Completing a run should record the generated expense and template counts.'
            );
        }
    }

    @IsTest
    static void testCompletedRunMessageWhenNothingIsDue() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            BudgetExpenseSettingsService.markRecurringRunCompleted(0, 0);
            Test.stopTest();

            Budget_Expense_Manager_Setting__c settings = [
                SELECT Last_Recurring_Run_Message__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];

            System.assertEquals(
                'No recurring expenses were due.',
                settings.Last_Recurring_Run_Message__c,
                'A run with no due templates should record an explanatory message.'
            );
        }
    }

    private static CronTrigger getRecurringSchedule() {
        List<CronTrigger> recurringSchedules = [
            SELECT CronExpression, NextFireTime, State, TimeZoneSidKey
            FROM CronTrigger
            WHERE CronJobDetail.Name = :RECURRING_SCHEDULE_NAME AND State != 'DELETED'
            ORDER BY NextFireTime ASC
            LIMIT 1
        ];

        return recurringSchedules.isEmpty() ? null : recurringSchedules[0];
    }
}
