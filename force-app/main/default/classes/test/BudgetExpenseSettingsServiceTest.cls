@IsTest
private class BudgetExpenseSettingsServiceTest {
    private static String RECURRING_SCHEDULE_NAME = 'Budget Expense Manager Recurring Daily';
    private static final String INITIAL_BASE_CURRENCY = 'CAD';
    private static final String BACKFILLED_BASE_CURRENCY = 'EUR';
    private static final String PINNED_BASE_CURRENCY = 'JPY';

    @TestSetup
    static void restrictedUsers() {
        Profile minimumAccess = [SELECT Id FROM Profile WHERE Name = 'Minimum Access - Salesforce' LIMIT 1];
        List<User> users = new List<User>();
        for (String role : new List<String>{ 'SettingsRestrictedAdmin', 'SettingsRestrictedUser', 'SettingsPartialEditor' }) {
            users.add(
                new User(
                    Alias = 'setperm',
                    Email = role + '@example.invalid',
                    EmailEncodingKey = 'UTF-8',
                    LastName = role,
                    LanguageLocaleKey = 'en_US',
                    LocaleSidKey = 'en_US',
                    TimeZoneSidKey = 'Asia/Manila',
                    ProfileId = minimumAccess.Id,
                    Username = role + '.' + UserInfo.getOrganizationId() + '.' + System.now().getTime() + '@example.invalid'
                )
            );
        }
        insert users;
        Map<String, Id> permissions = new Map<String, Id>();
        for (PermissionSet permission : [
            SELECT Id, Name
            FROM PermissionSet
            WHERE
                Name IN ('Budget_Expense_Manager_Admin', 'Budget_Expense_Manager_User')
                AND (NamespacePrefix = 'bemgr'
                OR NamespacePrefix = NULL)
            ORDER BY NamespacePrefix ASC NULLS FIRST
        ]) {
            permissions.put(permission.Name, permission.Id);
        }
        List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
        for (Integer index = 0; index < users.size(); index++) {
            assignments.add(
                new PermissionSetAssignment(
                    AssigneeId = users[index].Id,
                    PermissionSetId = permissions.get(index == 0 ? 'Budget_Expense_Manager_Admin' : 'Budget_Expense_Manager_User')
                )
            );
        }
        PermissionSet partial = new PermissionSet(Name = 'SettingsPartialEditorRegression', Label = 'Settings partial editor regression');
        insert partial;
        String objectName = Budget_Expense_Manager_Setting__c.SObjectType.getDescribe().getName();
        insert new ObjectPermissions(ParentId = partial.Id, SObjectType = objectName, PermissionsRead = true, PermissionsEdit = true);
        List<FieldPermissions> fields = new List<FieldPermissions>();
        for (
            Schema.SObjectField field : new List<Schema.SObjectField>{
                Budget_Expense_Manager_Setting__c.Base_Currency_Code__c,
                Budget_Expense_Manager_Setting__c.Recurring_Expenses_Enabled__c,
                Budget_Expense_Manager_Setting__c.Global_Recurring_Run_Time__c,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_DateTime__c,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Status__c,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Message__c
            }
        ) {
            fields.add(
                new FieldPermissions(
                    ParentId = partial.Id,
                    SObjectType = objectName,
                    Field = objectName + '.' + field.getDescribe().getName(),
                    PermissionsRead = true,
                    PermissionsEdit = field == Budget_Expense_Manager_Setting__c.Recurring_Expenses_Enabled__c
                )
            );
        }
        insert fields;
        assignments.add(new PermissionSetAssignment(AssigneeId = users[2].Id, PermissionSetId = partial.Id));
        insert assignments;
    }

    private static User restrictedActor(String role) {
        return [SELECT Id FROM User WHERE LastName = :role LIMIT 1];
    }

    private class StubOrganizationCurrencyProvider implements OrganizationCurrencyProvider {
        private String currencyCode;
        /** Tracks provider calls so tests can verify one-time initialization. */
        public Integer invocationCount { get; private set; }

        StubOrganizationCurrencyProvider(String currencyCode) {
            this.currencyCode = currencyCode;
            this.invocationCount = 0;
        }

        /**
         * Returns the configured organization currency code.
         *
         * @return Configured organization currency code.
         */
        public String getCurrencyCode() {
            invocationCount++;
            return currencyCode;
        }
    }

    @IsTest
    static void testGetSettingsCreatesDefaultRecord() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CronTrigger expectedSchedule = getRecurringSchedule();
            CurrencyContextService.currencyProvider = new StubOrganizationCurrencyProvider(INITIAL_BASE_CURRENCY);

            Test.startTest();
            BudgetExpenseSettingsState settings = BudgetExpenseSettingsService.getSettings();
            Test.stopTest();

            System.assertNotEquals(null, settings.settingsId, 'Getting settings should create the default settings record.');
            System.assertEquals(
                false,
                settings.recurringExpensesEnabled,
                'Recurring expenses should be disabled until explicitly enabled.'
            );
            System.assertEquals('08:00', settings.globalRecurringRunTime, 'The default recurring run time should be 08:00.');
            System.assertEquals(
                INITIAL_BASE_CURRENCY,
                settings.baseCurrencyCode,
                'Creating settings should initialize the app base currency.'
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
                expectedSchedule == null ? UserInfo.getTimeZone().getID() : expectedSchedule.TimeZoneSidKey,
                settings.recurringScheduleTimeZone,
                'Schedule timezone should reflect the job or current user timezone.'
            );
            System.assertEquals(
                1,
                [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c],
                'Only the default settings record should exist.'
            );
            System.assertEquals(
                INITIAL_BASE_CURRENCY,
                [
                    SELECT Base_Currency_Code__c
                    FROM Budget_Expense_Manager_Setting__c
                    LIMIT 1
                ]
                .Base_Currency_Code__c,
                'The initialized base currency should be persisted on the singleton record.'
            );
        }
    }

    @IsTest
    static void testGetSettingsBackfillsMissingBaseCurrency() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new Budget_Expense_Manager_Setting__c(
                Name = 'Existing',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(8, 0, 0, 0)
            );
            StubOrganizationCurrencyProvider provider = new StubOrganizationCurrencyProvider(BACKFILLED_BASE_CURRENCY);
            CurrencyContextService.currencyProvider = provider;

            Test.startTest();
            BudgetExpenseSettingsState settings = BudgetExpenseSettingsService.getSettings();
            Test.stopTest();

            Budget_Expense_Manager_Setting__c persistedSettings = [
                SELECT Base_Currency_Code__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];
            System.assertEquals(
                BACKFILLED_BASE_CURRENCY,
                settings.baseCurrencyCode,
                'Existing settings should expose the initialized base currency.'
            );
            System.assertEquals(
                BACKFILLED_BASE_CURRENCY,
                persistedSettings.Base_Currency_Code__c,
                'A missing base currency should be backfilled on the existing singleton.'
            );
            System.assertEquals(1, provider.invocationCount, 'Backfilling should resolve the organization currency once.');
        }
    }

    @IsTest
    static void testSaveSettingsKeepsPinnedBaseCurrencyStable() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new Budget_Expense_Manager_Setting__c(
                Name = 'Existing',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(8, 0, 0, 0),
                Base_Currency_Code__c = PINNED_BASE_CURRENCY
            );
            StubOrganizationCurrencyProvider changedOrganizationProvider = new StubOrganizationCurrencyProvider('USD');
            CurrencyContextService.currencyProvider = changedOrganizationProvider;
            BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
            request.recurringExpensesEnabled = 'true';
            request.globalRecurringRunTime = '08:00';

            Test.startTest();
            BudgetExpenseSettingsState settings = BudgetExpenseSettingsService.saveSettings(request);
            Test.stopTest();

            System.assertEquals(
                PINNED_BASE_CURRENCY,
                settings.baseCurrencyCode,
                'The persisted app base currency should remain authoritative.'
            );
            System.assertEquals(
                PINNED_BASE_CURRENCY,
                [
                    SELECT Base_Currency_Code__c
                    FROM Budget_Expense_Manager_Setting__c
                    LIMIT 1
                ]
                .Base_Currency_Code__c,
                'Reading settings should not replace a previously initialized currency.'
            );
            System.assertEquals(
                0,
                changedOrganizationProvider.invocationCount,
                'A pinned base currency should not be re-resolved from the organization.'
            );
        }
    }

    @IsTest
    static void testSaveSettingsUpdatesExistingRecord() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetExpenseSettingsService.getSettings();
            BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
            request.recurringExpensesEnabled = 'false';
            request.globalRecurringRunTime = '08:00';

            Test.startTest();
            BudgetExpenseSettingsState settings = BudgetExpenseSettingsService.saveSettings(request);
            Test.stopTest();

            System.assertEquals(false, settings.recurringExpensesEnabled, 'Saving disabled settings should return a disabled state.');
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
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetExpenseSettingsService.getSettings();
            BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
            request.recurringExpensesEnabled = 'true';
            request.globalRecurringRunTime = '10:30';

            BudgetExpenseSettingsState settings = BudgetExpenseSettingsService.saveSettings(request);

            System.assertEquals('10:30', settings.globalRecurringRunTime, 'Saving settings should return the requested run time.');
            System.assertEquals(true, settings.recurringScheduleActive, 'Changing the run time should create an active schedule.');
            System.assertEquals('WAITING', settings.recurringScheduleState, 'The new recurring schedule should be waiting.');
            System.assertNotEquals(
                null,
                settings.recurringScheduleNextRunDateTime,
                'The new recurring schedule should have a next run time.'
            );
            System.assertNotEquals(null, settings.recurringScheduleTimeZone, 'The new recurring schedule should have a timezone.');
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
                WHERE CronJobDetail.Name = :RECURRING_SCHEDULE_NAME
                LIMIT 1
            ];
            System.assertEquals('0 30 10 * * ?', scheduledJob.CronExpression, 'The scheduled job should use the requested daily run time.');
        }
    }

    @IsTest
    static void testRunStatusUpdates() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            BudgetExpenseSettingsService.markRecurringRunQueued();
            BudgetExpenseSettingsService.markRecurringRunCompleted(3, 2);
            Test.stopTest();

            Budget_Expense_Manager_Setting__c settings = [
                SELECT Last_Recurring_Run_DateTime__c, Last_Recurring_Run_Status__c, Last_Recurring_Run_Message__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];

            System.assertNotEquals(null, settings.Last_Recurring_Run_DateTime__c, 'Completing a run should record its completion time.');
            System.assertEquals('Completed', settings.Last_Recurring_Run_Status__c, 'Completing a run should record a completed status.');
            System.assert(
                settings.Last_Recurring_Run_Message__c.contains('Created 3 expenses from 2 recurring templates.'),
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

    @IsTest
    static void testEnabledDefaultSaveCreatesScheduleAndRepeatedSavePreservesIt() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetExpenseSettingsService.getSettings();
            BudgetExpenseSettingsState state = BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            CronTrigger original = getRecurringSchedule();
            System.assertEquals(true, state.recurringScheduleActive, 'Saving default enabled settings must create a schedule.');
            System.assertEquals('0 0 8 * * ?', original.CronExpression, 'The default time must schedule daily at 08:00.');

            BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            CronTrigger unchanged = getRecurringSchedule();
            System.assertEquals(original.Id, unchanged.Id, 'Repeated saves must preserve the job and its owner.');
            System.assertEquals(original.TimeZoneSidKey, unchanged.TimeZoneSidKey, 'Repeated saves must preserve the timezone.');
            System.assertEquals(
                1,
                [SELECT COUNT() FROM CronTrigger WHERE CronJobDetail.Name = :RECURRING_SCHEDULE_NAME AND State != 'DELETED'],
                'Repeated saves must not create duplicate schedules.'
            );
        }
    }

    @IsTest
    static void testSameTimeReenableCreatesMissingSchedule() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(false));
            System.assertEquals(null, getRecurringSchedule(), 'A disabled same-time save must not create a schedule.');
            BudgetExpenseSettingsState state = BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            System.assertEquals(true, state.recurringScheduleActive, 'Re-enabling at the same time must create the missing job.');
            System.assertEquals('0 0 8 * * ?', state.recurringScheduleCronExpression, 'Recovery must use the saved time.');
        }
    }

    @IsTest
    static void testSameTimeSaveRepairsRemovedSchedule() {
        isolateRecurringSchedule();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            Id removedJobId = getRecurringSchedule().Id;
            System.abortJob(removedJobId);
            BudgetExpenseSettingsState state = BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            System.assertEquals(true, state.recurringScheduleActive, 'Saving must repair a removed job without a clock change.');
            System.assertNotEquals(removedJobId, getRecurringSchedule().Id, 'The removed job must be replaced.');
        }
    }

    @IsTest
    static void testScheduleHealthRecognizesInactiveStates() {
        System.assertEquals(false, BudgetExpenseSettingsService.isUsableSchedule(null), 'A missing job is inactive.');
        for (String state : new List<String>{ 'PAUSED', 'PAUSED_BLOCKED', 'ERROR', 'COMPLETE', 'DELETED' }) {
            CronTrigger job = (CronTrigger) JSON.deserialize(
                '{"State":"' + state + '","NextFireTime":"2099-01-01T08:00:00.000Z"}',
                CronTrigger.class
            );
            System.assertEquals(false, BudgetExpenseSettingsService.isUsableSchedule(job), state + ' must not count as healthy.');
        }
        for (String state : new List<String>{ 'WAITING', 'ACQUIRED', 'EXECUTING', 'BLOCKED' }) {
            CronTrigger job = (CronTrigger) JSON.deserialize(
                '{"State":"' + state + '","NextFireTime":"2099-01-01T08:00:00.000Z"}',
                CronTrigger.class
            );
            System.assertEquals(true, BudgetExpenseSettingsService.isUsableSchedule(job), state + ' must not be replaced unnecessarily.');
        }
        CronTrigger noNextRun = (CronTrigger) JSON.deserialize('{"State":"WAITING"}', CronTrigger.class);
        System.assertEquals(false, BudgetExpenseSettingsService.isUsableSchedule(noNextRun), 'A job without a next run is inactive.');
    }

    @IsTest
    static void testMinimumAccessAdminCanLoadEnablePreserveAndReschedule() {
        isolateRecurringSchedule();
        CurrencyContextService.currencyProvider = new StubOrganizationCurrencyProvider('PHP');
        System.runAs(restrictedActor('SettingsRestrictedAdmin')) {
            Profile actorProfile = [
                SELECT PermissionsAuthorApex, PermissionsViewSetup, PermissionsModifyAllData
                FROM Profile
                WHERE Id = :UserInfo.getProfileId()
            ];
            System.assertEquals(false, actorProfile.PermissionsAuthorApex, 'The profile must not grant Apex administration.');
            System.assertEquals(false, actorProfile.PermissionsViewSetup, 'The profile must not grant Setup visibility.');
            System.assertEquals(false, actorProfile.PermissionsModifyAllData, 'The profile must not grant global record administration.');
            BudgetExpenseSettingsState initial = BudgetExpenseSettingsService.getSettings();
            System.assertEquals(false, initial.recurringExpensesEnabled, 'Default creation must work with app Admin permissions alone.');
            System.assertEquals('PHP', initial.baseCurrencyCode, 'The restricted administrator can initialize the currency.');
            System.assertEquals(false, initial.recurringScheduleActive, 'No isolated schedule should exist yet.');

            BudgetExpenseSettingsState enabled = BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            CronTrigger original = getRecurringSchedule();
            System.assertEquals(true, enabled.recurringScheduleActive, 'Enabling must create a usable schedule.');
            System.assertEquals(UserInfo.getUserId(), original.CreatedById, 'The app administrator must own the scheduled job.');
            System.assertEquals('Asia/Manila', original.TimeZoneSidKey, 'The schedule must use the administrator timezone.');

            BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            CronTrigger unchanged = getRecurringSchedule();
            System.assertEquals(original.Id, unchanged.Id, 'An unchanged save must preserve the job.');
            System.assertEquals(original.CreatedById, unchanged.CreatedById, 'An unchanged save must preserve ownership.');
            System.assertEquals(original.TimeZoneSidKey, unchanged.TimeZoneSidKey, 'An unchanged save must preserve timezone.');

            String unrelatedName = RECURRING_SCHEDULE_NAME + ' other';
            Id unrelatedId = System.schedule(unrelatedName, '0 0 7 * * ?', new RecurringExpenseScheduler());
            BudgetExpenseSettingsUpdateRequest changed = defaultScheduleRequest(true);
            changed.globalRecurringRunTime = '10:30';
            BudgetExpenseSettingsState rescheduled = BudgetExpenseSettingsService.saveSettings(changed);
            System.assertNotEquals(original.Id, getRecurringSchedule().Id, 'Changing time must replace the exact app job.');
            System.assertEquals('0 30 10 * * ?', rescheduled.recurringScheduleCronExpression, 'The new time must be scheduled.');
            System.assertEquals(
                'WAITING',
                [SELECT State FROM CronTrigger WHERE Id = :unrelatedId].State,
                'Other Apex jobs must remain untouched.'
            );

            Id removedId = getRecurringSchedule().Id;
            System.abortJob(removedId);
            BudgetExpenseSettingsState repaired = BudgetExpenseSettingsService.saveSettings(changed);
            System.assertEquals(true, repaired.recurringScheduleActive, 'An unchanged enabled save must repair a missing schedule.');
            System.assertNotEquals(removedId, getRecurringSchedule().Id, 'The removed job must be replaced.');
            changed.recurringExpensesEnabled = 'false';
            Id preservedId = getRecurringSchedule().Id;
            System.assertEquals(
                false,
                BudgetExpenseSettingsService.saveSettings(changed).recurringExpensesEnabled,
                'Disabling must persist the flag.'
            );
            System.assertEquals(
                preservedId,
                getRecurringSchedule().Id,
                'A same-time disabled save must preserve existing scheduler behavior.'
            );
        }
    }

    @IsTest
    static void testMinimumAccessAdminPersistsInternalRunStatusWithoutFieldEditPermission() {
        isolateRecurringSchedule();
        CurrencyContextService.currencyProvider = new StubOrganizationCurrencyProvider('PHP');
        System.runAs(restrictedActor('SettingsRestrictedAdmin')) {
            BudgetExpenseSettingsState initial = BudgetExpenseSettingsService.getSettings();
            System.assertEquals(
                false,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Status__c.getDescribe().isUpdateable(),
                'The summary must remain read-only.'
            );
            System.assertEquals(
                false,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Message__c.getDescribe().isUpdateable(),
                'The summary message must remain read-only.'
            );
            System.assertEquals(
                false,
                Budget_Expense_Manager_Setting__c.Last_Recurring_Run_DateTime__c.getDescribe().isUpdateable(),
                'The summary timestamp must remain read-only.'
            );
            try {
                Database.update(
                    new Budget_Expense_Manager_Setting__c(Id = initial.settingsId, Last_Recurring_Run_Status__c = 'Forged'),
                    AccessLevel.USER_MODE
                );
                System.assert(false, 'Direct user edits to automation-owned status must be denied.');
            } catch (DmlException expected) {
                System.assertNotEquals(null, expected.getMessage(), 'The direct edit must fail at the permission boundary.');
            }
            BudgetExpenseSettingsService.markRecurringRunQueued();
            BudgetExpenseSettingsState queued = BudgetExpenseSettingsService.getSettings();
            System.assertEquals('Queued', queued.lastRecurringRunStatus, 'The authorized runner must persist its queued status.');
            System.assertEquals(
                'Recurring expense generation is queued.',
                queued.lastRecurringRunMessage,
                'The queued message must persist.'
            );
            System.assertNotEquals(null, queued.lastRecurringRunDateTime, 'The queued timestamp must persist.');

            BudgetExpenseSettingsService.markRecurringRunCompleted(3, 2);
            BudgetExpenseSettingsState completed = BudgetExpenseSettingsService.getSettings();
            System.assertEquals('Completed', completed.lastRecurringRunStatus, 'The authorized runner must persist completion.');
            System.assertEquals(
                'Created 3 expenses from 2 recurring templates.',
                completed.lastRecurringRunMessage,
                'The completed counts must persist.'
            );
            System.assertEquals(false, completed.recurringExpensesEnabled, 'Status writes must preserve the enabled flag.');
            System.assertEquals('08:00', completed.globalRecurringRunTime, 'Status writes must preserve the configured time.');
            System.assertEquals('PHP', completed.baseCurrencyCode, 'Status writes must preserve the pinned base currency.');
            System.assertEquals(false, completed.recurringScheduleActive, 'Status writes must not create a schedule.');
        }
    }

    @IsTest
    static void testMinimumAccessAdminPreservesAndReplacesAnotherAdministratorsSchedule() {
        isolateRecurringSchedule();
        Id originalJobId = System.schedule(RECURRING_SCHEDULE_NAME, '0 0 8 * * ?', new RecurringExpenseScheduler());
        CronTrigger original = getRecurringSchedule();
        CurrencyContextService.currencyProvider = new StubOrganizationCurrencyProvider('PHP');
        System.runAs(restrictedActor('SettingsRestrictedAdmin')) {
            System.assertNotEquals(
                UserInfo.getUserId(),
                original.OwnerId,
                'The fixture must model a schedule owned by another administrator.'
            );
            BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
            CronTrigger preserved = getRecurringSchedule();
            System.assertEquals(originalJobId, preserved.Id, 'A healthy same-time job must keep its identity.');
            System.assertEquals(original.OwnerId, preserved.OwnerId, 'A same-time save must preserve the existing owner.');
            System.assertEquals(original.TimeZoneSidKey, preserved.TimeZoneSidKey, 'A same-time save must preserve the existing timezone.');

            BudgetExpenseSettingsUpdateRequest request = defaultScheduleRequest(true);
            request.globalRecurringRunTime = '11:45';
            BudgetExpenseSettingsState changed = BudgetExpenseSettingsService.saveSettings(request);
            CronTrigger replacement = getRecurringSchedule();
            System.assertNotEquals(
                originalJobId,
                replacement.Id,
                'The app administrator must be able to replace the prior administrator job.'
            );
            System.assertEquals(
                UserInfo.getUserId(),
                replacement.OwnerId,
                'Changing time must assign the replacement to the saving administrator.'
            );
            System.assertEquals('Asia/Manila', replacement.TimeZoneSidKey, 'Changing time must use the saving administrator timezone.');
            System.assertEquals('0 45 11 * * ?', changed.recurringScheduleCronExpression, 'The replacement must use the requested time.');
        }
    }

    @IsTest
    static void testEverydayUserCannotReadSaveOrWriteRunStatus() {
        isolateRecurringSchedule();
        System.runAs(restrictedActor('SettingsRestrictedUser')) {
            System.assertEquals(
                false,
                Schema.sObjectType.Budget_Expense_Manager_Setting__c.isAccessible(),
                'Everyday users must have no settings read grant.'
            );
            try {
                BudgetExpenseSettingsService.getSettings();
                System.assert(false, 'Settings reads must remain permission checked.');
            } catch (QueryException expected) {
                System.assertNotEquals(null, expected.getMessage());
            }
            try {
                BudgetExpenseSettingsService.saveSettings(defaultScheduleRequest(true));
                System.assert(false, 'Everyday users must not create a scheduled job.');
            } catch (AuraHandledException expected) {
                System.assert(expected.getMessage().contains('permission'));
            }
            try {
                BudgetExpenseSettingsService.markRecurringRunCompleted(99, 99);
                System.assert(false, 'Internal status writes must first require access to the settings record.');
            } catch (QueryException expected) {
                System.assertNotEquals(null, expected.getMessage());
            }
        }
        System.assertEquals(0, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c], 'Denied calls must not create settings.');
        System.assertEquals(null, getRecurringSchedule(), 'Denied calls must not create automation.');
    }

    @IsTest
    static void testMissingConfigFieldEditPermissionDoesNotSilentlySaveOrSchedule() {
        isolateRecurringSchedule();
        System.runAs(restrictedActor('SettingsPartialEditor')) {
            Budget_Expense_Manager_Setting__c settings = new Budget_Expense_Manager_Setting__c(
                Name = 'Default',
                Base_Currency_Code__c = 'PHP',
                Recurring_Expenses_Enabled__c = false,
                Global_Recurring_Run_Time__c = Time.newInstance(8, 0, 0, 0)
            );
            insert settings;
            System.assertEquals(
                false,
                BudgetExpenseSettingsService.getSettings().recurringExpensesEnabled,
                'A settings reader can load the existing record.'
            );
            System.assertEquals(true, Budget_Expense_Manager_Setting__c.Recurring_Expenses_Enabled__c.getDescribe().isUpdateable());
            System.assertEquals(false, Budget_Expense_Manager_Setting__c.Global_Recurring_Run_Time__c.getDescribe().isUpdateable());
            BudgetExpenseSettingsUpdateRequest request = defaultScheduleRequest(true);
            request.globalRecurringRunTime = '10:30';
            try {
                BudgetExpenseSettingsService.saveSettings(request);
                System.assert(false, 'A missing configuration field permission must reject the whole save.');
            } catch (AuraHandledException expected) {
                System.assert(expected.getMessage().contains('permission'));
            }
            BudgetExpenseSettingsState unchanged = BudgetExpenseSettingsService.getSettings();
            System.assertEquals(false, unchanged.recurringExpensesEnabled, 'A denied save must not partially enable automation.');
            System.assertEquals('08:00', unchanged.globalRecurringRunTime, 'A denied save must preserve the run time.');
            System.assertEquals(false, unchanged.recurringScheduleActive, 'A denied save must not schedule a job.');
        }
    }

    private static void isolateRecurringSchedule() {
        // CronTrigger can expose existing org jobs even without SeeAllData.
        RECURRING_SCHEDULE_NAME =
            'Settings recovery regression ' +
            String.valueOf(System.now().getTime()) +
            ' ' +
            Crypto.getRandomInteger();
        BudgetExpenseSettingsService.RECURRING_SCHEDULE_NAME = RECURRING_SCHEDULE_NAME;
    }

    private static BudgetExpenseSettingsUpdateRequest defaultScheduleRequest(Boolean enabled) {
        BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
        request.recurringExpensesEnabled = String.valueOf(enabled);
        request.globalRecurringRunTime = '08:00';
        return request;
    }

    private static CronTrigger getRecurringSchedule() {
        List<CronTrigger> recurringSchedules = [
            SELECT Id, OwnerId, CreatedById, CronExpression, NextFireTime, State, TimeZoneSidKey
            FROM CronTrigger
            WHERE CronJobDetail.Name = :RECURRING_SCHEDULE_NAME AND State != 'DELETED'
            ORDER BY NextFireTime ASC
            LIMIT 1
        ];

        return recurringSchedules.isEmpty() ? null : recurringSchedules[0];
    }
}
