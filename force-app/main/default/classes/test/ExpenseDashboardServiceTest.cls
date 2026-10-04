@IsTest
private class ExpenseDashboardServiceTest {
    @IsTest
    static void equalBankCountsUseAmountThenAlphabeticalName() {
        Category__c category = [SELECT Id FROM Category__c WHERE Name = 'Other category' LIMIT 1];
        List<Expense__c> expenses = new List<Expense__c>{
            new Expense__c(
                Name = 'BPI purchase',
                Category__c = category.Id,
                Bank__c = 'BPI',
                Transaction_Type__c = 'Debit Card',
                Amount__c = 20,
                Expense_Date__c = Date.today()
            ),
            new Expense__c(
                Name = 'BDO purchase',
                Category__c = category.Id,
                Bank__c = 'BDO',
                Transaction_Type__c = 'Debit Card',
                Amount__c = 10,
                Expense_Date__c = Date.today()
            ),
            new Expense__c(Name = 'Cash purchase', Category__c = category.Id, Amount__c = 10, Expense_Date__c = Date.today())
        };
        insert expenses;
        Test.startTest();
        ExpenseDashboardSummary amountTieBreaker = ExpenseController.getDashboardSummary(null);
        update new Expense__c(Id = expenses[1].Id, Amount__c = 20);
        ExpenseDashboardSummary nameTieBreaker = ExpenseController.getDashboardSummary(null);
        Test.stopTest();
        System.assertEquals('BPI', amountTieBreaker.topBank.name, 'Equal expense counts select the bank with higher complete PHP spend');
        System.assertEquals('BDO', nameTieBreaker.topBank.name, 'Equal counts and spend select the first bank alphabetically');
        System.assertEquals(
            'BDO',
            nameTieBreaker.bankTotals[0].name,
            'The chart shares deterministic alphabetical ordering for equal totals'
        );
        System.assertEquals('BPI', nameTieBreaker.bankTotals[1].name, 'Both equally funded banks remain in the chart');
    }

    @TestSetup
    static void setup() {
        List<Expense_Group__c> groups = new List<Expense_Group__c>{
            new Expense_Group__c(Name = 'Household'),
            new Expense_Group__c(Name = 'Other')
        };
        insert groups;
        List<Category__c> categories = new List<Category__c>{
            new Category__c(Name = 'Shared label', Expense_Group__c = groups[0].Id),
            new Category__c(Name = 'Shared label', Expense_Group__c = groups[1].Id),
            new Category__c(Name = 'Other category', Expense_Group__c = groups[0].Id)
        };
        insert categories;
        Bank__c bank = new Bank__c(Name = 'BPI', Active__c = true);
        insert bank;
        insert new Expense_Group_Bank__c(Expense_Group__c = groups[0].Id, Bank__c = bank.Id, Active__c = true);
    }

    @IsTest
    static void aggregatesAllRowsButReturnsFiveDetails() {
        Category__c category = [
            SELECT Id, Expense_Group__c
            FROM Category__c
            WHERE Expense_Group__r.Name = 'Household' AND Name = 'Shared label'
        ];
        Date month = Date.newInstance(2026, 1, 1);
        List<Expense__c> expenses = new List<Expense__c>();
        for (Integer i = 0; i < 1005; i++) {
            expenses.add(
                new Expense__c(
                    Name = 'Expense ' + i,
                    Category__c = category.Id,
                    Expense_Date__c = month.addDays(Math.mod(i, 3)),
                    Amount__c = 10,
                    Transaction_Time__c = Time.newInstance(12, 0, 0, 0)
                )
            );
        }
        expenses.add(new Expense__c(Name = 'Largest older', Category__c = category.Id, Expense_Date__c = month, Amount__c = 1000));
        expenses.add(
            new Expense__c(Name = 'Different month', Category__c = category.Id, Expense_Date__c = month.addMonths(1), Amount__c = 9999)
        );
        insert expenses;
        ExpenseFilterRequest filters = new ExpenseFilterRequest();
        filters.expenseGroupId = category.Expense_Group__c;
        filters.startDate = month;
        filters.endDate = month.addMonths(1).addDays(-1);
        List<Expense__c> expected = [
            SELECT Id
            FROM Expense__c
            WHERE Expense_Date__c >= :filters.startDate AND Expense_Date__c <= :filters.endDate
            ORDER BY Expense_Date__c DESC, Transaction_Time__c DESC NULLS LAST, CreatedDate DESC, Id DESC
            LIMIT 5
        ];
        Test.startTest();
        ExpenseDashboardSummary result = ExpenseController.getDashboardSummary(filters);
        Test.stopTest();
        System.assertEquals(1006, result.expenseCount, 'Summary counts all matching expenses');
        System.assertEquals(11050, result.totalAmount, 'Totals are independent of the five detail rows');
        System.assertEquals(3, result.activeDayCount, 'Daily average uses distinct active dates');
        System.assertEquals(5, result.recentExpenses.size(), 'Detail payload stays bounded');
        for (Integer i = 0; i < 5; i++) {
            System.assertEquals(expected[i].Id, result.recentExpenses[i].Id, 'Recent rows have deterministic tie ordering');
        }
        System.assertEquals('Largest older', result.largestExpense.Name, 'Largest is selected across every match');
        System.assertEquals(month, result.topDay.expenseDate, 'Highest day includes all its expenses');
        System.assertEquals(4350, result.topDay.total, 'Day sum includes largest older row');
        System.assertEquals(336, result.topDay.count, 'Day count includes every matching row');
        System.assertEquals('No bank', result.topBank.name, 'Blank bank has the expected display label');
        System.assertEquals(1006, result.topBank.count, 'Top bank uses complete counts');
        System.assertEquals(11050, result.categoryTotals[0].total, 'Category chart is complete');
    }

    @IsTest
    static void displayLabelsMergeAndInactiveAssignmentsRemainHistorical() {
        List<Category__c> categories = [
            SELECT Id, Expense_Group__c
            FROM Category__c
            WHERE Name = 'Shared label'
            ORDER BY Expense_Group__r.Name
        ];
        Expense_Group_Bank__c assignment = [SELECT Id, Bank__c FROM Expense_Group_Bank__c LIMIT 1];
        insert new List<Expense__c>{
            new Expense__c(
                Name = 'Assigned',
                Category__c = categories[0].Id,
                Bank_Assignment__c = assignment.Id,
                Transaction_Type__c = 'Debit Card',
                Amount__c = 10,
                Expense_Date__c = Date.today()
            ),
            new Expense__c(
                Name = 'Legacy',
                Category__c = categories[1].Id,
                Bank__c = 'BPI',
                Transaction_Type__c = 'Debit Card',
                Amount__c = 20,
                Expense_Date__c = Date.today()
            ),
            new Expense__c(Name = 'Cash big', Category__c = categories[0].Id, Amount__c = 100, Expense_Date__c = Date.today())
        };
        update new Expense_Group_Bank__c(Id = assignment.Id, Active__c = false);
        update new Bank__c(Id = assignment.Bank__c, Active__c = false);
        Test.startTest();
        ExpenseDashboardSummary result = ExpenseController.getDashboardSummary(null);
        ExpenseFilterRequest groupFilters = new ExpenseFilterRequest();
        groupFilters.expenseGroupId = categories[1].Expense_Group__c;
        ExpenseDashboardSummary other = ExpenseController.getDashboardSummary(groupFilters);
        groupFilters.categoryId = categories[1].Id;
        ExpenseDashboardSummary categoryResult = ExpenseController.getDashboardSummary(groupFilters);
        Test.stopTest();
        System.assertEquals(1, result.categoryTotals.size(), 'Same category names merge across groups');
        System.assertEquals(130, result.categoryTotals[0].total, 'Merged category contains both groups');
        System.assertEquals(2, result.bankTotals.size(), 'Assigned and legacy BPI merge into one bar');
        System.assertEquals('No bank', result.bankTotals[0].name, 'Chart sorts by spend');
        System.assertEquals('BPI', result.topBank.name, 'Top bank sorts by expense count instead of spend');
        System.assertEquals(2, result.topBank.count, 'Inactive historical assignment remains counted');
        System.assertEquals(30, result.topBank.total, 'Assigned bank and legacy display names share totals');
        System.assertEquals(1, other.expenseCount, 'Expense-group predicate applies to every aggregate');
        System.assertEquals(20, categoryResult.totalAmount, 'Category predicate also applies');
    }

    @IsTest
    static void emptyScopeAndNullAmountsPreserveZeroSemantics() {
        List<Category__c> categories = [SELECT Id FROM Category__c WHERE Expense_Group__r.Name = 'Household' ORDER BY Name];
        Date today = Date.today();
        insert new List<Expense__c>{
            new Expense__c(Name = 'Negative', Category__c = categories[0].Id, Amount__c = -5, Expense_Date__c = today),
            new Expense__c(Name = 'Blank amount', Category__c = categories[1].Id, Expense_Date__c = today.addDays(-1)),
            new Expense__c(Name = 'Undated', Category__c = categories[1].Id)
        };
        Test.startTest();
        ExpenseDashboardSummary result = ExpenseController.getDashboardSummary(null);
        ExpenseFilterRequest filters = new ExpenseFilterRequest();
        filters.startDate = today.addMonths(1);
        filters.endDate = today.addMonths(1).addDays(1);
        ExpenseDashboardSummary empty = ExpenseController.getDashboardSummary(filters);
        Test.stopTest();
        System.assertEquals(-5, result.totalAmount, 'Negative PHP amounts retain their original meaning');
        System.assertEquals(3, result.activeDayCount, 'Null date adds one active-day bucket');
        System.assertEquals(0, result.categoryTotals[0].total, 'An all-null sum ranks as zero ahead of negative spend');
        System.assertEquals(0, result.topDay.total, 'All-null day amounts behave as zero');
        System.assertEquals(null, result.largestExpense.Amount__c, 'Zero-valued blank amount outranks a negative expense');
        System.assertEquals(0, empty.totalAmount, 'Empty sum is zero');
        System.assertEquals(0, empty.expenseCount, 'Empty count is zero');
        System.assertEquals(0, empty.activeDayCount, 'Empty active days are zero');
        System.assertEquals(0, empty.recentExpenses.size(), 'Empty detail list is initialized');
        System.assertEquals(null, empty.topBank, 'Empty top bank is absent');
        System.assertEquals(null, empty.topDay, 'Empty top day is absent');
        System.assertEquals(null, empty.largestExpense, 'Empty largest expense is absent');
    }

    @IsTest
    static void categoryChartReturnsTopSixAndZeroLargestTiesUseRecentOrder() {
        Expense_Group__c expenseGroup = [SELECT Id FROM Expense_Group__c WHERE Name = 'Household'];
        List<Category__c> categories = new List<Category__c>();
        for (Integer i = 0; i < 8; i++) {
            categories.add(new Category__c(Name = 'Chart category ' + i, Expense_Group__c = expenseGroup.Id));
        }
        insert categories;
        List<Expense__c> expenses = new List<Expense__c>();
        for (Integer i = 0; i < 8; i++) {
            expenses.add(
                new Expense__c(Name = 'Chart expense ' + i, Category__c = categories[i].Id, Expense_Date__c = Date.today(), Amount__c = i)
            );
        }
        expenses.add(
            new Expense__c(Name = 'Older zero', Category__c = categories[0].Id, Amount__c = 0, Expense_Date__c = Date.today().addDays(-1))
        );
        expenses.add(
            new Expense__c(
                Name = 'Recent blank',
                Category__c = categories[0].Id,
                Expense_Date__c = Date.today(),
                Transaction_Time__c = Time.newInstance(23, 0, 0, 0)
            )
        );
        insert expenses;
        ExpenseFilterRequest filters = new ExpenseFilterRequest();
        filters.categoryId = categories[0].Id;
        Test.startTest();
        ExpenseDashboardSummary all = ExpenseController.getDashboardSummary(null);
        ExpenseDashboardSummary zeros = ExpenseController.getDashboardSummary(filters);
        Test.stopTest();
        System.assertEquals(6, all.categoryTotals.size(), 'Chart returns only its top six labels');
        System.assertEquals(7, all.categoryTotals[0].total, 'Top category ranks by total');
        System.assertEquals('Recent blank', zeros.largestExpense.Name, 'Blank and numeric zero use recent ordering when tied');
    }
}
