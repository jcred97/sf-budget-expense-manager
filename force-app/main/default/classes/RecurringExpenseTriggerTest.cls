@IsTest
private class RecurringExpenseTriggerTest {
    @testSetup
    static void setupData() {
        Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Health');
        insert expenseGroup;

        Category__c category = new Category__c(
            Name = 'Fitness',
            Expense_Group__c = expenseGroup.Id
        );
        insert category;
    }

    @IsTest
    static void testInsertDefaultsNextRunDateFromStartDate() {
        Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
        Date startDate = Date.newInstance(2026, 6, 1);

        Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
            Name = 'Gym',
            Active__c = true,
            Amount__c = 2850,
            Category__c = category.Id,
            Frequency__c = 'Monthly',
            Start_Date__c = startDate
        );

        Test.startTest();
        insert recurringExpense;
        Test.stopTest();

        Recurring_Expense__c insertedRecurringExpense = [
            SELECT Next_Run_Date__c
            FROM Recurring_Expense__c
            WHERE Id = :recurringExpense.Id
        ];
        System.assertEquals(
            startDate,
            insertedRecurringExpense.Next_Run_Date__c,
            'Insert should default the next run date from the start date.'
        );
    }

    @IsTest
    static void testBulkInsertDefaultsNextRunDatesWithoutOverwritingExplicitValues() {
        Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
        Date firstStartDate = Date.newInstance(2026, 6, 1);
        Date secondStartDate = Date.newInstance(2026, 6, 15);
        Date explicitNextRunDate = Date.newInstance(2026, 7, 15);
        Recurring_Expense__c supplements = createRecurringExpense(
            'Supplements',
            category.Id,
            secondStartDate
        );
        supplements.Next_Run_Date__c = explicitNextRunDate;
        List<Recurring_Expense__c> recurringExpenses = new List<Recurring_Expense__c>{
            createRecurringExpense('Gym', category.Id, firstStartDate),
            supplements
        };

        Test.startTest();
        insert recurringExpenses;
        Test.stopTest();

        Set<Id> recurringExpenseIds = new Map<Id, Recurring_Expense__c>(recurringExpenses).keySet();
        Map<String, Recurring_Expense__c> insertedByName = new Map<String, Recurring_Expense__c>();
        for (Recurring_Expense__c recurringExpense : [
            SELECT Name, Next_Run_Date__c
            FROM Recurring_Expense__c
            WHERE Id IN :recurringExpenseIds
        ]) {
            insertedByName.put(recurringExpense.Name, recurringExpense);
        }

        System.assertEquals(
            firstStartDate,
            insertedByName.get('Gym').Next_Run_Date__c,
            'Bulk insert should default a missing next run date from the start date.'
        );
        System.assertEquals(
            explicitNextRunDate,
            insertedByName.get('Supplements').Next_Run_Date__c,
            'Bulk insert should preserve an explicitly supplied next run date.'
        );
    }

    @IsTest
    static void testUpdateKeepsNextRunDateAlignedBeforeGeneration() {
        Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];

        Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
            Name = 'Gym',
            Active__c = true,
            Amount__c = 2850,
            Category__c = category.Id,
            Frequency__c = 'Monthly',
            Start_Date__c = Date.newInstance(2026, 6, 1)
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

        Recurring_Expense__c updatedRecurringExpense = [
            SELECT Next_Run_Date__c
            FROM Recurring_Expense__c
            WHERE Id = :recurringExpense.Id
        ];
        System.assertEquals(
            updatedStartDate,
            updatedRecurringExpense.Next_Run_Date__c,
            'Changing the start date should realign an unadvanced next run date.'
        );
    }

    @IsTest
    static void testUpdateDoesNotMoveAdvancedNextRunDate() {
        Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
        Date nextRunDate = Date.newInstance(2026, 7, 1);

        Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
            Name = 'Gym',
            Active__c = true,
            Amount__c = 2850,
            Category__c = category.Id,
            Frequency__c = 'Monthly',
            Next_Run_Date__c = nextRunDate,
            Start_Date__c = Date.newInstance(2026, 6, 1)
        );
        insert recurringExpense;

        recurringExpense.Start_Date__c = Date.newInstance(2026, 5, 1);

        Test.startTest();
        update recurringExpense;
        Test.stopTest();

        Recurring_Expense__c updatedRecurringExpense = [
            SELECT Next_Run_Date__c
            FROM Recurring_Expense__c
            WHERE Id = :recurringExpense.Id
        ];
        System.assertEquals(
            nextRunDate,
            updatedRecurringExpense.Next_Run_Date__c,
            'Changing the start date should preserve an advanced next run date.'
        );
    }

    @IsTest
    static void testBulkUpdateOnlyRealignsTemplatesStillTrackingStartDate() {
        Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
        Date originalStartDate = Date.newInstance(2026, 6, 1);
        Date advancedNextRunDate = Date.newInstance(2026, 7, 1);
        Recurring_Expense__c supplements = createRecurringExpense(
            'Supplements',
            category.Id,
            originalStartDate
        );
        supplements.Next_Run_Date__c = advancedNextRunDate;
        List<Recurring_Expense__c> recurringExpenses = new List<Recurring_Expense__c>{
            createRecurringExpense('Gym', category.Id, originalStartDate),
            supplements
        };
        insert recurringExpenses;

        Set<Id> recurringExpenseIds = new Map<Id, Recurring_Expense__c>(recurringExpenses).keySet();
        recurringExpenses = [
            SELECT Id, Name, Start_Date__c, Next_Run_Date__c
            FROM Recurring_Expense__c
            WHERE Id IN :recurringExpenseIds
        ];

        Date updatedStartDate = Date.newInstance(2026, 5, 1);
        for (Recurring_Expense__c recurringExpense : recurringExpenses) {
            recurringExpense.Start_Date__c = updatedStartDate;
        }

        Test.startTest();
        update recurringExpenses;
        Test.stopTest();

        Map<String, Recurring_Expense__c> updatedByName = new Map<String, Recurring_Expense__c>();
        for (Recurring_Expense__c recurringExpense : [
            SELECT Name, Next_Run_Date__c
            FROM Recurring_Expense__c
            WHERE Id IN :recurringExpenseIds
        ]) {
            updatedByName.put(recurringExpense.Name, recurringExpense);
        }

        System.assertEquals(
            updatedStartDate,
            updatedByName.get('Gym').Next_Run_Date__c,
            'A template still tracking its start date should be realigned.'
        );
        System.assertEquals(
            advancedNextRunDate,
            updatedByName.get('Supplements').Next_Run_Date__c,
            'A template with an advanced next run date should not be realigned.'
        );
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
