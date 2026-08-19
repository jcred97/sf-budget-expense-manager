@IsTest
private class RecurringExpenseServiceTest {
    @TestSetup
    static void setupData() {
        Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Health');
        insert expenseGroup;

        Category__c category = new Category__c(
            Name = 'Fitness',
            Expense_Group__c = expenseGroup.Id
        );
        insert category;

        Bank__c bank = new Bank__c(Name = 'BPI', Active__c = true);
        insert bank;
        insert new Expense_Group_Bank__c(
            Expense_Group__c = expenseGroup.Id,
            Bank__c = bank.Id,
            Active__c = true
        );
    }

    @IsTest
    static void testGenerateDueExpensesCatchesUpMonthlyExpenses() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Expense_Group_Bank__c bankAssignment = [
                SELECT Id
                FROM Expense_Group_Bank__c
                WHERE Bank__r.Name = 'BPI'
                LIMIT 1
            ];
            Date firstDueDate = Date.newInstance(2026, 3, 1);
            Date runDate = Date.newInstance(2026, 5, 16);

            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Gym',
                Active__c = true,
                Amount__c = 1500,
                Bank__c = 'BPI',
                Bank_Assignment__c = bankAssignment.Id,
                Category__c = category.Id,
                Description__c = 'Monthly gym membership',
                Frequency__c = 'Monthly',
                Next_Run_Date__c = firstDueDate,
                Start_Date__c = firstDueDate,
                Transaction_Type__c = 'Debit Card'
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseService.GenerationResult result = RecurringExpenseService.generateDueExpenses(
                runDate
            );
            Test.stopTest();

            System.assertEquals(
                1,
                result.recurringExpensesProcessed,
                'One recurring expense should be processed'
            );
            System.assertEquals(
                3,
                result.expensesCreated,
                'March, April, and May expenses should be created'
            );
            System.assertEquals(
                false,
                result.hitGenerationLimit,
                'The generation cap should not be hit'
            );

            List<Expense__c> generatedExpenses = [
                SELECT
                    Name,
                    Amount__c,
                    Bank__c,
                    Bank_Assignment__c,
                    Category__c,
                    Description__c,
                    Expense_Date__c,
                    Recurring_Expense__c,
                    Transaction_Time__c,
                    Transaction_Type__c
                FROM Expense__c
                WHERE Recurring_Expense__c = :recurringExpense.Id
                ORDER BY Expense_Date__c ASC
            ];

            System.assertEquals(
                3,
                generatedExpenses.size(),
                'Three generated expenses should be linked to the template'
            );
            System.assertEquals(
                Date.newInstance(2026, 3, 1),
                generatedExpenses[0].Expense_Date__c,
                'The first generated expense should use the March due date.'
            );
            System.assertEquals(
                Date.newInstance(2026, 4, 1),
                generatedExpenses[1].Expense_Date__c,
                'The second generated expense should use the April due date.'
            );
            System.assertEquals(
                Date.newInstance(2026, 5, 1),
                generatedExpenses[2].Expense_Date__c,
                'The third generated expense should use the May due date.'
            );
            System.assertEquals(
                'Gym',
                generatedExpenses[0].Name,
                'Generated expenses should copy the recurring template name.'
            );
            System.assertEquals(
                1500,
                generatedExpenses[0].Amount__c,
                'Generated expenses should copy the recurring amount.'
            );
            System.assertEquals(
                'BPI',
                generatedExpenses[0].Bank__c,
                'Generated expenses should copy the recurring bank.'
            );
            System.assertEquals(
                bankAssignment.Id,
                generatedExpenses[0].Bank_Assignment__c,
                'Generated expenses should copy the record-based Bank assignment.'
            );
            System.assertNotEquals(
                null,
                generatedExpenses[0].Transaction_Time__c,
                'Generated expenses should record the generation time.'
            );
            System.assertEquals(
                'Debit Card',
                generatedExpenses[0].Transaction_Type__c,
                'Generated expenses should copy the transaction type.'
            );

            Recurring_Expense__c updatedRecurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                Date.newInstance(2026, 6, 1),
                updatedRecurringExpense.Next_Run_Date__c,
                'Catch-up generation should advance the template to June.'
            );
        }
    }

    @IsTest
    static void testGenerateDueExpensesRespectsEndDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date firstDueDate = Date.newInstance(2026, 1, 1);

            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Limited Gym',
                Active__c = true,
                Amount__c = 1200,
                Category__c = category.Id,
                End_Date__c = Date.newInstance(2026, 1, 31),
                Frequency__c = 'Monthly',
                Next_Run_Date__c = firstDueDate,
                Start_Date__c = firstDueDate
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseService.GenerationResult result = RecurringExpenseService.generateDueExpenses(
                Date.newInstance(2026, 3, 1)
            );
            Test.stopTest();

            System.assertEquals(
                1,
                result.expensesCreated,
                'Only the January occurrence is within the end date'
            );

            Recurring_Expense__c updatedRecurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                Date.newInstance(2026, 2, 1),
                updatedRecurringExpense.Next_Run_Date__c,
                'Generation should stop at the first occurrence after the end date.'
            );
        }
    }

    @IsTest
    static void testGenerateDueExpensesMonthlyUsesStartDateAnchorDay() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date firstDueDate = Date.newInstance(2026, 1, 30);

            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Month End Gym',
                Active__c = true,
                Amount__c = 1500,
                Category__c = category.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = firstDueDate,
                Start_Date__c = firstDueDate
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseService.GenerationResult result = RecurringExpenseService.generateDueExpenses(
                Date.newInstance(2026, 3, 30)
            );
            Test.stopTest();

            System.assertEquals(
                3,
                result.expensesCreated,
                'January, February, and March should be generated'
            );

            List<Expense__c> generatedExpenses = [
                SELECT Expense_Date__c
                FROM Expense__c
                WHERE Recurring_Expense__c = :recurringExpense.Id
                ORDER BY Expense_Date__c ASC
            ];

            System.assertEquals(
                Date.newInstance(2026, 1, 30),
                generatedExpenses[0].Expense_Date__c,
                'The first anchored occurrence should use January 30.'
            );
            System.assertEquals(
                Date.newInstance(2026, 2, 28),
                generatedExpenses[1].Expense_Date__c,
                'February should use its final day when day 30 is unavailable.'
            );
            System.assertEquals(
                Date.newInstance(2026, 3, 30),
                generatedExpenses[2].Expense_Date__c,
                'The monthly recurrence should return to day 30 in March.'
            );

            Recurring_Expense__c updatedRecurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                Date.newInstance(2026, 4, 30),
                updatedRecurringExpense.Next_Run_Date__c,
                'The anchored template should advance to April 30.'
            );
        }
    }

    @IsTest
    static void testGenerateDueExpensesContinuesFromNextRunDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];

            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Existing Gym',
                Active__c = true,
                Amount__c = 1500,
                Category__c = category.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = Date.newInstance(2026, 6, 1),
                Start_Date__c = Date.newInstance(2026, 1, 1)
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseService.GenerationResult result = RecurringExpenseService.generateDueExpenses(
                Date.newInstance(2026, 7, 16)
            );
            Test.stopTest();

            System.assertEquals(
                2,
                result.expensesCreated,
                'June and July should be generated after the last generated date'
            );

            List<Expense__c> generatedExpenses = [
                SELECT Expense_Date__c
                FROM Expense__c
                WHERE Recurring_Expense__c = :recurringExpense.Id
                ORDER BY Expense_Date__c ASC
            ];
            System.assertEquals(
                Date.newInstance(2026, 6, 1),
                generatedExpenses[0].Expense_Date__c,
                'Generation should continue from the stored June pointer.'
            );
            System.assertEquals(
                Date.newInstance(2026, 7, 1),
                generatedExpenses[1].Expense_Date__c,
                'Generation should include the next July occurrence.'
            );

            Recurring_Expense__c updatedRecurringExpense = [
                SELECT Next_Run_Date__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                Date.newInstance(2026, 8, 1),
                updatedRecurringExpense.Next_Run_Date__c,
                'Generation should advance the stored pointer to August.'
            );
        }
    }

    @IsTest
    static void testGenerateDueExpensesIgnoresInactiveAndFutureRecords() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date runDate = Date.newInstance(2026, 5, 16);

            insert new List<Recurring_Expense__c>{
                new Recurring_Expense__c(
                    Name = 'Inactive Gym',
                    Active__c = false,
                    Amount__c = 1500,
                    Category__c = category.Id,
                    Frequency__c = 'Monthly',
                    Next_Run_Date__c = Date.newInstance(2026, 5, 1),
                    Start_Date__c = Date.newInstance(2026, 5, 1)
                ),
                new Recurring_Expense__c(
                    Name = 'Future Gym',
                    Active__c = true,
                    Amount__c = 1500,
                    Category__c = category.Id,
                    Frequency__c = 'Monthly',
                    Next_Run_Date__c = Date.newInstance(2026, 6, 1),
                    Start_Date__c = Date.newInstance(2026, 6, 1)
                )
            };

            Test.startTest();
            RecurringExpenseService.GenerationResult result = RecurringExpenseService.generateDueExpenses(
                runDate
            );
            Test.stopTest();

            System.assertEquals(0, result.expensesCreated, 'No expenses should be generated');
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Expense__c],
                'No expense records should be inserted'
            );
        }
    }

    @IsTest
    static void testGenerateDueExpensesCopiesLookupOnlyBank() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [
                SELECT Id, Expense_Group__c
                FROM Category__c
                WHERE Name = 'Fitness'
                LIMIT 1
            ];
            Bank__c bank = new Bank__c(Name = 'Digital Bank', Active__c = true);
            insert bank;
            Expense_Group_Bank__c assignment = new Expense_Group_Bank__c(
                Expense_Group__c = category.Expense_Group__c,
                Bank__c = bank.Id,
                Active__c = true
            );
            insert assignment;
            Date dueDate = Date.newInstance(2026, 5, 1);
            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Digital Subscription',
                Active__c = true,
                Amount__c = 500,
                Bank_Assignment__c = assignment.Id,
                Category__c = category.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = dueDate,
                Start_Date__c = dueDate
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseService.generateDueExpenses(dueDate);
            Test.stopTest();

            Expense__c generatedExpense = [
                SELECT Bank__c, Bank_Assignment__c
                FROM Expense__c
                WHERE Recurring_Expense__c = :recurringExpense.Id
                LIMIT 1
            ];
            System.assertEquals(
                assignment.Id,
                generatedExpense.Bank_Assignment__c,
                'A Bank outside the legacy value set should copy through the lookup.'
            );
            System.assertEquals(
                null,
                generatedExpense.Bank__c,
                'Generation must not derive an invalid legacy picklist from the Bank name.'
            );
        }
    }

    @IsTest
    static void testRunDueExpensesBatchStartsBatch() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date dueDate = Date.today();

            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Manual Gym',
                Active__c = true,
                Amount__c = 1500,
                Category__c = category.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = dueDate,
                Start_Date__c = dueDate
            );
            insert recurringExpense;

            Id jobId;
            Test.startTest();
            jobId = RecurringExpenseService.runDueExpensesBatch();
            Test.stopTest();

            System.assertNotEquals(null, jobId, 'The manual run should return the batch job id');
            System.assertEquals(
                1,
                [
                    SELECT COUNT()
                    FROM Expense__c
                    WHERE Recurring_Expense__c = :recurringExpense.Id
                ],
                'The manual batch run should generate the due expense'
            );
        }
    }

    @IsTest
    static void testRunDueExpensesBatchRespectsDisabledSetting() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            BudgetExpenseSettingsService.SettingsUpdateRequest settingsRequest = new BudgetExpenseSettingsService.SettingsUpdateRequest();
            settingsRequest.recurringExpensesEnabled = 'false';
            settingsRequest.globalRecurringRunTime = '08:00';
            BudgetExpenseSettingsService.saveSettings(settingsRequest);

            Boolean exceptionThrown = false;
            try {
                Test.startTest();
                RecurringExpenseService.runDueExpensesBatch();
                Test.stopTest();
            } catch (AuraHandledException e) {
                exceptionThrown = true;
            }

            System.assertEquals(
                true,
                exceptionThrown,
                'Manual generation should be blocked when disabled'
            );
        }
    }

    @IsTest
    static void testGenerateDueExpensesRequiresRunDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Boolean exceptionThrown = false;

            try {
                Test.startTest();
                RecurringExpenseService.generateDueExpenses(null);
                Test.stopTest();
            } catch (AuraHandledException e) {
                exceptionThrown = true;
            }

            System.assertEquals(
                true,
                exceptionThrown,
                'A null run date should throw a handled exception'
            );
        }
    }
}
