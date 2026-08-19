@IsTest
private class BankAssignmentValidatorTest {
    @TestSetup
    static void setupData() {
        Expense_Group__c household = new Expense_Group__c(Name = 'Household');
        Expense_Group__c travel = new Expense_Group__c(Name = 'Travel');
        insert new List<Expense_Group__c>{ household, travel };
        insert new List<Category__c>{
            new Category__c(Name = 'Bills', Expense_Group__c = household.Id),
            new Category__c(Name = 'Flights', Expense_Group__c = travel.Id)
        };

        Bank__c bpi = new Bank__c(Name = 'BPI', Active__c = true);
        Bank__c bdo = new Bank__c(Name = 'BDO', Active__c = true);
        insert new List<Bank__c>{ bpi, bdo };
        insert new List<Expense_Group_Bank__c>{
            new Expense_Group_Bank__c(
                Expense_Group__c = household.Id,
                Bank__c = bpi.Id,
                Active__c = true
            ),
            new Expense_Group_Bank__c(
                Expense_Group__c = household.Id,
                Bank__c = bdo.Id,
                Active__c = true
            ),
            new Expense_Group_Bank__c(
                Expense_Group__c = travel.Id,
                Bank__c = bpi.Id,
                Active__c = true
            )
        };
    }

    @IsTest
    static void testValidSelectionsPersistForExpenseAndRecurringTemplate() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense__c expense = expenseRecord('Electricity', category.Id, assignment.Id);
        Recurring_Expense__c recurringExpense = recurringRecord(
            'Internet',
            category.Id,
            assignment.Id
        );

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert expense;
            insert recurringExpense;
        }
        Test.stopTest();

        System.assertNotEquals(null, expense.Id, 'A valid Expense selection should save.');
        System.assertNotEquals(
            null,
            recurringExpense.Id,
            'A valid Recurring selection should save.'
        );
    }

    @IsTest
    static void testMismatchedExpenseGroupRejectedForBothRecordTypes() {
        Category__c travelCategory = categoryByName('Flights');
        Expense_Group_Bank__c householdAssignment = assignmentByGroupAndBank('Household', 'BPI');

        Database.SaveResult expenseResult;
        Database.SaveResult recurringResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            expenseResult = Database.insert(
                expenseRecord('Hotel', travelCategory.Id, householdAssignment.Id),
                false
            );
            recurringResult = Database.insert(
                recurringRecord('Travel Plan', travelCategory.Id, householdAssignment.Id),
                false
            );
        }
        Test.stopTest();

        System.assertEquals(false, expenseResult.isSuccess(), 'The Expense should be rejected.');
        System.assertEquals(
            false,
            recurringResult.isSuccess(),
            'The Recurring Expense should be rejected.'
        );
        assertGroupMismatch(expenseResult);
        assertGroupMismatch(recurringResult);
    }

    @IsTest
    static void testNewInactiveAssignmentSelectionRejected() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        assignment.Active__c = false;
        update assignment;

        Database.SaveResult expenseResult;
        Database.SaveResult recurringResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            expenseResult = Database.insert(
                expenseRecord('Electricity', category.Id, assignment.Id),
                false
            );
            recurringResult = Database.insert(
                recurringRecord('Internet', category.Id, assignment.Id),
                false
            );
        }
        Test.stopTest();

        System.assertEquals(false, expenseResult.isSuccess(), 'The Expense should be rejected.');
        System.assertEquals(
            false,
            recurringResult.isSuccess(),
            'The Recurring Expense should be rejected.'
        );
        assertInactiveSelection(expenseResult);
        assertInactiveSelection(recurringResult);
    }

    @IsTest
    static void testHistoricalInactiveExpenseRemainsEditable() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense__c expense = expenseRecord('Electricity', category.Id, assignment.Id);
        insert expense;
        assignment.Active__c = false;
        update assignment;

        expense.Name = 'Electricity corrected';
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            update expense;
        }
        Test.stopTest();

        System.assertEquals(
            'Electricity corrected',
            [SELECT Name FROM Expense__c WHERE Id = :expense.Id].Name,
            'Unrelated historical edits should not revalidate inactive assignments.'
        );
    }

    @IsTest
    static void testInactiveRecurringTemplateCanBeEditedButNotReactivated() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c assignment = assignmentByGroupAndBank('Household', 'BPI');
        Recurring_Expense__c recurringExpense = recurringRecord(
            'Internet',
            category.Id,
            assignment.Id
        );
        recurringExpense.Active__c = false;
        insert recurringExpense;
        assignment.Active__c = false;
        update assignment;

        recurringExpense.Name = 'Internet corrected';
        update recurringExpense;
        recurringExpense.Active__c = true;

        Database.SaveResult reactivationResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            reactivationResult = Database.update(recurringExpense, false);
        }
        Test.stopTest();

        assertInactiveSelection(reactivationResult);
        System.assertEquals(
            'Internet corrected',
            [SELECT Name FROM Recurring_Expense__c WHERE Id = :recurringExpense.Id].Name,
            'An unrelated edit to an inactive template should persist.'
        );
    }

    @IsTest
    static void testActiveAssignmentCanChangeWithinSameExpenseGroup() {
        Category__c category = categoryByName('Bills');
        Expense_Group_Bank__c bpiAssignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense_Group_Bank__c bdoAssignment = assignmentByGroupAndBank('Household', 'BDO');
        Expense__c expense = expenseRecord('Electricity', category.Id, bpiAssignment.Id);
        insert expense;

        expense.Bank_Assignment__c = bdoAssignment.Id;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            update expense;
        }
        Test.stopTest();

        System.assertEquals(
            bdoAssignment.Id,
            [SELECT Bank_Assignment__c FROM Expense__c WHERE Id = :expense.Id].Bank_Assignment__c,
            'A user may switch to another active assignment in the same group.'
        );
    }

    @IsTest
    static void testLegacyOnlyBankRemainsCompatible() {
        Category__c category = categoryByName('Bills');
        Expense__c expense = new Expense__c(
            Name = 'Legacy Expense',
            Amount__c = 100,
            Bank__c = 'BPI',
            Category__c = category.Id,
            Expense_Date__c = Date.today()
        );

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert expense;
        }
        Test.stopTest();

        System.assertEquals(
            'BPI',
            [SELECT Bank__c FROM Expense__c WHERE Id = :expense.Id].Bank__c,
            'Legacy-only writes should remain valid during migration.'
        );
    }

    @IsTest
    static void testBulkValidationSupportsMultipleExpenseGroups() {
        Category__c householdCategory = categoryByName('Bills');
        Category__c travelCategory = categoryByName('Flights');
        Expense_Group_Bank__c householdAssignment = assignmentByGroupAndBank('Household', 'BPI');
        Expense_Group_Bank__c travelAssignment = assignmentByGroupAndBank('Travel', 'BPI');
        List<Expense__c> expenses = new List<Expense__c>{
            expenseRecord('Power', householdCategory.Id, householdAssignment.Id),
            expenseRecord('Airfare', travelCategory.Id, travelAssignment.Id)
        };

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert expenses;
        }
        Test.stopTest();

        System.assertEquals(2, expenses.size(), 'Both bulk records should remain in the request.');
        System.assertNotEquals(null, expenses[0].Id, 'The household Expense should save.');
        System.assertNotEquals(null, expenses[1].Id, 'The travel Expense should save.');
    }

    private static void assertGroupMismatch(Database.SaveResult result) {
        System.assertEquals(false, result.isSuccess(), 'A cross-group selection should fail.');
        System.assert(
            result.getErrors()[0].getMessage().contains('Category\'s Expense Group'),
            'The error should identify the group mismatch.'
        );
    }

    private static void assertInactiveSelection(Database.SaveResult result) {
        System.assertEquals(false, result.isSuccess(), 'An inactive new selection should fail.');
        System.assert(
            result.getErrors()[0].getMessage().contains('active Bank assignment'),
            'The error should require an active assignment.'
        );
    }

    private static Expense__c expenseRecord(String name, Id categoryId, Id assignmentId) {
        return new Expense__c(
            Name = name,
            Amount__c = 100,
            Bank_Assignment__c = assignmentId,
            Category__c = categoryId,
            Expense_Date__c = Date.today()
        );
    }

    private static Recurring_Expense__c recurringRecord(
        String name,
        Id categoryId,
        Id assignmentId
    ) {
        return new Recurring_Expense__c(
            Name = name,
            Active__c = true,
            Amount__c = 100,
            Bank_Assignment__c = assignmentId,
            Category__c = categoryId,
            Frequency__c = 'Monthly',
            Start_Date__c = Date.today()
        );
    }

    private static Category__c categoryByName(String name) {
        return [SELECT Id FROM Category__c WHERE Name = :name LIMIT 1];
    }

    private static Expense_Group_Bank__c assignmentByGroupAndBank(
        String expenseGroupName,
        String bankName
    ) {
        return [
            SELECT Id, Active__c
            FROM Expense_Group_Bank__c
            WHERE Expense_Group__r.Name = :expenseGroupName AND Bank__r.Name = :bankName
            LIMIT 1
        ];
    }
}
