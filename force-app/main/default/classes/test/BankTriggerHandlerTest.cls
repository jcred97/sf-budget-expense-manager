@IsTest
private class BankTriggerHandlerTest {
    @IsTest
    static void testTriggerNormalizesNameAndUniqueKey() {
        Bank__c bank = new Bank__c(Name = '  Metro   Bank  ', Active__c = true);

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert bank;
        }
        Test.stopTest();

        bank = [SELECT Name, Bank_Key__c FROM Bank__c WHERE Id = :bank.Id];
        System.assertEquals('Metro Bank', bank.Name, 'Whitespace should be normalized.');
        System.assertEquals('metro bank', bank.Bank_Key__c, 'The key should ignore name case.');
    }

    @IsTest
    static void testUniqueKeyRejectsCaseAndWhitespaceDuplicate() {
        insert new Bank__c(Name = 'BPI', Active__c = true);

        Database.SaveResult duplicateResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            duplicateResult = Database.insert(new Bank__c(Name = ' bpi ', Active__c = true), false);
        }
        Test.stopTest();

        System.assertEquals(false, duplicateResult.isSuccess(), 'Duplicate Banks should fail.');
        System.assertEquals(
            StatusCode.DUPLICATE_VALUE,
            duplicateResult.getErrors()[0].getStatusCode(),
            'The unique normalized key should enforce duplicate prevention.'
        );
    }

    @IsTest
    static void testBankDeactivationRequiresInactiveGroupAssignments() {
        Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Household');
        Bank__c bank = new Bank__c(Name = 'BPI', Active__c = true);
        insert expenseGroup;
        insert bank;
        Expense_Group_Bank__c assignment = new Expense_Group_Bank__c(
            Expense_Group__c = expenseGroup.Id,
            Bank__c = bank.Id,
            Active__c = true
        );
        insert assignment;

        bank.Active__c = false;
        Database.SaveResult blockedResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            blockedResult = Database.update(bank, false);
        }
        Test.stopTest();

        System.assertEquals(false, blockedResult.isSuccess(), 'An active assignment should block.');
        System.assert(
            blockedResult.getErrors()[0].getMessage().contains('every Expense Group'),
            'The error should explain the required deactivation order.'
        );

        assignment.Active__c = false;
        update assignment;
        update bank;
        System.assertEquals(
            false,
            [SELECT Active__c FROM Bank__c WHERE Id = :bank.Id].Active__c,
            'A Bank with no active assignments may be deactivated.'
        );
    }

    @IsTest
    static void testHandlerRejectsBlankName() {
        Bank__c bank = new Bank__c(Name = ' ');

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BankTriggerHandler.run(
                System.TriggerOperation.BEFORE_INSERT,
                new List<Bank__c>{ bank },
                null
            );
        }
        Test.stopTest();

        System.assertEquals(true, bank.hasErrors(), 'A blank Bank name should fail.');
        System.assertEquals(
            'Bank Name is required.',
            bank.getErrors()[0].getMessage(),
            'The handler should report the missing name.'
        );
    }
}
