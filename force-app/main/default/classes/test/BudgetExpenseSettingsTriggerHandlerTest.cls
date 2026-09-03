@IsTest
private class BudgetExpenseSettingsTriggerHandlerTest {
    private static final String SINGLETON_ERROR_MESSAGE = 'Only one Budget & Expense Manager settings record can exist.';
    private static final String INVALID_CURRENCY_ERROR_MESSAGE = 'Base Currency Code must be a three-letter uppercase ISO currency code.';
    private static final String IMMUTABLE_CURRENCY_ERROR_MESSAGE = 'Base Currency Code is fixed after initialization.';

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

    @IsTest
    static void testValidationRejectsMalformedBaseCurrency() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            Database.SaveResult result = Database.insert(
                new Budget_Expense_Manager_Setting__c(
                    Name = 'Invalid Currency',
                    Recurring_Expenses_Enabled__c = true,
                    Base_Currency_Code__c = 'usd'
                ),
                false
            );
            Test.stopTest();

            System.assertEquals(
                false,
                result.isSuccess(),
                'The base currency should reject non-normalized codes.'
            );
            System.assertEquals(
                INVALID_CURRENCY_ERROR_MESSAGE,
                result.getErrors()[0].getMessage(),
                'The validation rule should explain the required ISO format.'
            );
        }
    }

    @IsTest
    static void testValidationKeepsInitializedBaseCurrencyPinned() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Budget_Expense_Manager_Setting__c settings = new Budget_Expense_Manager_Setting__c(
                Name = 'Pinned Currency',
                Recurring_Expenses_Enabled__c = true,
                Base_Currency_Code__c = 'PHP'
            );
            insert settings;
            settings.Base_Currency_Code__c = 'USD';

            Test.startTest();
            Database.SaveResult changeResult = Database.update(settings, false);
            settings.Base_Currency_Code__c = null;
            Database.SaveResult clearResult = Database.update(settings, false);
            Test.stopTest();

            System.assertEquals(
                false,
                changeResult.isSuccess(),
                'The base currency should not change after initialization.'
            );
            System.assertEquals(
                IMMUTABLE_CURRENCY_ERROR_MESSAGE,
                changeResult.getErrors()[0].getMessage(),
                'The validation rule should explain the pinned-currency invariant.'
            );
            System.assertEquals(
                false,
                clearResult.isSuccess(),
                'The base currency should not be cleared after initialization.'
            );
            System.assertEquals(
                IMMUTABLE_CURRENCY_ERROR_MESSAGE,
                clearResult.getErrors()[0].getMessage(),
                'Clearing should be rejected by the same pinned-currency invariant.'
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
