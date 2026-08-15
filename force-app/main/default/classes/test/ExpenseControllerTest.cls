@IsTest
private class ExpenseControllerTest {
    // ----------------------------
    // Test Data Factory
    // ----------------------------
    @TestSetup
    static void setupData() {
        Expense_Group__c eg1 = new Expense_Group__c(Name = 'Food');
        Expense_Group__c eg2 = new Expense_Group__c(Name = 'Transport');
        insert new List<Expense_Group__c>{ eg1, eg2 };

        // Categories
        Category__c c1 = new Category__c(Name = 'Groceries', Expense_Group__c = eg1.Id);
        Category__c c2 = new Category__c(Name = 'Dining', Expense_Group__c = eg1.Id);
        Category__c c3 = new Category__c(Name = 'Taxi', Expense_Group__c = eg2.Id);
        insert new List<Category__c>{ c1, c2, c3 };

        insert new List<Recurring_Expense__c>{
            new Recurring_Expense__c(
                Name = 'Monthly Groceries',
                Active__c = true,
                Amount__c = 100,
                Category__c = c1.Id,
                Frequency__c = 'Monthly',
                Next_Run_Date__c = Date.today(),
                Start_Date__c = Date.today().addMonths(-1)
            ),
            new Recurring_Expense__c(
                Name = 'Yearly Dining',
                Active__c = true,
                Amount__c = 1200,
                Category__c = c2.Id,
                Frequency__c = 'Yearly',
                Next_Run_Date__c = Date.today().addMonths(1),
                Start_Date__c = Date.today()
            ),
            new Recurring_Expense__c(
                Name = 'Inactive Taxi',
                Active__c = false,
                Amount__c = 50,
                Category__c = c3.Id,
                Frequency__c = 'Weekly',
                Next_Run_Date__c = Date.today(),
                Start_Date__c = Date.today().addDays(-7)
            )
        };

        // Expenses
        List<Expense__c> expenses = new List<Expense__c>{
            new Expense__c(
                Name = 'Expense 1',
                Category__c = c1.Id,
                Expense_Date__c = Date.today().addDays(-5),
                Amount__c = 100
            ),
            new Expense__c(
                Name = 'Expense 2',
                Category__c = c2.Id,
                Expense_Date__c = Date.today().addDays(-2),
                Amount__c = 200
            ),
            new Expense__c(
                Name = 'Expense 3',
                Category__c = c3.Id,
                Expense_Date__c = Date.today(),
                Amount__c = 300
            )
        };
        insert expenses;
    }

    @IsTest
    static void testGetAllExpenseGroups() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            List<Expense_Group__c> result = ExpenseController.getAllExpenseGroups();
            Test.stopTest();

            System.assertEquals(2, result.size(), 'Should return all expense groups');
            System.assertEquals('Food', result[0].Name, 'Expense groups should be ordered by name');
        }
    }

    @IsTest
    static void testGetCategoriesByExpenseGroup() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c food = [SELECT Id FROM Expense_Group__c WHERE Name = 'Food' LIMIT 1];

            Test.startTest();
            List<Category__c> result = ExpenseController.getCategoriesByExpenseGroup(food.Id);
            Test.stopTest();

            System.assertEquals(2, result.size(), 'Food should have 2 categories');
        }
    }

    @IsTest
    static void testGetCategoriesWithoutExpenseGroup() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            List<Category__c> result = ExpenseController.getCategoriesByExpenseGroup(null);
            Test.stopTest();

            System.assertEquals(
                3,
                result.size(),
                'The compatibility path should return all categories'
            );
            System.assertEquals('Dining', result[0].Name, 'Categories should be ordered by name');
            System.assertEquals(
                'Groceries',
                result[1].Name,
                'Categories should be ordered by name'
            );
            System.assertEquals('Taxi', result[2].Name, 'Categories should be ordered by name');
        }
    }

    // getExpensesByFilters() - No filters
    @IsTest
    static void testGetExpensesNoFilters() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = 'All';
            filters.categoryId = 'All';

            Test.startTest();
            List<Expense__c> result = ExpenseController.getExpensesByFilters(filters);
            Test.stopTest();

            System.assertEquals(3, result.size(), 'Should return all expenses');
        }
    }

    // getExpensesByFilters() - Expense Group Filter
    @IsTest
    static void testGetExpensesByExpenseGroup() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c food = [SELECT Id FROM Expense_Group__c WHERE Name = 'Food' LIMIT 1];
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = food.Id;
            filters.categoryId = 'All';

            Test.startTest();
            List<Expense__c> result = ExpenseController.getExpensesByFilters(filters);
            Test.stopTest();

            System.assertEquals(2, result.size(), 'Food expense group should return 2 expenses');
        }
    }

    // getExpensesByFilters() - Category + Date Filter
    @IsTest
    static void testGetExpensesByCategoryAndDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c groceries = [SELECT Id FROM Category__c WHERE Name = 'Groceries' LIMIT 1];

            Date startDate = Date.today().addDays(-10);
            Date endDate = Date.today().addDays(-1);
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = 'All';
            filters.categoryId = groceries.Id;
            filters.startDate = startDate;
            filters.endDate = endDate;

            Test.startTest();
            List<Expense__c> result = ExpenseController.getExpensesByFilters(filters);
            Test.stopTest();

            System.assertEquals(1, result.size(), 'Should return only Groceries expense');
        }
    }

    @IsTest
    static void testGetExpensesOrdersSameDayByTime() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c groceries = [SELECT Id FROM Category__c WHERE Name = 'Groceries' LIMIT 1];
            Date expenseDate = Date.today().addDays(1);

            insert new List<Expense__c>{
                new Expense__c(
                    Name = 'Morning Expense',
                    Category__c = groceries.Id,
                    Expense_Date__c = expenseDate,
                    Transaction_Time__c = Time.newInstance(9, 0, 0, 0),
                    Amount__c = 100
                ),
                new Expense__c(
                    Name = 'Evening Expense',
                    Category__c = groceries.Id,
                    Expense_Date__c = expenseDate,
                    Transaction_Time__c = Time.newInstance(18, 30, 0, 0),
                    Amount__c = 200
                )
            };
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = 'All';
            filters.categoryId = groceries.Id;
            filters.startDate = expenseDate;
            filters.endDate = expenseDate;

            Test.startTest();
            List<Expense__c> result = ExpenseController.getExpensesByFilters(filters);
            Test.stopTest();

            System.assertEquals(
                'Evening Expense',
                result[0].Name,
                'Later same-day expense should sort first'
            );
            System.assertEquals(
                Time.newInstance(18, 30, 0, 0),
                result[0].Transaction_Time__c,
                'The later same-day expense should retain its transaction time.'
            );
        }
    }

    // deleteExpense() - Success
    @IsTest
    static void testDeleteExpenseSuccess() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense__c exp = [SELECT Id FROM Expense__c LIMIT 1];

            Test.startTest();
            ExpenseController.deleteExpense(exp.Id);
            Test.stopTest();

            Integer count = [SELECT COUNT() FROM Expense__c WHERE Id = :exp.Id];

            System.assertEquals(0, count, 'Expense should be deleted');
        }
    }

    // deleteExpense() - Null Id
    @IsTest
    static void testDeleteExpenseNullId() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Boolean exceptionThrown = false;

            try {
                Test.startTest();
                ExpenseController.deleteExpense(null);
                Test.stopTest();
            } catch (Exception e) {
                exceptionThrown = true;
            }

            System.assertEquals(
                true,
                exceptionThrown,
                'Exception should have been thrown for null Id'
            );
        }
    }

    // deleteExpenses() - Success
    @IsTest
    static void testDeleteExpensesSuccess() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            List<Expense__c> expenses = [SELECT Id FROM Expense__c LIMIT 2];
            List<Id> ids = new List<Id>{ expenses[0].Id, expenses[1].Id };

            Test.startTest();
            ExpenseController.deleteExpenses(ids);
            Test.stopTest();

            Integer count = [SELECT COUNT() FROM Expense__c WHERE Id IN :ids];
            System.assertEquals(0, count, 'Both expenses should be deleted');
        }
    }

    // deleteExpenses() - Empty list
    @IsTest
    static void testDeleteExpensesEmptyList() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Boolean exceptionThrown = false;
            try {
                Test.startTest();
                ExpenseController.deleteExpenses(new List<Id>());
                Test.stopTest();
            } catch (Exception e) {
                exceptionThrown = true;
            }
            System.assertEquals(true, exceptionThrown, 'Exception should be thrown for empty list');
        }
    }

    // getMonthlyTrend() - All expense groups
    @IsTest
    static void testGetMonthlyTrendAll() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = 'All';
            filters.categoryId = 'All';

            Test.startTest();
            List<ExpenseController.MonthlyTotal> result = ExpenseController.getMonthlyTrend(
                filters
            );
            Test.stopTest();

            System.assert(result.size() > 0, 'Should return monthly trend data');
        }
    }

    // getMonthlyTrend() - Specific expense group
    @IsTest
    static void testGetMonthlyTrendByExpenseGroup() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c food = [SELECT Id FROM Expense_Group__c WHERE Name = 'Food' LIMIT 1];
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = food.Id;
            filters.categoryId = 'All';

            Test.startTest();
            List<ExpenseController.MonthlyTotal> result = ExpenseController.getMonthlyTrend(
                filters
            );
            Test.stopTest();

            System.assert(result != null, 'Should return trend data for expense group');
        }
    }

    @IsTest
    static void testGetMonthlyTrendByCategoryAndDateRange() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c groceries = [SELECT Id FROM Category__c WHERE Name = 'Groceries' LIMIT 1];
            ExpenseController.ExpenseFilterRequest filters = new ExpenseController.ExpenseFilterRequest();
            filters.expenseGroupId = 'All';
            filters.categoryId = groceries.Id;
            filters.startDate = Date.today().addDays(-10);
            filters.endDate = Date.today().addDays(-1);

            Test.startTest();
            List<ExpenseController.MonthlyTotal> result = ExpenseController.getMonthlyTrend(
                filters
            );
            Test.stopTest();

            System.assertEquals(
                1,
                result.size(),
                'Should return one monthly bucket for the filtered category'
            );
            System.assertEquals(
                100,
                result[0].total,
                'Trend total should match the filtered expense amount'
            );
        }
    }

    @IsTest
    static void testGetRecurringExpenseOverviewAll() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.startTest();
            ExpenseController.RecurringExpenseOverview result = ExpenseController.getRecurringExpenseOverview(
                'All'
            );
            Test.stopTest();

            System.assertEquals(
                3,
                result.rows.size(),
                'Should return all recurring expense templates'
            );
            System.assertEquals(2, result.activeCount, 'Should count active templates only');
            System.assertEquals(1, result.dueTodayCount, 'Should count active templates due today');
            System.assertEquals(
                200,
                result.monthlyTotal,
                'Monthly estimate should normalize monthly and yearly templates'
            );
        }
    }

    @IsTest
    static void testGetRecurringExpenseOverviewByExpenseGroup() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense_Group__c food = [SELECT Id FROM Expense_Group__c WHERE Name = 'Food' LIMIT 1];

            Test.startTest();
            ExpenseController.RecurringExpenseOverview result = ExpenseController.getRecurringExpenseOverview(
                food.Id
            );
            Test.stopTest();

            System.assertEquals(
                2,
                result.rows.size(),
                'Food group should return only related recurring templates'
            );
            System.assertEquals(
                2,
                result.activeCount,
                'Food group active count should match related templates'
            );
        }
    }

    @IsTest
    static void testDeactivateRecurringExpense() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Recurring_Expense__c recurringExpense = [
                SELECT Id, Active__c
                FROM Recurring_Expense__c
                WHERE Name = 'Monthly Groceries'
                LIMIT 1
            ];

            Test.startTest();
            ExpenseController.deactivateRecurringExpense(recurringExpense.Id);
            Test.stopTest();

            recurringExpense = [
                SELECT Active__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpense.Id
            ];
            System.assertEquals(
                false,
                recurringExpense.Active__c,
                'Recurring template should be inactive'
            );
        }
    }

    @IsTest
    static void testDeactivateRecurringExpenseNullId() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Boolean exceptionThrown = false;

            try {
                Test.startTest();
                ExpenseController.deactivateRecurringExpense(null);
                Test.stopTest();
            } catch (Exception e) {
                exceptionThrown = true;
            }

            System.assertEquals(
                true,
                exceptionThrown,
                'Null recurring expense Id should throw an exception'
            );
        }
    }

    @IsTest
    static void testDeleteExpenseForcedDmlFailure() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Boolean exceptionThrown = false;

            try {
                Test.startTest();
                // Passing UserId triggers forced exception
                ExpenseController.deleteExpense(UserInfo.getUserId());
                Test.stopTest();
            } catch (Exception e) {
                exceptionThrown = true;
            }

            System.assertEquals(
                true,
                exceptionThrown,
                'Forced DML exception should have been thrown'
            );
        }
    }

    @IsTest
    static void testDeleteExpenseMissingRecord() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Expense__c exp = [SELECT Id FROM Expense__c LIMIT 1];
            delete exp;

            Boolean exceptionThrown = false;
            try {
                Test.startTest();
                ExpenseController.deleteExpense(exp.Id);
                Test.stopTest();
            } catch (AuraHandledException e) {
                exceptionThrown = true;
                System.assert(
                    e.getMessage().contains('already deleted'),
                    'Should surface a friendly missing-record message'
                );
            }

            System.assertEquals(
                true,
                exceptionThrown,
                'Missing records should throw a handled exception'
            );
        }
    }
}
