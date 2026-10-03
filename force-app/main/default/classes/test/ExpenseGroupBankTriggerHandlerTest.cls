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
    static void testMixedInsertValidatesOnlyActiveAssignment() {
        Bank__c bank = bankByName('Closed Bank');
        List<Expense_Group_Bank__c> assignments = new List<Expense_Group_Bank__c>{
            assignment(groupByName('Household').Id, bank.Id, true),
            assignment(groupByName('Travel').Id, bank.Id, false)
        };

        Test.startTest();
        Database.SaveResult[] results = Database.insert(assignments, false);
        Test.stopTest();

        System.assertEquals(false, results[0].isSuccess(), 'An active assignment must reject an inactive Bank.');
        System.assert(
            results[0].getErrors()[0].getMessage().contains('active global Bank'),
            'The invalid row should explain the active Bank requirement.'
        );
        System.assertEquals(true, results[1].isSuccess(), 'An inactive assignment to the same Bank must succeed.');
        System.assertEquals(
            false,
            [SELECT Active__c FROM Expense_Group_Bank__c WHERE Id = :assignments[1].Id].Active__c,
            'The valid inactive assignment should be persisted.'
        );
    }

    @IsTest
    static void testMixedUpdateValidatesOnlyReactivatedAssignment() {
        Bank__c bank = bankByName('Closed Bank');
        List<Expense_Group_Bank__c> assignments = new List<Expense_Group_Bank__c>{
            assignment(groupByName('Household').Id, bank.Id, false),
            assignment(groupByName('Travel').Id, bank.Id, false)
        };
        insert assignments;
        assignments[0].Active__c = true;

        Test.startTest();
        Database.SaveResult[] results = Database.update(assignments, false);
        Test.stopTest();

        System.assertEquals(false, results[0].isSuccess(), 'Reactivation must reject an inactive Bank.');
        System.assert(
            results[0].getErrors()[0].getMessage().contains('active global Bank'),
            'The reactivated row should explain the active Bank requirement.'
        );
        System.assertEquals(true, results[1].isSuccess(), 'An unchanged inactive assignment to the same Bank must succeed.');
        Map<Id, Expense_Group_Bank__c> savedAssignments = new Map<Id, Expense_Group_Bank__c>([
            SELECT Id, Active__c FROM Expense_Group_Bank__c WHERE Bank__c = :bank.Id
        ]);
        System.assertEquals(false, savedAssignments.get(assignments[0].Id).Active__c, 'The failed reactivation must remain inactive.');
        System.assertEquals(false, savedAssignments.get(assignments[1].Id).Active__c, 'The unchanged inactive assignment should remain inactive.');
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

    @IsTest
    static void testDisablingMethodsProtectsOnlyAssignmentsWithActiveTemplatesUsingThem() {
        Expense_Group__c household = groupByName('Household');
        Expense_Group__c travel = groupByName('Travel');
        Bank__c bank = bankByName('BPI');
        List<Expense_Group_Bank__c> assignments = new List<Expense_Group_Bank__c>{
            assignment(household.Id, bank.Id, true),
            assignment(travel.Id, bank.Id, true)
        };
        insert assignments;
        List<Category__c> categories = new List<Category__c>{
            new Category__c(Name = 'Bills', Expense_Group__c = household.Id),
            new Category__c(Name = 'Flights', Expense_Group__c = travel.Id)
        };
        insert categories;
        Recurring_Expense__c cardTemplate = new Recurring_Expense__c(
            Name = 'Card subscription', Active__c = true, Amount__c = 100,
            Category__c = categories[0].Id, Bank_Assignment__c = assignments[0].Id,
            Frequency__c = 'Monthly', Start_Date__c = Date.today(), Transaction_Type__c = 'Credit Card'
        );
        Recurring_Expense__c cashTemplate = new Recurring_Expense__c(
            Name = 'Cash subscription', Active__c = true, Amount__c = 100,
            Category__c = categories[1].Id, Bank_Assignment__c = assignments[1].Id,
            Frequency__c = 'Monthly', Start_Date__c = Date.today(), Transaction_Type__c = 'Cash'
        );
        insert new List<Recurring_Expense__c>{ cardTemplate, cashTemplate };
        assignments[0].Supported_Credit_Card__c = false;
        assignments[1].Supported_Credit_Card__c = false;
        Test.startTest();
        Database.SaveResult[] results = Database.update(assignments, false);
        Test.stopTest();
        System.assertEquals(false, results[0].isSuccess(), 'An active card template must block disabling Credit Card.');
        System.assert(results[0].getErrors()[0].getMessage().contains('active recurring expenses'), 'The error should explain how to release the method.');
        System.assertEquals(true, results[1].isSuccess(), 'An active Cash template must not block disabling Credit Card in another group.');
        System.assertEquals(true, [SELECT Supported_Credit_Card__c FROM Expense_Group_Bank__c WHERE Id = :assignments[0].Id].Supported_Credit_Card__c, 'The blocked capability must remain enabled.');
        cardTemplate.Transaction_Type__c = 'Cash';
        update cardTemplate;
        update assignments[0];
        System.assertEquals(false, [SELECT Supported_Credit_Card__c FROM Expense_Group_Bank__c WHERE Id = :assignments[0].Id].Supported_Credit_Card__c, 'Changing the active template method should release the capability.');
    }

    @IsTest
    static void testEachActiveMethodBlocksDisableUntilTemplatesAreInactive() {
        Expense_Group__c household = groupByName('Household');
        Expense_Group_Bank__c bankAssignment = assignment(household.Id, bankByName('BPI').Id, true);
        insert bankAssignment;
        Category__c category = new Category__c(Name = 'Bills', Expense_Group__c = household.Id);
        insert category;
        List<Recurring_Expense__c> templates = new List<Recurring_Expense__c>();
        for (String method : new List<String>{ 'Credit Card', 'Debit Card', 'Bank Payment', 'Bank Transfer' }) {
            templates.add(new Recurring_Expense__c(
                Name = method, Active__c = true, Amount__c = 100, Category__c = category.Id,
                Bank_Assignment__c = bankAssignment.Id, Frequency__c = 'Monthly', Start_Date__c = Date.today(), Transaction_Type__c = method
            ));
        }
        insert templates;
        bankAssignment.Supported_Credit_Card__c = false;
        bankAssignment.Supported_Debit_Card__c = false;
        bankAssignment.Supported_Bank_Payment__c = false;
        bankAssignment.Supported_Bank_Transfer__c = false;
        Test.startTest();
        Database.SaveResult blocked = Database.update(bankAssignment, false);
        System.assertEquals(false, blocked.isSuccess(), 'Active templates using disabled methods must block the change.');
        for (Recurring_Expense__c template : templates) {
            template.Active__c = false;
        }
        update templates;
        update bankAssignment;
        Test.stopTest();
        System.assertEquals(false, [SELECT Supported_Debit_Card__c FROM Expense_Group_Bank__c WHERE Id = :bankAssignment.Id].Supported_Debit_Card__c, 'Inactive templates must not prevent method changes.');
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
