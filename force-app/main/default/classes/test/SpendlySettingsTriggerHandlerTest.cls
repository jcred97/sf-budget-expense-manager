@IsTest
private class SpendlySettingsTriggerHandlerTest {
    private static final String SINGLETON_ERROR_MESSAGE = 'Only one Spendly Settings record can exist.';

    @IsTest
    static void testBeforeInsertRejectsRecordWhenSettingsAlreadyExist() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SpendlySettingsService.getSettings();
            Spendly_Settings__c secondSettings = new Spendly_Settings__c(
                Name = 'Second',
                Recurring_Expenses_Enabled__c = true
            );

            Test.startTest();
            SpendlySettingsTriggerHandler.beforeInsert(
                new List<Spendly_Settings__c>{ secondSettings }
            );
            Test.stopTest();

            System.assert(
                secondSettings.hasErrors(),
                'The handler should reject a second settings record.'
            );
            assertSingletonError(secondSettings);
        }
    }

    @IsTest
    static void testBeforeInsertRejectsBulkRecordsWhenSettingsDoNotExist() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            List<Spendly_Settings__c> settingsRecords = new List<Spendly_Settings__c>{
                new Spendly_Settings__c(Name = 'First', Recurring_Expenses_Enabled__c = true),
                new Spendly_Settings__c(Name = 'Second', Recurring_Expenses_Enabled__c = false)
            };

            Test.startTest();
            SpendlySettingsTriggerHandler.beforeInsert(settingsRecords);
            Test.stopTest();

            for (Spendly_Settings__c settingsRecord : settingsRecords) {
                assertSingletonError(settingsRecord);
            }
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Spendly_Settings__c],
                'Direct handler validation should not insert settings records.'
            );
        }
    }

    @IsTest
    static void testTriggerDelegatesBeforeInsert() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SpendlySettingsService.getSettings();

            Test.startTest();
            Database.SaveResult result = Database.insert(
                new Spendly_Settings__c(Name = 'Second', Recurring_Expenses_Enabled__c = true),
                false
            );
            Test.stopTest();

            System.assertEquals(
                false,
                result.isSuccess(),
                'The trigger should reject a second settings record.'
            );
            System.assertEquals(
                SINGLETON_ERROR_MESSAGE,
                result.getErrors()[0].getMessage(),
                'The trigger should delegate singleton validation to its handler.'
            );
        }
    }

    private static void assertSingletonError(Spendly_Settings__c settingsRecord) {
        System.assertEquals(
            true,
            settingsRecord.hasErrors(),
            'The handler should add an error to each rejected settings record.'
        );
        System.assertEquals(
            SINGLETON_ERROR_MESSAGE,
            settingsRecord.getErrors()[0].getMessage(),
            'The handler should explain the singleton constraint.'
        );
    }
}
