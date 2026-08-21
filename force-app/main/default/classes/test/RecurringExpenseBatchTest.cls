@IsTest
private class RecurringExpenseBatchTest {
    @IsTest
    static void testBatchProcessesMoreThanManualRunCap() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Health');
            insert expenseGroup;

            Category__c category = new Category__c(
                Name = 'Fitness',
                Expense_Group__c = expenseGroup.Id
            );
            insert category;

            Bank__c bank = new Bank__c(Name = 'BPI', Active__c = true);
            insert bank;
            Expense_Group_Bank__c bankAssignment = new Expense_Group_Bank__c(
                Expense_Group__c = expenseGroup.Id,
                Bank__c = bank.Id,
                Active__c = true
            );
            insert bankAssignment;

            Date dueDate = Date.newInstance(2026, 5, 1);
            List<Recurring_Expense__c> recurringExpenses = new List<Recurring_Expense__c>();
            for (Integer index = 0; index < 250; index++) {
                recurringExpenses.add(
                    new Recurring_Expense__c(
                        Name = 'Gym ' + index,
                        Active__c = true,
                        Amount__c = 1500,
                        Bank_Assignment__c = bankAssignment.Id,
                        Category__c = category.Id,
                        Frequency__c = 'Monthly',
                        Next_Run_Date__c = dueDate,
                        Start_Date__c = dueDate
                    )
                );
            }
            insert recurringExpenses;

            Test.startTest();
            Database.executeBatch(new RecurringExpenseBatch(Date.newInstance(2026, 5, 17)), 250);
            Test.stopTest();

            Date expectedNextRunDate = Date.newInstance(2026, 6, 1);
            System.assertEquals(
                250,
                [SELECT COUNT() FROM Expense__c],
                'All due recurring expenses should generate'
            );
            System.assertEquals(
                250,
                [SELECT COUNT() FROM Expense__c WHERE Bank_Assignment__c = :bankAssignment.Id],
                'Every generated expense should retain the record-based Bank assignment.'
            );
            System.assertEquals(
                250,
                [
                    SELECT COUNT()
                    FROM Recurring_Expense__c
                    WHERE Next_Run_Date__c = :expectedNextRunDate
                ],
                'Every processed template should advance to the next monthly run date'
            );

            Budget_Expense_Manager_Setting__c settings = [
                SELECT Last_Recurring_Run_Status__c, Last_Recurring_Run_Message__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];
            System.assertEquals(
                'Completed',
                settings.Last_Recurring_Run_Status__c,
                'Batch completion should update the recurring run status.'
            );
            System.assert(
                settings.Last_Recurring_Run_Message__c.contains('Created 250 expenses'),
                'Batch finish should record the generated expense count'
            );
        }
    }

    @IsTest
    static void testDefaultConstructorRunsForToday() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            Id jobId = Database.executeBatch(new RecurringExpenseBatch(), 1);
            Test.stopTest();

            System.assertNotEquals(
                null,
                jobId,
                'The default constructor should create an executable batch for today.'
            );
        }
    }

    @IsTest
    static void testBatchSkipsAlreadyEndedPointer() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Ended Group');
            insert expenseGroup;
            Category__c category = new Category__c(
                Name = 'Ended Category',
                Expense_Group__c = expenseGroup.Id
            );
            insert category;

            Date endDate = Date.newInstance(2026, 5, 1);
            Date endedPointer = Date.newInstance(2026, 5, 2);
            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Ended Batch Template',
                Active__c = true,
                Amount__c = 750,
                Category__c = category.Id,
                End_Date__c = endDate,
                Frequency__c = 'Daily',
                Next_Run_Date__c = endedPointer,
                Start_Date__c = endDate
            );
            insert recurringExpense;

            Test.startTest();
            Database.executeBatch(new RecurringExpenseBatch(Date.newInstance(2026, 5, 3)), 1);
            Test.stopTest();

            System.assertEquals(
                0,
                [SELECT COUNT() FROM Expense__c WHERE Recurring_Expense__c = :recurringExpense.Id],
                'The batch should not generate from an already-ended pointer.'
            );
            System.assertEquals(
                endedPointer,
                [
                    SELECT Next_Run_Date__c
                    FROM Recurring_Expense__c
                    WHERE Id = :recurringExpense.Id
                ]
                .Next_Run_Date__c,
                'The batch should leave an already-ended pointer unchanged.'
            );
            Budget_Expense_Manager_Setting__c settings = [
                SELECT Last_Recurring_Run_Status__c, Last_Recurring_Run_Message__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];
            System.assertEquals(
                'Completed',
                settings.Last_Recurring_Run_Status__c,
                'A batch containing only ended pointers should still complete.'
            );
            System.assertEquals(
                'No recurring expenses were due.',
                settings.Last_Recurring_Run_Message__c,
                'Ended pointers should not count as processed recurring templates.'
            );
        }
    }

    @IsTest
    static void testConstructorRejectsNullRunDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Boolean exceptionThrown = false;

            try {
                RecurringExpenseBatch unexpectedBatch = new RecurringExpenseBatch(null);
                System.assertEquals(
                    null,
                    unexpectedBatch,
                    'A null run date should not create a batch.'
                );
            } catch (AuraHandledException e) {
                exceptionThrown = true;
            }

            System.assert(exceptionThrown, 'The batch constructor should reject a null run date.');
        }
    }
}
