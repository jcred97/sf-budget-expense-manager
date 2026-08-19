@IsTest
private class BudgetControllerTest {
    private static final Date AUGUST_DATE = Date.newInstance(2026, 8, 19);

    @TestSetup
    static void setupExpenseGroups() {
        insert new List<Expense_Group__c>{
            new Expense_Group__c(Name = 'Household'),
            new Expense_Group__c(Name = 'Travel')
        };
    }

    @IsTest
    static void testAbsentBudgetAndNormalizedLookup() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c household = getExpenseGroup('Household');

            System.assertEquals(
                null,
                BudgetController.getMonthlyBudget(household.Id, AUGUST_DATE),
                'A group without a monthly budget should remain opted out.'
            );

            BudgetSaveRequest request = buildRequest(household.Id, AUGUST_DATE, 15000);
            request.description = 'Monthly household cap';

            Test.startTest();
            BudgetDto savedBudget = BudgetController.saveMonthlyBudget(request);
            Test.stopTest();

            System.assertNotEquals(null, savedBudget.id, 'Creating a budget should return its ID.');
            System.assertEquals(
                household.Id,
                savedBudget.expenseGroupId,
                'The created budget should retain its expense group.'
            );
            System.assertEquals(
                Date.newInstance(2026, 8, 1),
                savedBudget.budgetMonth,
                'The service should normalize the requested date to the first of the month.'
            );
            System.assertEquals(15000, savedBudget.amount, 'The amount should be persisted.');

            BudgetDto foundBudget = BudgetController.getMonthlyBudget(
                household.Id,
                Date.newInstance(2026, 8, 31)
            );
            System.assertEquals(
                savedBudget.id,
                foundBudget.id,
                'Any date in the same month should find the normalized budget.'
            );

            Budget__c persistedBudget = [
                SELECT Budget_Key__c
                FROM Budget__c
                WHERE Id = :savedBudget.id
            ];
            System.assertEquals(
                String.valueOf(household.Id) + '-2026-08',
                persistedBudget.Budget_Key__c,
                'Creating through the controller should populate the composite key.'
            );
        }
    }

    @IsTest
    static void testUpdateExistingBudget() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c household = getExpenseGroup('Household');
            BudgetDto originalBudget = BudgetController.saveMonthlyBudget(
                buildRequest(household.Id, AUGUST_DATE, 15000)
            );
            BudgetSaveRequest updateRequest = buildRequest(
                household.Id,
                Date.newInstance(2026, 8, 1),
                18000
            );
            updateRequest.budgetId = originalBudget.id;
            updateRequest.description = 'Revised budget';

            Test.startTest();
            BudgetDto updatedBudget = BudgetController.saveMonthlyBudget(updateRequest);
            Test.stopTest();

            System.assertEquals(
                originalBudget.id,
                updatedBudget.id,
                'An explicit budget ID should update the existing record.'
            );
            System.assertEquals(
                18000,
                updatedBudget.amount,
                'The update should persist its amount.'
            );
            System.assertEquals(
                'Revised budget',
                updatedBudget.description,
                'The service should persist optional notes.'
            );
            System.assertEquals(
                1,
                [SELECT COUNT() FROM Budget__c WHERE Expense_Group__c = :household.Id],
                'Updating should not create another budget record.'
            );
        }
    }

    @IsTest
    static void testSaveWithoutIdUsesMonthlyUpsertSemantics() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c household = getExpenseGroup('Household');
            BudgetDto originalBudget = BudgetController.saveMonthlyBudget(
                buildRequest(household.Id, AUGUST_DATE, 15000)
            );
            BudgetSaveRequest secondRequest = buildRequest(
                household.Id,
                Date.newInstance(2026, 8, 2),
                20000
            );

            Test.startTest();
            BudgetDto savedBudget = BudgetController.saveMonthlyBudget(secondRequest);
            Test.stopTest();

            System.assertEquals(
                originalBudget.id,
                savedBudget.id,
                'Saving the same group and month without an ID should update the existing budget.'
            );
            System.assertEquals(
                20000,
                savedBudget.amount,
                'The upsert should persist the new amount.'
            );
            System.assertEquals(
                null,
                savedBudget.description,
                'An omitted description should remain null.'
            );
            System.assertEquals(
                1,
                [
                    SELECT COUNT()
                    FROM Budget__c
                    WHERE Expense_Group__c = :household.Id AND Budget_Month__c = 2026-08-01
                ],
                'Only one budget should exist for the group and month.'
            );
        }
    }

    @IsTest
    static void testSaveValidation() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c household = getExpenseGroup('Household');

            assertSaveFails(null, 'Budget details are required.');
            assertSaveFails(buildRequest(null, AUGUST_DATE, 1000), 'Expense Group Id is required.');
            assertSaveFails(buildRequest(household.Id, null, 1000), 'Budget month is required.');
            assertSaveFails(
                buildRequest(household.Id, AUGUST_DATE, null),
                'Budget amount must be greater than zero.'
            );
            assertSaveFails(
                buildRequest(household.Id, AUGUST_DATE, 0),
                'Budget amount must be greater than zero.'
            );
            assertSaveFails(
                buildRequest(household.Id, AUGUST_DATE, -1),
                'Budget amount must be greater than zero.'
            );
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Budget__c],
                'Rejected requests must not create budget records.'
            );
        }
    }

    @IsTest
    static void testBudgetIdCannotChangeOwningContext() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c household = getExpenseGroup('Household');
            Expense_Group__c travel = getExpenseGroup('Travel');
            BudgetDto savedBudget = BudgetController.saveMonthlyBudget(
                buildRequest(household.Id, AUGUST_DATE, 15000)
            );
            BudgetSaveRequest mismatchedGroupRequest = buildRequest(travel.Id, AUGUST_DATE, 25000);
            mismatchedGroupRequest.budgetId = savedBudget.id;

            assertSaveFails(
                mismatchedGroupRequest,
                'Budget record does not match the requested expense group and month.'
            );

            BudgetSaveRequest mismatchedMonthRequest = buildRequest(
                household.Id,
                Date.newInstance(2026, 9, 1),
                25000
            );
            mismatchedMonthRequest.budgetId = savedBudget.id;
            assertSaveFails(
                mismatchedMonthRequest,
                'Budget record does not match the requested expense group and month.'
            );

            Budget__c unchangedBudget = [
                SELECT Expense_Group__c, Budget_Month__c, Amount__c
                FROM Budget__c
                WHERE Id = :savedBudget.id
            ];
            System.assertEquals(
                household.Id,
                unchangedBudget.Expense_Group__c,
                'A mismatched request must not reparent another budget.'
            );
            System.assertEquals(
                Date.newInstance(2026, 8, 1),
                unchangedBudget.Budget_Month__c,
                'A mismatched request must not move another monthly budget.'
            );
            System.assertEquals(
                15000,
                unchangedBudget.Amount__c,
                'A rejected request must not save.'
            );
        }
    }

    @IsTest
    static void testDeleteMonthlyBudget() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c household = getExpenseGroup('Household');
            BudgetDto savedBudget = BudgetController.saveMonthlyBudget(
                buildRequest(household.Id, AUGUST_DATE, 15000)
            );

            Test.startTest();
            BudgetController.deleteMonthlyBudget(savedBudget.id);
            Test.stopTest();

            System.assertEquals(
                0,
                [SELECT COUNT() FROM Budget__c WHERE Id = :savedBudget.id],
                'Deleting a budget should remove only that opt-in record.'
            );
            System.assertEquals(
                null,
                BudgetController.getMonthlyBudget(household.Id, AUGUST_DATE),
                'Removing a budget should return the month to its opted-out state.'
            );

            assertDeleteFails(null, 'Budget Id is required for deletion.');
            assertDeleteFails(savedBudget.id, 'Budget not found or already deleted.');
        }
    }

    private static Expense_Group__c getExpenseGroup(String name) {
        return [SELECT Id, Name FROM Expense_Group__c WHERE Name = :name LIMIT 1];
    }

    private static BudgetSaveRequest buildRequest(
        Id expenseGroupId,
        Date budgetMonth,
        Decimal amount
    ) {
        BudgetSaveRequest request = new BudgetSaveRequest();
        request.expenseGroupId = expenseGroupId;
        request.budgetMonth = budgetMonth;
        request.amount = amount;
        return request;
    }

    private static void assertSaveFails(BudgetSaveRequest request, String expectedMessage) {
        try {
            BudgetController.saveMonthlyBudget(request);
            System.assert(false, 'Expected the budget save to fail.');
        } catch (AuraHandledException e) {
            System.assertEquals(
                expectedMessage,
                e.getMessage(),
                'Unexpected save validation error.'
            );
        }
    }

    private static void assertDeleteFails(Id budgetId, String expectedMessage) {
        try {
            BudgetController.deleteMonthlyBudget(budgetId);
            System.assert(false, 'Expected the budget deletion to fail.');
        } catch (AuraHandledException e) {
            System.assertEquals(
                expectedMessage,
                e.getMessage(),
                'Unexpected delete validation error.'
            );
        }
    }
}
