@IsTest
private class BudgetTriggerHandlerTest {
    @TestSetup
    static void setupExpenseGroups() {
        insert new List<Expense_Group__c>{
            new Expense_Group__c(Name = 'Household'),
            new Expense_Group__c(Name = 'Travel')
        };
    }

    @IsTest
    static void testTriggerNormalizesMonthAndCompositeKey() {
        Expense_Group__c household = getExpenseGroup('Household');
        Budget__c budget = new Budget__c(
            Expense_Group__c = household.Id,
            Budget_Month__c = Date.newInstance(2026, 8, 19),
            Amount__c = 15000,
            Budget_Key__c = 'untrusted-client-value'
        );

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert budget;
        }
        Test.stopTest();

        Budget__c persistedBudget = [
            SELECT Expense_Group__c, Budget_Month__c, Budget_Key__c
            FROM Budget__c
            WHERE Id = :budget.Id
        ];
        System.assertEquals(
            Date.newInstance(2026, 8, 1),
            persistedBudget.Budget_Month__c,
            'The trigger should normalize every budget to the first day of its month.'
        );
        System.assertEquals(
            String.valueOf(household.Id) + '-2026-08',
            persistedBudget.Budget_Key__c,
            'The trigger should replace client input with the normalized composite key.'
        );
    }

    @IsTest
    static void testTriggerRegeneratesKeyOnUpdate() {
        Expense_Group__c household = getExpenseGroup('Household');
        Budget__c budget = new Budget__c(
            Expense_Group__c = household.Id,
            Budget_Month__c = Date.newInstance(2026, 8, 1),
            Amount__c = 15000
        );
        insert budget;

        budget.Budget_Month__c = Date.newInstance(2026, 9, 27);
        budget.Budget_Key__c = 'stale-key';

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            update budget;
        }
        Test.stopTest();

        Budget__c persistedBudget = [
            SELECT Expense_Group__c, Budget_Month__c, Budget_Key__c
            FROM Budget__c
            WHERE Id = :budget.Id
        ];
        System.assertEquals(
            household.Id,
            persistedBudget.Expense_Group__c,
            'Changing a budget month should preserve its owning expense group.'
        );
        System.assertEquals(
            Date.newInstance(2026, 9, 1),
            persistedBudget.Budget_Month__c,
            'The trigger should renormalize a changed month.'
        );
        System.assertEquals(
            String.valueOf(household.Id) + '-2026-09',
            persistedBudget.Budget_Key__c,
            'The trigger should regenerate the key from the updated owning context.'
        );
    }

    @IsTest
    static void testUniqueKeyPreventsDuplicateMonthlyBudgets() {
        Expense_Group__c household = getExpenseGroup('Household');
        insert new Budget__c(
            Expense_Group__c = household.Id,
            Budget_Month__c = Date.newInstance(2026, 8, 1),
            Amount__c = 15000
        );

        Database.SaveResult duplicateResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            duplicateResult = Database.insert(
                new Budget__c(
                    Expense_Group__c = household.Id,
                    Budget_Month__c = Date.newInstance(2026, 8, 31),
                    Amount__c = 20000
                ),
                false
            );
        }
        Test.stopTest();

        System.assertEquals(
            false,
            duplicateResult.isSuccess(),
            'The normalized unique key should reject a second group/month budget.'
        );
        System.assertEquals(
            StatusCode.DUPLICATE_VALUE,
            duplicateResult.getErrors()[0].getStatusCode(),
            'The unique composite key should enforce duplicate prevention atomically.'
        );
        System.assertEquals(
            1,
            [SELECT COUNT() FROM Budget__c WHERE Expense_Group__c = :household.Id],
            'The failed duplicate should not add another record.'
        );
    }

    @IsTest
    static void testHandlerRejectsMissingOrNonPositiveValues() {
        Expense_Group__c household = getExpenseGroup('Household');
        Budget__c missingGroup = new Budget__c(
            Budget_Month__c = Date.newInstance(2026, 8, 1),
            Amount__c = 1000
        );
        Budget__c missingMonth = new Budget__c(Expense_Group__c = household.Id, Amount__c = 1000);
        Budget__c nonPositiveAmount = new Budget__c(
            Expense_Group__c = household.Id,
            Budget_Month__c = Date.newInstance(2026, 8, 1),
            Amount__c = 0
        );

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetTriggerHandler.beforeSave(
                new List<Budget__c>{ missingGroup, missingMonth, nonPositiveAmount }
            );
        }
        Test.stopTest();

        System.assert(
            missingGroup.hasErrors() && missingMonth.hasErrors() && nonPositiveAmount.hasErrors(),
            'Each invalid direct write should fail.'
        );
        assertRecordError(missingGroup, 'Expense Group is required.');
        assertRecordError(missingMonth, 'Budget Month is required.');
        assertRecordError(nonPositiveAmount, 'Budget Amount must be greater than zero.');
    }

    private static void assertRecordError(Budget__c budget, String expectedMessage) {
        System.assertEquals(true, budget.hasErrors(), 'Invalid direct writes should fail.');
        System.assertEquals(
            expectedMessage,
            budget.getErrors()[0].getMessage(),
            'The handler should report the violated budget invariant.'
        );
    }

    private static Expense_Group__c getExpenseGroup(String name) {
        return [SELECT Id, Name FROM Expense_Group__c WHERE Name = :name LIMIT 1];
    }
}
