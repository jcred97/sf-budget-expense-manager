@IsTest
private class ExpenseCurrencyServiceTest {
    @TestSetup
    static void setupCategory() {
        Expense_Group__c expenseGroup = new Expense_Group__c(Name = 'Foreign Travel');
        insert expenseGroup;
        insert new Category__c(Name = 'Travel Purchases', Expense_Group__c = expenseGroup.Id);
    }

    @IsTest
    static void testOrdinaryPhpAndForeignExpensesSaveInOneBulkRequest() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getCategory();
            Expense__c ordinaryExpense = baseExpense('Local Meal', category.Id);
            ordinaryExpense.Amount__c = 250;
            Expense__c foreignExpense = foreignExpense('Overseas Purchase', category.Id, 'usd');
            foreignExpense.Original_Amount__c = 1;
            foreignExpense.Exchange_Rate_To_PHP__c = 1.005;
            foreignExpense.Exchange_Rate_Source__c = ' ECB via Frankfurter ';

            Test.startTest();
            insert new List<Expense__c>{ ordinaryExpense, foreignExpense };
            Test.stopTest();

            Set<Id> savedExpenseIds = new Set<Id>{ ordinaryExpense.Id, foreignExpense.Id };
            Map<String, Expense__c> savedByName = new Map<String, Expense__c>();
            for (Expense__c savedExpense : [
                SELECT
                    Name,
                    Amount__c,
                    Original_Amount__c,
                    Original_Currency_Code__c,
                    Exchange_Rate_To_PHP__c,
                    Exchange_Rate_Date__c,
                    Exchange_Rate_Source__c
                FROM Expense__c
                WHERE Id IN :savedExpenseIds
            ]) {
                savedByName.put(savedExpense.Name, savedExpense);
            }

            System.assertEquals(
                250,
                savedByName.get('Local Meal').Amount__c,
                'An ordinary PHP expense must remain unchanged.'
            );
            System.assertEquals(
                null,
                savedByName.get('Local Meal').Original_Amount__c,
                'An ordinary PHP expense should not gain an FX snapshot.'
            );
            Expense__c savedForeignExpense = savedByName.get('Overseas Purchase');
            System.assertEquals(
                1.01,
                savedForeignExpense.Amount__c,
                'PHP rounding should be half-up.'
            );
            System.assertEquals(
                'USD',
                savedForeignExpense.Original_Currency_Code__c,
                'The currency code should be normalized before save.'
            );
            System.assertEquals(
                'ECB via Frankfurter',
                savedForeignExpense.Exchange_Rate_Source__c,
                'Provider attribution should be trimmed.'
            );
        }
    }

    @IsTest
    static void testForeignExpenseUpdateRecalculatesCanonicalPhpAmount() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getCategory();
            Expense__c expense = foreignExpense('Hotel', category.Id, 'EUR');
            expense.Original_Amount__c = 100;
            expense.Exchange_Rate_To_PHP__c = 60;
            insert expense;

            expense.Original_Amount__c = 125;
            expense.Exchange_Rate_To_PHP__c = 62.5;
            expense.Amount__c = 1;

            Test.startTest();
            update expense;
            Test.stopTest();

            Expense__c savedExpense = [
                SELECT Amount__c, Original_Amount__c, Exchange_Rate_To_PHP__c
                FROM Expense__c
                WHERE Id = :expense.Id
            ];
            System.assertEquals(
                7812.5,
                savedExpense.Amount__c,
                'The trigger should remain the final authority for the PHP amount.'
            );
        }
    }

    @IsTest
    static void testClearingForeignSnapshotKeepsExplicitPhpAmount() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getCategory();
            Expense__c expense = foreignExpense('Converted Purchase', category.Id, 'USD');
            insert expense;

            expense.Original_Amount__c = null;
            expense.Original_Currency_Code__c = null;
            expense.Exchange_Rate_To_PHP__c = null;
            expense.Exchange_Rate_Date__c = null;
            expense.Exchange_Rate_Source__c = null;
            expense.Amount__c = 777;

            Test.startTest();
            update expense;
            Test.stopTest();

            Expense__c savedExpense = [
                SELECT Amount__c, Original_Amount__c, Original_Currency_Code__c
                FROM Expense__c
                WHERE Id = :expense.Id
            ];
            System.assertEquals(
                777,
                savedExpense.Amount__c,
                'Turning FX off should keep the explicitly supplied PHP amount.'
            );
            System.assertEquals(
                null,
                savedExpense.Original_Amount__c,
                'FX details should be clear.'
            );
            System.assertEquals(
                null,
                savedExpense.Original_Currency_Code__c,
                'The original currency should be clear.'
            );
        }
    }

    @IsTest
    static void testRejectsIncompleteAndInvalidForeignSnapshots() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getCategory();
            List<Expense__c> invalidExpenses = new List<Expense__c>();

            Expense__c partial = baseExpense('Partial', category.Id);
            partial.Original_Amount__c = 100;
            invalidExpenses.add(partial);
            Expense__c zeroOriginal = foreignExpense('Zero Original', category.Id, 'USD');
            zeroOriginal.Original_Amount__c = 0;
            invalidExpenses.add(zeroOriginal);
            Expense__c negativeOriginal = foreignExpense('Negative Original', category.Id, 'USD');
            negativeOriginal.Original_Amount__c = -1;
            invalidExpenses.add(negativeOriginal);
            invalidExpenses.add(foreignExpense('Invalid Code', category.Id, 'US'));
            invalidExpenses.add(foreignExpense('PHP Snapshot', category.Id, 'PHP'));
            Expense__c zeroRate = foreignExpense('Zero Rate', category.Id, 'USD');
            zeroRate.Exchange_Rate_To_PHP__c = 0;
            invalidExpenses.add(zeroRate);
            Expense__c futureRate = foreignExpense('Future Rate', category.Id, 'USD');
            futureRate.Exchange_Rate_Date__c = Date.today().addDays(1);
            invalidExpenses.add(futureRate);
            Expense__c futureTransactionRate = foreignExpense(
                'Future Transaction Rate',
                category.Id,
                'USD'
            );
            futureTransactionRate.Expense_Date__c = Date.today().addDays(2);
            futureTransactionRate.Exchange_Rate_Date__c = Date.today().addDays(1);
            invalidExpenses.add(futureTransactionRate);

            Test.startTest();
            Database.SaveResult[] results = Database.insert(invalidExpenses, false);
            Test.stopTest();

            List<String> expectedFragments = new List<String>{
                'Complete all foreign-currency fields',
                'Original amount must be greater than zero',
                'Original amount must be greater than zero',
                'valid three-letter currency code',
                'standard PHP amount field',
                'Exchange rate to PHP must be greater than zero',
                'cannot be after the transaction date',
                'cannot be in the future'
            };
            for (Integer index = 0; index < results.size(); index++) {
                System.assertEquals(
                    false,
                    results[index].isSuccess(),
                    'The invalid row should fail.'
                );
                System.assert(
                    results[index].getErrors()[0].getMessage().contains(expectedFragments[index]),
                    'The validation error should identify the invalid FX detail.'
                );
            }
            System.assertEquals(
                0,
                [SELECT COUNT() FROM Expense__c],
                'No invalid foreign-currency snapshot should persist.'
            );
        }
    }

    @IsTest
    static void testNullExpenseDateUsesTodayForRateDateValidation() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = getCategory();
            Expense__c expense = foreignExpense('Undated Purchase', category.Id, 'USD');
            expense.Expense_Date__c = null;

            Test.startTest();
            insert expense;
            Test.stopTest();

            System.assertEquals(
                500,
                [SELECT Amount__c FROM Expense__c WHERE Id = :expense.Id].Amount__c,
                'An undated Expense should validate its rate against today.'
            );
        }
    }

    private static Category__c getCategory() {
        return [SELECT Id FROM Category__c WHERE Name = 'Travel Purchases' LIMIT 1];
    }

    private static Expense__c baseExpense(String name, Id categoryId) {
        return new Expense__c(
            Name = name,
            Amount__c = 1,
            Category__c = categoryId,
            Expense_Date__c = Date.today()
        );
    }

    private static Expense__c foreignExpense(String name, Id categoryId, String originalCurrency) {
        Expense__c expense = baseExpense(name, categoryId);
        expense.Original_Amount__c = 10;
        expense.Original_Currency_Code__c = originalCurrency;
        expense.Exchange_Rate_To_PHP__c = 50;
        expense.Exchange_Rate_Date__c = Date.today();
        expense.Exchange_Rate_Source__c = 'Manual';
        return expense;
    }
}
