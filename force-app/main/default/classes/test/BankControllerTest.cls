@IsTest
private class BankControllerTest {
    @TestSetup
    static void setupData() {
        Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Household');
        insert expenseGroup;

        Bank__c bpi = new Bank__c(Name = 'BPI', Active__c = true);
        Bank__c maribank = new Bank__c(Name = 'MariBank', Active__c = true);
        Bank__c gcash = new Bank__c(Name = 'Gcash', Active__c = true);
        insert new List<Bank__c>{ maribank, bpi, gcash };

        Expense_Group_Bank__c bpiAssignment = assignment(expenseGroup.Id, bpi.Id, true);
        Expense_Group_Bank__c maribankAssignment = assignment(expenseGroup.Id, maribank.Id, true);
        Expense_Group_Bank__c gcashAssignment = assignment(expenseGroup.Id, gcash.Id, true);
        insert new List<Expense_Group_Bank__c>{
            maribankAssignment,
            bpiAssignment,
            gcashAssignment
        };
        gcashAssignment.Active__c = false;
        update gcashAssignment;
    }

    @IsTest
    static void testGetAvailableExpenseGroupBanksReturnsActiveOptionsInNameOrder() {
        Expense_Group__c expenseGroup = [
            SELECT Id
            FROM Expense_Group__c
            WHERE Name = 'Household'
            LIMIT 1
        ];

        List<ExpenseGroupBankOptionDto> options;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            options = BankController.getAvailableExpenseGroupBanks(expenseGroup.Id);
        }
        Test.stopTest();

        System.assertEquals(2, options.size(), 'Only active assignment/Bank pairs should return.');
        System.assertEquals('BPI', options[0].bankName, 'Options should be ordered by Bank name.');
        System.assertEquals(
            'MariBank',
            options[1].bankName,
            'The second available Bank should follow alphabetically.'
        );
        System.assertNotEquals(null, options[0].assignmentId, 'The selector must return its ID.');
        System.assertNotEquals(null, options[0].bankId, 'The selector must return the Bank ID.');
        System.assertEquals(
            expenseGroup.Id,
            options[0].expenseGroupId,
            'The selector should retain the owning Expense Group.'
        );
    }

    @IsTest
    static void testGetAvailableExpenseGroupBanksHandlesMissingContext() {
        List<ExpenseGroupBankOptionDto> options;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            options = BankController.getAvailableExpenseGroupBanks(null);
        }
        Test.stopTest();

        System.assertEquals(0, options.size(), 'A missing Expense Group should return no options.');
    }

    private static Expense_Group_Bank__c assignment(Id expenseGroupId, Id bankId, Boolean active) {
        return new Expense_Group_Bank__c(
            Expense_Group__c = expenseGroupId,
            Bank__c = bankId,
            Active__c = active
        );
    }
}
