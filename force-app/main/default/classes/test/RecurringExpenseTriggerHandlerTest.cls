@IsTest
private class RecurringExpenseTriggerHandlerTest {
    @TestSetup
    static void setupData() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Health');
            insert expenseGroup;

            insert new Category__c(Name = 'Fitness', Expense_Group__c = expenseGroup.Id);
        }
    }

    @IsTest
    static void testTriggerDelegatesBeforeInsert() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getFitnessCategory();
            Date startDate = Date.newInstance(2026, 6, 1);
            Recurring_Expense__c recurringExpense = createRecurringExpense(
                'Gym',
                category.Id,
                startDate
            );

            Test.startTest();
            insert recurringExpense;
            Test.stopTest();

            recurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                startDate,
                recurringExpense.Next_Run_Date__c,
                'The trigger should delegate insert defaulting to its handler.'
            );
        }
    }

    @IsTest
    static void testBeforeInsertDefaultsBulkRecordsWithoutOverwritingExplicitValues() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date firstStartDate = Date.newInstance(2026, 6, 1);
            Date secondStartDate = Date.newInstance(2026, 6, 15);
            Date explicitNextRunDate = Date.newInstance(2026, 7, 15);
            Recurring_Expense__c supplements = new Recurring_Expense__c(
                Start_Date__c = secondStartDate,
                Next_Run_Date__c = explicitNextRunDate
            );
            List<Recurring_Expense__c> recurringExpenses = new List<Recurring_Expense__c>{
                new Recurring_Expense__c(Start_Date__c = firstStartDate),
                supplements
            };

            Test.startTest();
            RecurringExpenseTriggerHandler.run(
                System.TriggerOperation.BEFORE_INSERT,
                recurringExpenses,
                null
            );
            Test.stopTest();

            System.assertEquals(
                firstStartDate,
                recurringExpenses[0].Next_Run_Date__c,
                'The handler should default a missing next run date from the start date.'
            );
            System.assertEquals(
                explicitNextRunDate,
                recurringExpenses[1].Next_Run_Date__c,
                'The handler should preserve an explicitly supplied next run date.'
            );
        }
    }

    @IsTest
    static void testTriggerDelegatesBeforeUpdate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getFitnessCategory();
            Recurring_Expense__c recurringExpense = createRecurringExpense(
                'Gym',
                category.Id,
                Date.newInstance(2026, 6, 1)
            );
            insert recurringExpense;

            recurringExpense = [
                SELECT Start_Date__c, Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            Date updatedStartDate = Date.newInstance(2026, 7, 1);
            recurringExpense.Start_Date__c = updatedStartDate;

            Test.startTest();
            update recurringExpense;
            Test.stopTest();

            recurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                updatedStartDate,
                recurringExpense.Next_Run_Date__c,
                'The trigger should delegate update realignment to its handler.'
            );
        }
    }

    @IsTest
    static void testBeforeUpdatePreservesAdvancedNextRunDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getFitnessCategory();
            Date originalStartDate = Date.newInstance(2026, 6, 1);
            Date advancedNextRunDate = Date.newInstance(2026, 7, 1);
            Recurring_Expense__c recurringExpense = createRecurringExpense(
                'Gym',
                category.Id,
                originalStartDate
            );
            recurringExpense.Next_Run_Date__c = advancedNextRunDate;
            insert recurringExpense;

            Recurring_Expense__c oldRecurringExpense = [
                SELECT Id, Bank_Assignment__c, Start_Date__c, Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            Recurring_Expense__c updatedRecurringExpense = oldRecurringExpense.clone(
                true,
                true,
                false,
                false
            );
            updatedRecurringExpense.Start_Date__c = Date.newInstance(2026, 5, 1);

            Test.startTest();
            RecurringExpenseTriggerHandler.run(
                System.TriggerOperation.BEFORE_UPDATE,
                new List<Recurring_Expense__c>{ updatedRecurringExpense },
                new Map<Id, Recurring_Expense__c>{ oldRecurringExpense.Id => oldRecurringExpense }
            );
            Test.stopTest();

            System.assertEquals(
                advancedNextRunDate,
                updatedRecurringExpense.Next_Run_Date__c,
                'The handler should preserve an advanced next run date.'
            );
        }
    }

    @IsTest
    static void testBeforeUpdateBulkRealignsOnlyRecordsTrackingStartDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getFitnessCategory();
            Date originalStartDate = Date.newInstance(2026, 6, 1);
            Date advancedNextRunDate = Date.newInstance(2026, 7, 1);
            Recurring_Expense__c supplements = createRecurringExpense(
                'Supplements',
                category.Id,
                originalStartDate
            );
            supplements.Next_Run_Date__c = advancedNextRunDate;
            insert new List<Recurring_Expense__c>{
                createRecurringExpense('Gym', category.Id, originalStartDate),
                supplements
            };

            List<Recurring_Expense__c> oldRecurringExpenses = [
                SELECT Id, Name, Bank_Assignment__c, Start_Date__c, Next_Run_Date__c
                FROM Recurring_Expense__c
                ORDER BY Name
            ];
            Map<Id, Recurring_Expense__c> oldRecurringExpensesById = new Map<Id, Recurring_Expense__c>(
                oldRecurringExpenses
            );
            List<Recurring_Expense__c> updatedRecurringExpenses = oldRecurringExpenses.deepClone(
                true,
                true,
                false
            );
            Date updatedStartDate = Date.newInstance(2026, 5, 1);
            for (Recurring_Expense__c recurringExpense : updatedRecurringExpenses) {
                recurringExpense.Start_Date__c = updatedStartDate;
            }

            Test.startTest();
            RecurringExpenseTriggerHandler.run(
                System.TriggerOperation.BEFORE_UPDATE,
                updatedRecurringExpenses,
                oldRecurringExpensesById
            );
            Test.stopTest();

            Map<String, Recurring_Expense__c> updatedRecurringExpensesByName = new Map<String, Recurring_Expense__c>();
            for (Recurring_Expense__c recurringExpense : updatedRecurringExpenses) {
                updatedRecurringExpensesByName.put(recurringExpense.Name, recurringExpense);
            }
            System.assertEquals(
                updatedStartDate,
                updatedRecurringExpensesByName.get('Gym').Next_Run_Date__c,
                'A template still tracking its start date should be realigned.'
            );
            System.assertEquals(
                advancedNextRunDate,
                updatedRecurringExpensesByName.get('Supplements').Next_Run_Date__c,
                'A template with an advanced next run date should not be realigned.'
            );
        }
    }

    private static Category__c getFitnessCategory() {
        return [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
    }

    private static Recurring_Expense__c createRecurringExpense(
        String name,
        Id categoryId,
        Date startDate
    ) {
        return new Recurring_Expense__c(
            Name = name,
            Active__c = true,
            Amount__c = 2850,
            Category__c = categoryId,
            Frequency__c = 'Monthly',
            Start_Date__c = startDate
        );
    }
}
