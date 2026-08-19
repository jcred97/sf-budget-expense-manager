@IsTest
private class ExpenseGroupBankTriggerHandlerTest {
    @TestSetup
    static void setupData() {
        insert new List<Expense_Group__c>{
            new Expense_Group__c(Name = 'Household'),
            new Expense_Group__c(Name = 'Travel')
        };
        insert new List<Bank__c>{
            new Bank__c(Name = 'BPI', Active__c = true),
            new Bank__c(Name = 'BDO', Active__c = true),
            new Bank__c(Name = 'Closed Bank', Active__c = false)
        };
    }

    @IsTest
    static void testTriggerBuildsUniqueAssignmentKey() {
        Expense_Group__c groupRecord = groupByName('Household');
        Bank__c bank = bankByName('BPI');
        Expense_Group_Bank__c assignment = assignment(groupRecord.Id, bank.Id, true);

        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert assignment;
        }
        Test.stopTest();

        assignment = [
            SELECT Expense_Group_Bank_Key__c
            FROM Expense_Group_Bank__c
            WHERE Id = :assignment.Id
        ];
        System.assertEquals(
            String.valueOf(groupRecord.Id) + '-' + String.valueOf(bank.Id),
            assignment.Expense_Group_Bank_Key__c,
            'The trigger should generate the unique group/Bank key.'
        );
    }

    @IsTest
    static void testUniqueKeyRejectsDuplicatePair() {
        Expense_Group__c groupRecord = groupByName('Household');
        Bank__c bank = bankByName('BPI');
        insert assignment(groupRecord.Id, bank.Id, true);

        Database.SaveResult duplicateResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            duplicateResult = Database.insert(assignment(groupRecord.Id, bank.Id, true), false);
        }
        Test.stopTest();

        System.assertEquals(false, duplicateResult.isSuccess(), 'Duplicate pairs should fail.');
        System.assertEquals(
            StatusCode.DUPLICATE_VALUE,
            duplicateResult.getErrors()[0].getStatusCode(),
            'The unique pair key should reject a duplicate atomically.'
        );
    }

    @IsTest
    static void testAssignmentBankIsImmutable() {
        Expense_Group__c household = groupByName('Household');
        Bank__c bpi = bankByName('BPI');
        Bank__c bdo = bankByName('BDO');
        Expense_Group_Bank__c assignmentRecord = assignment(household.Id, bpi.Id, true);
        insert assignmentRecord;

        assignmentRecord.Bank__c = bdo.Id;
        Database.SaveResult updateResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            updateResult = Database.update(assignmentRecord, false);
        }
        Test.stopTest();

        System.assertEquals(
            false,
            updateResult.isSuccess(),
            'The assigned Bank must be immutable.'
        );
        System.assert(
            updateResult.getErrors()[0].getMessage().contains('cannot be changed'),
            'The error should require a replacement assignment.'
        );
    }

    @IsTest
    static void testActiveAssignmentRequiresActiveGlobalBank() {
        Expense_Group__c groupRecord = groupByName('Household');
        Bank__c bank = bankByName('Closed Bank');

        Database.SaveResult insertResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insertResult = Database.insert(assignment(groupRecord.Id, bank.Id, true), false);
        }
        Test.stopTest();

        System.assertEquals(false, insertResult.isSuccess(), 'Inactive Banks cannot be assigned.');
        System.assert(
            insertResult.getErrors()[0].getMessage().contains('active global Bank'),
            'The error should explain the active Bank requirement.'
        );
    }

    @IsTest
    static void testDeactivationBlockedUntilRecurringTemplateInactive() {
        Expense_Group__c groupRecord = groupByName('Household');
        Bank__c bank = bankByName('BPI');
        Category__c category = new Category__c(
            Name = 'Home Bills',
            Expense_Group__c = groupRecord.Id
        );
        insert category;
        Expense_Group_Bank__c assignmentRecord = assignment(groupRecord.Id, bank.Id, true);
        insert assignmentRecord;
        Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
            Name = 'Internet',
            Active__c = true,
            Amount__c = 1000,
            Bank_Assignment__c = assignmentRecord.Id,
            Category__c = category.Id,
            Frequency__c = 'Monthly',
            Start_Date__c = Date.today()
        );
        insert recurringExpense;

        assignmentRecord.Active__c = false;
        Database.SaveResult blockedResult;
        Test.startTest();
        System.runAs(new User(Id = UserInfo.getUserId())) {
            blockedResult = Database.update(assignmentRecord, false);
        }
        Test.stopTest();

        System.assertEquals(false, blockedResult.isSuccess(), 'Active templates should block.');
        System.assert(
            blockedResult.getErrors()[0].getMessage().contains('active recurring expenses'),
            'The error should explain how to release the assignment.'
        );

        recurringExpense.Active__c = false;
        update recurringExpense;
        update assignmentRecord;
        System.assertEquals(
            false,
            [SELECT Active__c FROM Expense_Group_Bank__c WHERE Id = :assignmentRecord.Id].Active__c,
            'The assignment may be deactivated after its active template is disabled.'
        );
    }

    private static Expense_Group_Bank__c assignment(Id groupId, Id bankId, Boolean active) {
        return new Expense_Group_Bank__c(
            Expense_Group__c = groupId,
            Bank__c = bankId,
            Active__c = active
        );
    }

    private static Expense_Group__c groupByName(String name) {
        return [SELECT Id FROM Expense_Group__c WHERE Name = :name LIMIT 1];
    }

    private static Bank__c bankByName(String name) {
        return [SELECT Id FROM Bank__c WHERE Name = :name LIMIT 1];
    }
}
