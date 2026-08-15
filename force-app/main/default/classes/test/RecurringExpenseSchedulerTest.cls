@IsTest
private class RecurringExpenseSchedulerTest {
    @IsTest
    static void testScheduledRunStartsBatch() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date dueDate = Date.today();
            Recurring_Expense__c recurringExpense = createDueRecurringExpense(dueDate);

            Test.startTest();
            new RecurringExpenseScheduler().execute(null);
            Test.stopTest();

            List<Expense__c> generatedExpenses = [
                SELECT Name, Expense_Date__c, Recurring_Expense__c
                FROM Expense__c
                WHERE Recurring_Expense__c = :recurringExpense.Id
            ];
            System.assertEquals(
                1,
                generatedExpenses.size(),
                'The scheduled batch should create one due expense'
            );
            System.assertEquals(
                'Gym',
                generatedExpenses[0].Name,
                'The scheduled batch should preserve the recurring expense name.'
            );
            System.assertEquals(
                dueDate,
                generatedExpenses[0].Expense_Date__c,
                'The scheduled batch should generate the expense for its due date.'
            );

            Recurring_Expense__c updatedRecurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                dueDate.addMonths(1),
                updatedRecurringExpense.Next_Run_Date__c,
                'The scheduled batch should advance the recurring template.'
            );
        }
    }

    @IsTest
    static void testScheduledRunSkipsWhenDisabled() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date dueDate = Date.today();
            createDueRecurringExpense(dueDate);

            BudgetExpenseSettingsService.SettingsUpdateRequest settingsRequest = new BudgetExpenseSettingsService.SettingsUpdateRequest();
            settingsRequest.recurringExpensesEnabled = 'false';
            settingsRequest.globalRecurringRunTime = '08:00';
            BudgetExpenseSettingsService.saveSettings(settingsRequest);

            Test.startTest();
            new RecurringExpenseScheduler().execute(null);
            Test.stopTest();

            System.assertEquals(
                0,
                [SELECT COUNT() FROM Expense__c],
                'No expenses should generate when disabled'
            );

            Budget_Expense_Manager_Setting__c settings = [
                SELECT Last_Recurring_Run_Status__c
                FROM Budget_Expense_Manager_Setting__c
                LIMIT 1
            ];
            System.assertEquals(
                'Skipped',
                settings.Last_Recurring_Run_Status__c,
                'A disabled scheduled run should record a skipped status.'
            );
        }
    }

    private static Recurring_Expense__c createDueRecurringExpense(Date dueDate) {
        Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Health');
        insert expenseGroup;

        Category__c category = new Category__c(
            Name = 'Fitness',
            Expense_Group__c = expenseGroup.Id
        );
        insert category;

        Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
            Name = 'Gym',
            Active__c = true,
            Amount__c = 1500,
            Category__c = category.Id,
            Frequency__c = 'Monthly',
            Next_Run_Date__c = dueDate,
            Start_Date__c = dueDate
        );
        insert recurringExpense;
        return recurringExpense;
    }
}
