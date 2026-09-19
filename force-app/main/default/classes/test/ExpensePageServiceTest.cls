@IsTest
private class ExpensePageServiceTest {
    private static ExpensePageRequest pageRequest(String searchTerm, Integer size, String cursor) {
        ExpensePageRequest request = new ExpensePageRequest();
        request.searchTerm = searchTerm;
        request.pageSize = size;
        request.cursor = cursor;
        return request;
    }
    @TestSetup
    static void setupData() {
        Expense_Group__c groupRecord = new Expense_Group__c(Name = 'Household');
        insert groupRecord;
        Category__c category = new Category__c(
            Name = 'Supplies',
            Expense_Group__c = groupRecord.Id
        );
        insert category;
        List<Expense__c> rows = new List<Expense__c>();
        for (Integer i = 0; i < 30; i++) {
            rows.add(
                new Expense__c(
                    Name = 'Purchase ' + i,
                    Category__c = category.Id,
                    Amount__c = 10,
                    Expense_Date__c = i < 25 ? Date.today().addDays(-Math.mod(i, 3)) : null,
                    Transaction_Time__c = Math.mod(i, 2) == 0 ? Time.newInstance(12, 0, 0, 0) : null
                )
            );
        }
        insert rows;
    }

    @IsTest
    static void pagesPreserveOrderAndTotalsAcrossTiesAndNulls() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            List<Expense__c> expected = [
                SELECT Id
                FROM Expense__c
                ORDER BY
                    Expense_Date__c DESC NULLS LAST,
                    Transaction_Time__c DESC NULLS LAST,
                    CreatedDate DESC,
                    Id DESC
            ];
            List<Id> actual = new List<Id>();
            Test.startTest();
            ExpensePageDto page = ExpenseController.getExpensePage(
                null,
                pageRequest(null, 7, null)
            );
            System.assertEquals(30, page.totalCount, 'Count covers all pages');
            System.assertEquals(300, page.totalAmount, 'Amount covers all pages');
            System.assertEquals(7, page.rows.size(), 'Page is bounded');
            for (Expense__c row : page.rows) {
                actual.add(row.Id);
            }
            while (page.hasMore) {
                page = ExpenseController.getExpensePage(
                    null,
                    pageRequest(null, 7, page.nextCursor)
                );
                System.assertEquals(null, page.totalCount, 'Subsequent pages do not rescan totals');
                for (Expense__c row : page.rows) {
                    actual.add(row.Id);
                }
            }
            Test.stopTest();
            System.assertEquals(null, page.nextCursor, 'End of data has no cursor');
            System.assertEquals(
                expected.size(),
                new Set<Id>(actual).size(),
                'No skips or duplicates'
            );
            for (Integer i = 0; i < expected.size(); i++) {
                System.assertEquals(expected[i].Id, actual[i], 'Stable order at position ' + i);
            }
        }
    }

    @IsTest
    static void filtersAndLiteralSearchApplyBeforePagingAndTotals() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id, Expense_Group__c FROM Category__c LIMIT 1];
            insert new Expense__c(
                Name = 'Discount 10%_special',
                Category__c = category.Id,
                Amount__c = 50,
                Expense_Date__c = Date.today(),
                Bank__c = 'BDO',
                Transaction_Type__c = 'Credit Card'
            );
            ExpenseFilterRequest filters = new ExpenseFilterRequest();
            filters.expenseGroupId = category.Expense_Group__c;
            filters.categoryId = category.Id;
            filters.startDate = Date.today();
            filters.endDate = Date.today();
            Test.startTest();
            ExpensePageDto literal = ExpenseController.getExpensePage(
                filters,
                pageRequest('%_', 20, null)
            );
            ExpensePageDto bank = ExpenseController.getExpensePage(
                filters,
                pageRequest('bdo', 20, null)
            );
            ExpensePageDto typePage = ExpenseController.getExpensePage(
                filters,
                pageRequest('credit', 20, null)
            );
            ExpensePageDto categoryPage = ExpenseController.getExpensePage(
                filters,
                pageRequest('SUPPLIES', 2, null)
            );
            ExpensePageDto groupPage = ExpenseController.getExpensePage(
                filters,
                pageRequest('household', 2, null)
            );
            ExpensePageDto emptyPage = ExpenseController.getExpensePage(
                filters,
                pageRequest('absent', null, null)
            );
            Test.stopTest();
            System.assertEquals(1, literal.totalCount, 'Percent and underscore are literal');
            System.assertEquals(50, literal.totalAmount, 'Filtered sum');
            System.assertEquals(literal.rows[0].Id, bank.rows[0].Id, 'Search legacy bank');
            System.assertEquals(1, typePage.totalCount, 'Search transaction type');
            System.assertEquals(10, categoryPage.totalCount, 'Date/category filters affect totals');
            System.assertEquals(categoryPage.totalCount, groupPage.totalCount, 'Search group name');
            System.assertEquals(0, emptyPage.totalCount, 'Empty count');
            System.assertEquals(0, emptyPage.totalAmount, 'Empty sum');
            System.assertEquals(false, emptyPage.hasMore, 'Empty page ends pagination');
        }
    }

    @IsTest
    static void canonicalBankOverridesLegacySearch() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Category__c category = [SELECT Id, Expense_Group__c FROM Category__c LIMIT 1];
            Bank__c bank = new Bank__c(Name = 'Local Savings', Active__c = true);
            insert bank;
            Expense_Group_Bank__c assignment = new Expense_Group_Bank__c(
                Expense_Group__c = category.Expense_Group__c,
                Bank__c = bank.Id,
                Active__c = true
            );
            insert assignment;
            insert new Expense__c(
                Name = 'Assigned bank',
                Category__c = category.Id,
                Amount__c = 75,
                Bank__c = 'BDO',
                Bank_Assignment__c = assignment.Id
            );
            Test.startTest();
            ExpensePageDto canonical = ExpenseController.getExpensePage(
                null,
                pageRequest('savings', 20, null)
            );
            ExpensePageDto legacy = ExpenseController.getExpensePage(
                null,
                pageRequest('bdo', 20, null)
            );
            Test.stopTest();
            System.assertEquals(1, canonical.totalCount, 'Canonical bank is searched');
            System.assertEquals(0, legacy.totalCount, 'Hidden legacy bank does not match');
        }
    }

    @IsTest
    static void deletedAnchorDoesNotBreakNextPageAndBadCursorsFail() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ExpensePageDto first = ExpenseController.getExpensePage(
                null,
                pageRequest(null, 1, null)
            );
            delete first.rows;
            Test.startTest();
            ExpensePageDto nextPage = ExpenseController.getExpensePage(
                null,
                pageRequest(null, 1, first.nextCursor)
            );
            System.assertEquals(
                1,
                nextPage.rows.size(),
                'Cursor does not depend on anchor still existing'
            );
            System.assertNotEquals(first.rows[0].Id, nextPage.rows[0].Id, 'Next row');
            for (
                String badCursor : new List<String>{
                    'not-base64',
                    EncodingUtil.base64Encode(Blob.valueOf('{}'))
                }
            ) {
                try {
                    ExpenseController.getExpensePage(null, pageRequest(null, 20, badCursor));
                    System.assert(false, 'Invalid cursor must fail');
                } catch (AuraHandledException expected) {
                    System.assertNotEquals(null, expected, 'Handled invalid cursor');
                }
            }
            try {
                ExpenseController.getExpensePage(
                    null,
                    pageRequest('different', 20, first.nextCursor)
                );
                System.assert(false, 'Cursor from another filter must fail');
            } catch (AuraHandledException expected) {
                System.assertNotEquals(null, expected, 'Handled scope mismatch');
            }
            Test.stopTest();
        }
    }

    @IsTest
    static void pageSizesAreBoundedAndPagingPassesTwoThousand() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id categoryId = [SELECT Id FROM Category__c LIMIT 1].Id;
            List<Expense__c> rows = new List<Expense__c>();
            for (Integer i = 0; i < 2000; i++) {
                rows.add(
                    new Expense__c(Name = 'Bulk purchase', Category__c = categoryId, Amount__c = 1)
                );
            }
            insert rows;
            Test.startTest();
            ExpensePageDto defaultPage = ExpenseController.getExpensePage(
                null,
                pageRequest('', null, null)
            );
            ExpensePageDto minimum = ExpenseController.getExpensePage(
                null,
                pageRequest('', 0, null)
            );
            ExpensePageDto page = ExpenseController.getExpensePage(
                null,
                pageRequest('', 9999, null)
            );
            System.assertEquals(20, defaultPage.rows.size(), 'Default size');
            System.assertEquals(1, minimum.rows.size(), 'Minimum size');
            System.assertEquals(200, page.rows.size(), 'Maximum size');
            Set<Id> ids = new Set<Id>(new Map<Id, Expense__c>(page.rows).keySet());
            while (page.hasMore) {
                page = ExpenseController.getExpensePage(
                    null,
                    pageRequest('', 200, page.nextCursor)
                );
                ids.addAll(new Map<Id, Expense__c>(page.rows).keySet());
            }
            Test.stopTest();
            System.assertEquals(2030, ids.size(), 'Keyset paging has no 2000-row offset boundary');
        }
    }
}
