@IsTest
private class RecurringExpenseServiceTest {
    private static Id synchronousCategoryId;
    @IsTest
    static void testSynchronousControllerRespectsDisabledSetting() {
        Recurring_Expense__c template = synchronousTemplate('Disabled', Date.today());
        insert template;
        insert new Budget_Expense_Manager_Setting__c(Name = 'Default', Recurring_Expenses_Enabled__c = false);

        Test.startTest();
        try {
            RecurringExpenseAutomationController.generateDueExpenses();
            System.assert(false, 'Disabled synchronous generation must fail.');
        } catch (AuraHandledException expected) {
            System.assert(expected.getMessage().contains('disabled'), 'Explain why generation is blocked.');
        }
        Test.stopTest();
        System.assertEquals(0, [SELECT COUNT() FROM Expense__c], 'Disabled generation must not create expenses.');
        System.assertEquals(
            Date.today(),
            [SELECT Next_Run_Date__c FROM Recurring_Expense__c WHERE Id = :template.Id].Next_Run_Date__c,
            'Disabled generation must not advance the pointer.'
        );
    }

    @IsTest
    static void testSynchronousCapResumesWithoutReplaying() {
        Date startDate = Date.today().addDays(-200);
        Recurring_Expense__c template = synchronousTemplate('Catch up', startDate);
        insert template;

        Test.startTest();
        RecurringExpenseGenerationResult first = RecurringExpenseAutomationController.generateDueExpenses();
        Date nextDate = [SELECT Next_Run_Date__c FROM Recurring_Expense__c WHERE Id = :template.Id].Next_Run_Date__c;
        RecurringExpenseGenerationResult second = RecurringExpenseAutomationController.generateDueExpenses();
        Test.stopTest();

        System.assertEquals(200, first.expensesCreated, 'Synchronous generation stops after 200 occurrences.');
        System.assertEquals(true, first.hitGenerationLimit, 'Report remaining due work.');
        System.assertEquals(Date.today(), nextDate, 'Keep the first ungenerated occurrence.');
        System.assertEquals(1, second.expensesCreated, 'Resume with only the outstanding occurrence.');
        System.assertEquals(false, second.hitGenerationLimit, 'Catch-up is complete.');
        System.assertEquals(201, [SELECT COUNT() FROM Expense__c], 'No occurrences are replayed.');
        AggregateResult dates = [SELECT COUNT_DISTINCT(Expense_Date__c) uniqueDates FROM Expense__c];
        System.assertEquals(201, dates.get('uniqueDates'), 'Every generated date is unique.');
    }

    @IsTest
    static void testEndedTemplatesDoNotStarveSynchronousGeneration() {
        List<Recurring_Expense__c> templates = new List<Recurring_Expense__c>();
        for (Integer i = 0; i < 200; i++) {
            Recurring_Expense__c ended = synchronousTemplate('Ended ' + i, Date.today().addDays(-2));
            ended.End_Date__c = Date.today().addDays(-2);
            ended.Next_Run_Date__c = Date.today().addDays(-1);
            templates.add(ended);
        }
        templates.add(synchronousTemplate('Due today', Date.today()));
        insert templates;
        Id dueId = templates[200].Id;

        Test.startTest();
        RecurringExpenseGenerationResult result = RecurringExpenseAutomationController.generateDueExpenses();
        Test.stopTest();

        System.assertEquals(1, result.expensesCreated, 'Scan past ended templates to find due work.');
        System.assertEquals(false, result.hitGenerationLimit, 'Ended templates do not consume the cap.');
        System.assertEquals(
            dueId,
            [SELECT Recurring_Expense__c FROM Expense__c LIMIT 1].Recurring_Expense__c,
            'Only the eligible template generates an expense.'
        );
    }

    @IsTest
    static void testSynchronousCapReportsAdditionalTemplates() {
        List<Recurring_Expense__c> templates = new List<Recurring_Expense__c>();
        for (Integer i = 0; i < 201; i++) {
            templates.add(synchronousTemplate('Due ' + i, Date.today()));
        }
        insert templates;
        Test.startTest();
        RecurringExpenseGenerationResult first = RecurringExpenseAutomationController.generateDueExpenses();
        RecurringExpenseGenerationResult second = RecurringExpenseAutomationController.generateDueExpenses();
        Test.stopTest();
        System.assertEquals(200, first.expensesCreated, 'Limit applies across templates.');
        System.assertEquals(true, first.hitGenerationLimit, 'The extra eligible template signals remaining work.');
        System.assertEquals(1, second.expensesCreated, 'The remaining template is processed next time.');
        System.assertEquals(false, second.hitGenerationLimit, 'No more work remains.');
    }

    @IsTest
    static void testBatchOverloadRetainsLargerCap() {
        Recurring_Expense__c template = synchronousTemplate('Batch catch up', Date.today().addDays(-200));
        insert template;
        Test.startTest();
        RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
            new List<Recurring_Expense__c>{ template },
            Date.today()
        );
        Test.stopTest();
        System.assertEquals(201, result.expensesCreated, 'Batch generation is not restricted to the synchronous cap.');
        System.assertEquals(false, result.hitGenerationLimit, 'The batch still has capacity.');
    }

    private static Recurring_Expense__c synchronousTemplate(String name, Date startDate) {
        if (synchronousCategoryId == null) {
            synchronousCategoryId = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1].Id;
        }
        return new Recurring_Expense__c(
            Name = name,
            Active__c = true,
            Amount__c = 10,
            Category__c = synchronousCategoryId,
            Frequency__c = 'Daily',
            Start_Date__c = startDate
        );
    }

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
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
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
    static void testGenerationLimitPersistsPointerAndDoesNotReplayExpenses() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date firstDueDate = Date.newInstance(2026, 5, 1);
            Date runDate = Date.newInstance(2026, 5, 3);
            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Daily Vitamins',
                Active__c = true,
                Amount__c = 100,
                Category__c = category.Id,
                Frequency__c = 'Daily',
                Next_Run_Date__c = firstDueDate,
                Start_Date__c = firstDueDate
            );
            insert recurringExpense;

            RecurringExpenseGenerator.GenerationOptions firstOptions = new RecurringExpenseGenerator.GenerationOptions();
            firstOptions.runDate = runDate;
            firstOptions.maxExpenses = 2;
            firstOptions.generatedTransactionTime = Time.newInstance(8, 0, 0, 0);

            Test.startTest();
            RecurringExpenseGenerationResult firstResult = RecurringExpenseGenerator.generate(
                new List<Recurring_Expense__c>{ recurringExpense },
                firstOptions
            );
            Recurring_Expense__c persistedAfterLimit = [
                SELECT
                    Id,
                    Name,
                    Active__c,
                    Amount__c,
                    Bank__c,
                    Bank_Assignment__c,
                    Category__c,
                    Description__c,
                    End_Date__c,
                    Frequency__c,
                    Next_Run_Date__c,
                    Start_Date__c,
                    Transaction_Type__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            Date pointerAfterLimit = persistedAfterLimit.Next_Run_Date__c;

            RecurringExpenseGenerator.GenerationOptions secondOptions = new RecurringExpenseGenerator.GenerationOptions();
            secondOptions.runDate = runDate;
            secondOptions.maxExpenses = 2;
            secondOptions.generatedTransactionTime = Time.newInstance(9, 0, 0, 0);
            RecurringExpenseGenerationResult secondResult = RecurringExpenseGenerator.generate(
                new List<Recurring_Expense__c>{ persistedAfterLimit },
                secondOptions
            );
            Test.stopTest();

            System.assertEquals(true, firstResult.hitGenerationLimit, 'The first run should cap.');
            System.assertEquals(
                Date.newInstance(2026, 5, 3),
                pointerAfterLimit,
                'The capped run must persist the first ungenerated due date.'
            );
            System.assertEquals(
                false,
                secondResult.hitGenerationLimit,
                'The follow-up run should finish the remaining occurrence.'
            );
            List<Expense__c> generatedExpenses = [
                SELECT Expense_Date__c
                FROM Expense__c
                WHERE Recurring_Expense__c = :recurringExpense.Id
                ORDER BY Expense_Date__c
            ];
            System.assertEquals(
                3,
                generatedExpenses.size(),
                'Each due date should be generated once.'
            );
            System.assertEquals(
                new List<Date>{
                    Date.newInstance(2026, 5, 1),
                    Date.newInstance(2026, 5, 2),
                    Date.newInstance(2026, 5, 3)
                },
                new List<Date>{
                    generatedExpenses[0].Expense_Date__c,
                    generatedExpenses[1].Expense_Date__c,
                    generatedExpenses[2].Expense_Date__c
                },
                'The follow-up run must not replay the first two dates.'
            );
            System.assertEquals(
                Date.newInstance(2026, 5, 4),
                [
                    SELECT Next_Run_Date__c
                    FROM Recurring_Expense__c
                    WHERE Id = :recurringExpense.Id
                ]
                .Next_Run_Date__c,
                'The completed follow-up run should advance past the cutoff.'
            );
        }
    }

    @IsTest
    static void testStaleBatchScopeDoesNotReplayManualGeneration() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Recurring_Expense__c template = createConcurrencyTemplate();
            Date runDate = template.Start_Date__c;
            List<SObject> staleScope = new List<SObject>{
                template.clone(true, true, false, false)
            };

            Test.startTest();
            RecurringExpenseGenerationResult firstRun = RecurringExpenseService.generateDueExpenses(
                runDate
            );
            new RecurringExpenseBatch(runDate).execute(null, staleScope);
            Test.stopTest();

            System.assertEquals(
                1,
                firstRun.expensesCreated,
                'The manual run should generate the occurrence.'
            );
            System.assertEquals(
                1,
                [SELECT COUNT() FROM Expense__c WHERE Recurring_Expense__c = :template.Id],
                'A batch holding the original pointer must not generate the occurrence again.'
            );
            System.assertEquals(
                runDate.addDays(1),
                [SELECT Next_Run_Date__c FROM Recurring_Expense__c WHERE Id = :template.Id]
                .Next_Run_Date__c,
                'The stale run must not advance or rewind the persisted pointer.'
            );
        }

    }
    @IsTest
    static void testReloadUsesCurrentValuesAndDeduplicatesCandidates() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Recurring_Expense__c template = createConcurrencyTemplate();
            update new Recurring_Expense__c(Id = template.Id, Amount__c = 250);

            Test.startTest();
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
                new List<Recurring_Expense__c>{
                    template,
                    template.clone(true, true, false, false)
                },
                template.Start_Date__c
            );
            Test.stopTest();

            System.assertEquals(
                1,
                result.expensesCreated,
                'Repeated IDs should be processed only once.'
            );
            System.assertEquals(
                250,
                [SELECT Amount__c FROM Expense__c WHERE Recurring_Expense__c = :template.Id]
                .Amount__c,
                'Generation must use the persisted amount rather than the stale caller values.'
            );
        }

    }
    @IsTest
    static void testReloadSkipsDeactivatedAndDeletedTemplates() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Recurring_Expense__c inactiveTemplate = createConcurrencyTemplate();
            Recurring_Expense__c deletedTemplate = createConcurrencyTemplate();
            update new Recurring_Expense__c(Id = inactiveTemplate.Id, Active__c = false);
            delete deletedTemplate;

            Test.startTest();
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
                new List<Recurring_Expense__c>{ inactiveTemplate, deletedTemplate },
                inactiveTemplate.Start_Date__c
            );
            Test.stopTest();

            System.assertEquals(
                0,
                result.expensesCreated,
                'Stale eligible templates must be rechecked after locking.'
            );
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Expense__c],
                'No expense should be inserted.'
            );
        }

    }
    private static Recurring_Expense__c createConcurrencyTemplate() {
        Recurring_Expense__c template = new Recurring_Expense__c(
            Name = 'Daily Membership',
            Active__c = true,
            Amount__c = 100,
            Category__c = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1]
            .Id,
            Frequency__c = 'Daily',
            Start_Date__c = Date.newInstance(2026, 5, 1)
        );
        insert template;
        template.Next_Run_Date__c = template.Start_Date__c;
        return template;
    }

    @IsTest
    static void testGenerationUpdatesSystemManagedFieldsForRestrictedUser() {
        User automationUser = createRestrictedAutomationUser();

        System.runAs(automationUser) {
            System.assertEquals(
                false,
                Expense__c.Recurring_Expense__c.getDescribe().isCreateable(),
                'The generated recurring link should remain read-only to the initiating user.'
            );

            Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Automation Group');
            insert expenseGroup;
            Category__c category = new Category__c(
                Name = 'Automation Category',
                Expense_Group__c = expenseGroup.Id
            );
            insert category;

            Date dueDate = Date.newInstance(2026, 7, 1);
            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Automation Subscription',
                Active__c = true,
                Amount__c = 450,
                Category__c = category.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = dueDate,
                Start_Date__c = dueDate
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
                dueDate
            );
            Test.stopTest();

            System.assertEquals(
                1,
                result.expensesCreated,
                'Automation should create the due expense for a restricted user.'
            );
            System.assertEquals(
                dueDate.addMonths(1),
                [
                    SELECT Next_Run_Date__c
                    FROM Recurring_Expense__c
                    WHERE Id = :recurringExpense.Id
                ]
                .Next_Run_Date__c,
                'Automation should advance the system-managed pointer.'
            );
            System.assertEquals(
                1,
                [
                    SELECT COUNT()
                    FROM Expense__c
                    WHERE Recurring_Expense__c = :recurringExpense.Id
                ],
                'Automation should populate the read-only recurring link.'
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
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
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
    static void testGenerateDueExpensesSkipsAlreadyEndedPointer() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date endDate = Date.newInstance(2026, 5, 1);
            Date endedPointer = Date.newInstance(2026, 5, 2);
            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Ended Gym',
                Active__c = true,
                Amount__c = 1200,
                Category__c = category.Id,
                End_Date__c = endDate,
                Frequency__c = 'Daily',
                Next_Run_Date__c = endedPointer,
                Start_Date__c = endDate
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
                Date.newInstance(2026, 5, 3)
            );
            Test.stopTest();

            System.assertEquals(
                0,
                result.recurringExpensesProcessed,
                'An already-ended pointer should be filtered before generation.'
            );
            System.assertEquals(
                0,
                result.expensesCreated,
                'An already-ended pointer must not create an expense.'
            );
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Expense__c WHERE Recurring_Expense__c = :recurringExpense.Id],
                'No generated expense should be linked to the ended template.'
            );
            System.assertEquals(
                endedPointer,
                [
                    SELECT Next_Run_Date__c
                    FROM Recurring_Expense__c
                    WHERE Id = :recurringExpense.Id
                ]
                .Next_Run_Date__c,
                'Skipping the ended pointer should leave its stored pointer unchanged.'
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
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
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
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
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
            RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(
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
    static void testAutomationControllerGeneratesDueExpenses() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Fitness' LIMIT 1];
            Date dueDate = Date.today();
            Recurring_Expense__c recurringExpense = new Recurring_Expense__c(
                Name = 'Controller Gym',
                Active__c = true,
                Amount__c = 1500,
                Category__c = category.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = dueDate,
                Start_Date__c = dueDate
            );
            insert recurringExpense;

            Test.startTest();
            RecurringExpenseGenerationResult result = RecurringExpenseAutomationController.generateDueExpenses();
            Test.stopTest();

            System.assertEquals(
                1,
                result.expensesCreated,
                'The automation controller should return the generated expense count.'
            );
            System.assertEquals(
                1,
                [
                    SELECT COUNT()
                    FROM Expense__c
                    WHERE Recurring_Expense__c = :recurringExpense.Id
                ],
                'The automation controller should delegate synchronous generation.'
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
            jobId = RecurringExpenseAutomationController.runDueExpensesBatch();
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
            BudgetExpenseSettingsUpdateRequest settingsRequest = new BudgetExpenseSettingsUpdateRequest();
            settingsRequest.recurringExpensesEnabled = 'false';
            settingsRequest.globalRecurringRunTime = '08:00';
            SettingsController.saveSettings(settingsRequest);

            Boolean exceptionThrown = false;
            try {
                Test.startTest();
                RecurringExpenseAutomationController.runDueExpensesBatch();
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

    private static User createRestrictedAutomationUser() {
        Id restrictedProfileId = findRestrictedProfileId();
        String uniqueSuffix =
            UserInfo.getOrganizationId() + String.valueOf(DateTime.now().getTime());
        User automationUser = new User(
            Alias = 'recurusr',
            CommunityNickname = 'recurring' + uniqueSuffix.right(8),
            Email = 'recurring.runner@example.test',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US',
            LastName = 'Automation Runner',
            LocaleSidKey = 'en_US',
            ProfileId = restrictedProfileId,
            TimeZoneSidKey = 'Asia/Manila',
            Username = 'recurring.runner.' + uniqueSuffix + '@example.test'
        );
        insert automationUser;

        PermissionSet adminPermissionSet = [
            SELECT Id, NamespacePrefix
            FROM PermissionSet
            WHERE
                Name = 'Budget_Expense_Manager_Admin'
                AND (NamespacePrefix = 'bemgr'
                OR NamespacePrefix = NULL)
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        insert new PermissionSetAssignment(
            AssigneeId = automationUser.Id,
            PermissionSetId = adminPermissionSet.Id
        );
        return automationUser;
    }

    private static Id findRestrictedProfileId() {
        Id runningUserLicenseId = [
            SELECT Profile.UserLicenseId
            FROM User
            WHERE Id = :UserInfo.getUserId()
        ]
        .Profile.UserLicenseId;
        List<Profile> candidateProfiles = [
            SELECT Id
            FROM Profile
            WHERE
                UserLicenseId = :runningUserLicenseId
                AND UserType = 'Standard'
                AND PermissionsModifyAllData = FALSE
            ORDER BY Name
        ];
        Set<Id> candidateProfileIds = new Map<Id, Profile>(candidateProfiles).keySet();
        Map<Id, Id> profileIdByPermissionSetId = new Map<Id, Id>();
        Set<String> generatedLinkFields = new Set<String>{
            'Expense__c.Recurring_Expense__c',
            'bemgr__Expense__c.bemgr__Recurring_Expense__c'
        };

        for (PermissionSet profilePermissionSet : [
            SELECT Id, ProfileId
            FROM PermissionSet
            WHERE IsOwnedByProfile = TRUE AND ProfileId IN :candidateProfileIds
        ]) {
            profileIdByPermissionSetId.put(profilePermissionSet.Id, profilePermissionSet.ProfileId);
        }

        Set<Id> profilesWithGeneratedLinkAccess = new Set<Id>();
        for (FieldPermissions fieldPermission : [
            SELECT ParentId
            FROM FieldPermissions
            WHERE
                ParentId IN :profileIdByPermissionSetId.keySet()
                AND Field IN :generatedLinkFields
                AND PermissionsEdit = TRUE
        ]) {
            profilesWithGeneratedLinkAccess.add(
                profileIdByPermissionSetId.get(fieldPermission.ParentId)
            );
        }

        for (Profile candidateProfile : candidateProfiles) {
            if (!profilesWithGeneratedLinkAccess.contains(candidateProfile.Id)) {
                return candidateProfile.Id;
            }
        }

        System.assert(false, 'A restricted standard profile is required for this test');
        return null;
    }
}
