@IsTest
private class BudgetExpenseSettingsTriggerHandlerTest {
    private static final String SINGLETON_ERROR_MESSAGE = 'Only one Budget & Expense Manager settings record can exist.';

    @IsTest
    static void testBeforeInsertAllowsFirstSettingsRecord() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Budget_Expense_Manager_Setting__c firstSettings = new Budget_Expense_Manager_Setting__c(
                Name = 'First',
                Recurring_Expenses_Enabled__c = true
            );

            Test.startTest();
            BudgetExpenseSettingsTriggerHandler.beforeInsert(
                new List<Budget_Expense_Manager_Setting__c>{ firstSettings }
            );
            Test.stopTest();

            System.assertEquals(
                false,
                firstSettings.hasErrors(),
                'The handler should allow the first settings record.'
            );
        }
    }

    @IsTest
    static void testBeforeInsertRejectsRecordWhenSettingsAlreadyExist() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SettingsController.getSettings();
            Budget_Expense_Manager_Setting__c secondSettings = new Budget_Expense_Manager_Setting__c(
                Name = 'Second',
                Recurring_Expenses_Enabled__c = true
            );

            Test.startTest();
            BudgetExpenseSettingsTriggerHandler.beforeInsert(
                new List<Budget_Expense_Manager_Setting__c>{ secondSettings }
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
            List<Budget_Expense_Manager_Setting__c> settingsRecords = new List<Budget_Expense_Manager_Setting__c>{
                new Budget_Expense_Manager_Setting__c(
                    Name = 'First',
                    Recurring_Expenses_Enabled__c = true
                ),
                new Budget_Expense_Manager_Setting__c(
                    Name = 'Second',
                    Recurring_Expenses_Enabled__c = false
                )
            };

            Test.startTest();
            BudgetExpenseSettingsTriggerHandler.beforeInsert(settingsRecords);
            Test.stopTest();

            for (Budget_Expense_Manager_Setting__c settingsRecord : settingsRecords) {
                assertSingletonError(settingsRecord);
            }
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c],
                'Direct handler validation should not insert settings records.'
            );
        }
    }

    @IsTest
    static void testTriggerDelegatesBeforeInsert() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SettingsController.getSettings();

            Test.startTest();
            Database.SaveResult result = Database.insert(
                new Budget_Expense_Manager_Setting__c(
                    Name = 'Second',
                    Recurring_Expenses_Enabled__c = true
                ),
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

    private static void assertSingletonError(Budget_Expense_Manager_Setting__c settingsRecord) {
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
