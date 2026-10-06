@IsTest
private class AppSetupServiceTest {
    private class CurrencyProvider implements OrganizationCurrencyProvider {
        private String code;
        CurrencyProvider(String code) {
            this.code = code;
        }
        public String getCurrencyCode() {
            return code;
        }
    }

    @TestSetup
    static void users() {
        Id licenseId = [SELECT Profile.UserLicenseId FROM User WHERE Id = :UserInfo.getUserId()].Profile.UserLicenseId;
        List<Profile> profiles = [
            SELECT Id, Name
            FROM Profile
            WHERE UserLicenseId = :licenseId AND PermissionsModifyAllData = FALSE
            ORDER BY Name
        ];
        Id profileId = profiles[0].Id;
        for (Profile profile : profiles) {
            if (profile.Name == 'Minimum Access - Salesforce') {
                profileId = profile.Id;
            }
        }
        List<User> users = new List<User>();
        for (String role : new List<String>{ 'SetupAdmin', 'SetupUser' }) {
            users.add(
                new User(
                    Alias = role == 'SetupAdmin' ? 'setadmin' : 'setuser',
                    Email = role + '@example.invalid',
                    EmailEncodingKey = 'UTF-8',
                    LastName = role,
                    LanguageLocaleKey = 'en_US',
                    LocaleSidKey = 'en_US',
                    TimeZoneSidKey = 'Asia/Manila',
                    ProfileId = profileId,
                    Username = role + '.' + UserInfo.getOrganizationId() + '.' + DateTime.now().getTime() + '@example.invalid'
                )
            );
        }
        insert users;
        for (Integer index = 0; index < users.size(); index++) {
            String name = index == 0 ? 'Budget_Expense_Manager_Admin' : 'Budget_Expense_Manager_User';
            PermissionSet permission = [
                SELECT Id
                FROM PermissionSet
                WHERE Name = :name AND (NamespacePrefix = 'bemgr' OR NamespacePrefix = NULL)
                ORDER BY NamespacePrefix DESC NULLS LAST
                LIMIT 1
            ];
            insert new PermissionSetAssignment(AssigneeId = users[index].Id, PermissionSetId = permission.Id);
        }
    }

    private static User actor(String role) {
        return [SELECT Id FROM User WHERE LastName = :role LIMIT 1];
    }
    private static void currency(String code) {
        CurrencyContextService.currencyProvider = new CurrencyProvider(code);
    }

    @IsTest
    static void testStatusReadHasNoSideEffectsForAdministratorOrRestrictedUser() {
        Set<Id> existingSchedules = scheduleIds();
        currency('PHP');
        System.runAs(actor('SetupAdmin')) {
            AppSetupStatus status = AppSetupController.getSetupStatus();
            System.assertEquals(false, status.ready);
            System.assertEquals(true, status.canManageSetup);
            System.assertEquals(true, status.canCompleteSetup);
            System.assertEquals('PHP', status.organizationCurrencyCode);
        }
        System.runAs(actor('SetupUser')) {
            System.assertEquals(
                false,
                Schema.sObjectType.Budget_Expense_Manager_Setting__c.isAccessible(),
                'Everyday users have no settings object access.'
            );
            AppSetupStatus status = AppSetupController.getSetupStatus();
            System.assertEquals(false, status.ready);
            System.assertEquals(false, status.canManageSetup);
            System.assertEquals(false, status.canCompleteSetup);
            assertFailure(true, 'An app administrator must complete setup.');
        }
        System.assertEquals(0, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
        System.assertEquals(existingSchedules, scheduleIds(), 'Readiness reads must preserve any existing schedule identity and count.');
    }

    @IsTest
    static void testConfirmedSetupIsIdempotentAndDoesNotEnableOrScheduleAutomation() {
        Set<Id> existingSchedules = scheduleIds();
        Id settingsId;
        currency('PHP');
        System.runAs(actor('SetupAdmin')) {
            assertFailure(false, 'Confirm the reporting currency');
            System.assertEquals(0, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
            AppSetupStatus completed = AppSetupController.completeSetup(true);
            System.assertEquals(true, completed.ready);
            System.assertEquals('PHP', completed.baseCurrencyCode);
            Budget_Expense_Manager_Setting__c settings = [
                SELECT Id, Base_Currency_Code__c, Recurring_Expenses_Enabled__c, Global_Recurring_Run_Time__c, Singleton_Key__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];
            System.assertEquals(false, settings.Recurring_Expenses_Enabled__c);
            System.assertEquals(Time.newInstance(8, 0, 0, 0), settings.Global_Recurring_Run_Time__c);
            System.assertEquals('Default', settings.Singleton_Key__c);
            settingsId = settings.Id;
            AppSetupController.completeSetup(true);
            System.assertEquals(1, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
            System.assertEquals(existingSchedules, scheduleIds(), 'Setup must preserve any existing schedule identity and count.');
        }
        // Existing Settings reads need platform CronTrigger access; setup itself only needs the app permission.
        System.assertEquals(
            settingsId,
            SettingsController.getSettings().settingsId,
            'An initialized installation retains Settings access.'
        );
        BudgetExpenseSettingsUpdateRequest request = new BudgetExpenseSettingsUpdateRequest();
        request.recurringExpensesEnabled = 'false';
        request.globalRecurringRunTime = '08:00';
        BudgetExpenseSettingsState saved = SettingsController.saveSettings(request);
        System.assertEquals('PHP', saved.baseCurrencyCode);
        System.assertEquals(false, saved.recurringExpensesEnabled);
        System.assertEquals(settingsId, saved.settingsId);
        System.assertEquals(
            existingSchedules,
            scheduleIds(),
            'Saving disabled unchanged-time settings must not create or cancel schedules.'
        );
        System.runAs(actor('SetupUser')) {
            AppSetupStatus status = AppSetupController.getSetupStatus();
            System.assertEquals(true, status.ready, 'Private settings sharing must not make a regular user appear uninitialized.');
            System.assertEquals('PHP', status.baseCurrencyCode);
        }
    }

    @IsTest
    static void testUnsupportedOrInvalidDetectedCurrencyCannotBePinned() {
        System.runAs(actor('SetupAdmin')) {
            currency('USD');
            AppSetupStatus status = AppSetupController.getSetupStatus();
            System.assertEquals(false, status.canCompleteSetup);
            System.assertEquals('USD', status.organizationCurrencyCode);
            assertFailure(true, 'supports PHP reporting');
            currency('A1!');
            assertFailure(true, 'valid three-letter');
            System.assertEquals(0, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
        }
    }

    @IsTest
    static void testExistingUninitializedConfigurationIsPreserved() {
        currency('PHP');
        System.runAs(actor('SetupAdmin')) {
            Budget_Expense_Manager_Setting__c settings = new Budget_Expense_Manager_Setting__c(
                Name = 'Legacy',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(17, 30, 0, 0)
            );
            insert settings;
            System.assertEquals(true, AppSetupController.completeSetup(true).ready);
            settings = [
                SELECT Recurring_Expenses_Enabled__c, Global_Recurring_Run_Time__c, Base_Currency_Code__c
                FROM Budget_Expense_Manager_Setting__c
                WHERE Id = :settings.Id
            ];
            System.assertEquals(true, settings.Recurring_Expenses_Enabled__c);
            System.assertEquals(Time.newInstance(17, 30, 0, 0), settings.Global_Recurring_Run_Time__c);
            System.assertEquals('PHP', settings.Base_Currency_Code__c);
        }
    }

    @IsTest
    static void testInitializedLegacyCurrencyIsReadyWithoutChangingIt() {
        currency('EUR');
        System.runAs(actor('SetupAdmin')) {
            Budget_Expense_Manager_Setting__c settings = new Budget_Expense_Manager_Setting__c(
                Name = 'Installed',
                Base_Currency_Code__c = 'USD',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(19, 0, 0, 0)
            );
            insert settings;
            AppSetupStatus status = AppSetupController.completeSetup(true);
            System.assertEquals(true, status.ready);
            System.assertEquals('USD', status.baseCurrencyCode);
            settings = [
                SELECT Base_Currency_Code__c, Recurring_Expenses_Enabled__c, Global_Recurring_Run_Time__c
                FROM Budget_Expense_Manager_Setting__c
                WHERE Id = :settings.Id
            ];
            System.assertEquals('USD', settings.Base_Currency_Code__c);
            System.assertEquals(true, settings.Recurring_Expenses_Enabled__c);
            System.assertEquals(Time.newInstance(19, 0, 0, 0), settings.Global_Recurring_Run_Time__c);
        }
    }

    @IsTest
    static void testDuplicateAndInvalidStoredConfigurationCannotBeOverwritten() {
        List<Budget_Expense_Manager_Setting__c> duplicates = new List<Budget_Expense_Manager_Setting__c>{
            new Budget_Expense_Manager_Setting__c(),
            new Budget_Expense_Manager_Setting__c()
        };
        System.assertEquals(false, AppSetupService.buildStatus(duplicates, true).canCompleteSetup);
        System.assert(AppSetupService.buildStatus(duplicates, true).message.contains('Multiple settings'));
        System.assert(AppSetupService.buildStatus(duplicates, false).message.contains('administrator'));
        AppSetupStatus invalid = AppSetupService.buildStatus(
            new List<Budget_Expense_Manager_Setting__c>{ new Budget_Expense_Manager_Setting__c(Base_Currency_Code__c = 'bad') },
            true
        );
        System.assertEquals(false, invalid.ready);
        System.assertEquals(false, invalid.canCompleteSetup);
        System.assert(invalid.message.contains('invalid'));
    }

    @IsTest
    static void testDirectSettingsEntryDoesNotImplicitlyInitializeConfiguration() {
        currency('PHP');
        System.runAs(actor('SetupAdmin')) {
            try {
                SettingsController.getSettings();
                System.assert(false);
            } catch (AuraHandledException error) {
                System.assert(error.getMessage().contains('complete first-time setup'));
            }
            try {
                SettingsController.saveSettings(new BudgetExpenseSettingsUpdateRequest());
                System.assert(false);
            } catch (AuraHandledException error) {
                System.assert(error.getMessage().contains('complete first-time setup'));
            }
            System.assertEquals(0, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
        }
    }

    private static void assertFailure(Boolean confirmed, String messagePart) {
        try {
            AppSetupController.completeSetup(confirmed);
            System.assert(false, 'Setup should be rejected.');
        } catch (AuraHandledException error) {
            System.assert(error.getMessage().contains(messagePart), error.getMessage());
        }
    }

    @IsTest
    static void testFreshSetupSupportsOnlySingleCurrencyPhpOrganizations() {
        System.assertEquals(true, AppSetupService.supportsNewSetup('PHP', false));
        System.assertEquals(
            false,
            AppSetupService.supportsNewSetup('PHP', true),
            'A corporate PHP currency alone is not enough for generic multi-currency support.'
        );
        System.assertEquals(false, AppSetupService.supportsNewSetup('USD', false));
        System.assertEquals(false, AppSetupService.supportsNewSetup('USD', true));
    }

    @IsTest
    static void testCreationCollisionReusesCompletedWinnerWithoutChangingChoices() {
        currency('PHP');
        System.runAs(actor('SetupAdmin')) {
            Set<Id> existingSchedules = scheduleIds();
            Budget_Expense_Manager_Setting__c winner = new Budget_Expense_Manager_Setting__c(
                Name = 'Winner',
                Base_Currency_Code__c = 'PHP',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(17, 30, 0, 0)
            );
            insert winner;
            AppSetupStatus status = AppSetupService.recoverCreationCollision(settingsInsertCollision());
            System.assertEquals(true, status.ready);
            System.assertEquals(1, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
            winner = [
                SELECT Recurring_Expenses_Enabled__c, Global_Recurring_Run_Time__c
                FROM Budget_Expense_Manager_Setting__c
                WHERE Id = :winner.Id
            ];
            System.assertEquals(true, winner.Recurring_Expenses_Enabled__c);
            System.assertEquals(Time.newInstance(17, 30, 0, 0), winner.Global_Recurring_Run_Time__c);
            System.assertEquals(existingSchedules, scheduleIds());
        }
    }

    @IsTest
    static void testCreationCollisionInitializesUnfinishedWinnerAndRejectsUnsupportedCurrency() {
        System.runAs(actor('SetupAdmin')) {
            Budget_Expense_Manager_Setting__c winner = new Budget_Expense_Manager_Setting__c(
                Name = 'Unfinished winner',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(19, 0, 0, 0)
            );
            insert winner;
            DmlException collision = settingsInsertCollision();
            currency('USD');
            try {
                AppSetupService.recoverCreationCollision(collision);
                System.assert(false);
            } catch (AuraHandledException error) {
                System.assert(error.getMessage().contains('supports PHP'));
            }
            System.assertEquals(
                null,
                [SELECT Base_Currency_Code__c FROM Budget_Expense_Manager_Setting__c WHERE Id = :winner.Id].Base_Currency_Code__c
            );
            currency('PHP');
            System.assertEquals(true, AppSetupService.recoverCreationCollision(collision).ready);
            winner = [
                SELECT Base_Currency_Code__c, Recurring_Expenses_Enabled__c, Global_Recurring_Run_Time__c
                FROM Budget_Expense_Manager_Setting__c
                WHERE Id = :winner.Id
            ];
            System.assertEquals('PHP', winner.Base_Currency_Code__c);
            System.assertEquals(true, winner.Recurring_Expenses_Enabled__c);
            System.assertEquals(Time.newInstance(19, 0, 0, 0), winner.Global_Recurring_Run_Time__c);
        }
    }

    @IsTest
    static void testUnrelatedInsertFailureIsNotTreatedAsSuccessfulSetup() {
        System.runAs(actor('SetupAdmin')) {
            DmlException failure;
            try {
                insert new Budget_Expense_Manager_Setting__c(Name = 'Invalid', Base_Currency_Code__c = 'bad');
                System.assert(false);
            } catch (DmlException error) {
                failure = error;
            }
            try {
                AppSetupService.recoverCreationCollision(failure);
                System.assert(false);
            } catch (AuraHandledException error) {
                System.assert(error.getMessage().contains('Unable to complete setup'));
            }
            System.assertEquals(0, [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c]);
        }
    }

    // A real losing insert exercises recovery at its boundary; this does not simulate concurrent transactions.
    private static DmlException settingsInsertCollision() {
        try {
            insert new Budget_Expense_Manager_Setting__c(Name = 'Losing insert');
            System.assert(false);
        } catch (DmlException collision) {
            return collision;
        }
        return null;
    }

    private static Set<Id> scheduleIds() {
        return new Map<Id, CronTrigger>([SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = 'Budget Expense Manager Recurring Daily'])
            .keySet();
    }
}
