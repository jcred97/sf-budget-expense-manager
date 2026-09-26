/** Lightning-facing controller for Expense queries and commands. */
public with sharing class ExpenseController {
    private static final Integer MAX_WORKSPACE_RESULTS = 2000;

    /**
     * Loads one expense page, enforcing sharing and field access in the service.
     * @param filters Expense group, category and date constraints.
     * @param pagination Search, bounded page size and optional continuation cursor.
     * @return Bounded rows and full-filter totals on the first page.
     */
    @AuraEnabled
    public static ExpensePageDto getExpensePage(ExpenseFilterRequest filters, ExpensePageRequest pagination) {
        return ExpensePageService.getPage(filters, pagination);
    }
    /**
     * Returns monthly expense totals matching the supplied filters.
     *
     * @param filters Expense-group, category, and date filters; null uses default filters.
     * @return Monthly totals ordered chronologically.
     */
    @AuraEnabled
    public static List<MonthlyExpenseTotalDto> getMonthlyTrend(ExpenseFilterRequest filters) {
        return ExpenseQueryService.getMonthlyTrend(filters);
    }

    /**
     * Returns expense groups available to the current user for workspace selection.
     *
     * @return Expense groups ordered by name, capped at 2,000 records.
     */
    @AuraEnabled(cacheable=true)
    public static List<Expense_Group__c> getAllExpenseGroups() {
        return [
            SELECT Id, Name
            FROM Expense_Group__c
            WITH USER_MODE
            ORDER BY Name
            LIMIT :MAX_WORKSPACE_RESULTS
        ];
    }

    /**
     * Returns categories for an expense group or the bounded compatibility list for an all-groups request.
     *
     * @param expenseGroupId Optional Expense Group record ID; null returns the bounded compatibility list.
     * @return Categories ordered by name.
     */
    @AuraEnabled(cacheable=true)
    public static List<Category__c> getCategoriesByExpenseGroup(Id expenseGroupId) {
        if (expenseGroupId == null) {
            return [
                SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
                FROM Category__c
                WITH USER_MODE
                ORDER BY Name
                LIMIT :MAX_WORKSPACE_RESULTS
            ];
        }

        return [
            SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
            FROM Category__c
            WHERE Expense_Group__c = :expenseGroupId
            WITH USER_MODE
            ORDER BY Name
        ];
    }

    /**
     * Returns expenses matching the supplied workspace filters.
     *
     * @param filters Expense-group, category, and date filters; null uses default filters.
     * @return Matching expenses ordered from newest to oldest.
     */
    @AuraEnabled
    public static List<Expense__c> getExpensesByFilters(ExpenseFilterRequest filters) {
        return ExpenseQueryService.getExpensesByFilters(filters);
    }

    /**
     * Deletes multiple expenses in one bulk operation.
     *
     * @param expenseIds Expense records to delete.
     */
    @AuraEnabled
    public static void deleteExpenses(List<Id> expenseIds) {
        ExpenseCommandService.deleteExpenses(expenseIds);
    }

    /**
     * Deletes one expense.
     *
     * @param expenseId Expense record to delete.
     */
    @AuraEnabled
    public static void deleteExpense(Id expenseId) {
        ExpenseCommandService.deleteExpense(expenseId);
    }
}
