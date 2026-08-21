/** Lightning-facing controller for Expense queries and commands. */
public with sharing class ExpenseController {
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
     * @return Expense groups ordered by name, subject to the selector result cap.
     */
    @AuraEnabled(cacheable=true)
    public static List<Expense_Group__c> getAllExpenseGroups() {
        return ExpenseGroupSelector.selectAllForWorkspace();
    }

    /**
     * Returns categories for an expense group or the bounded compatibility list for an all-groups request.
     *
     * @param expenseGroupId Optional Expense Group record ID; null returns the bounded compatibility list.
     * @return Categories ordered by name.
     */
    @AuraEnabled(cacheable=true)
    public static List<Category__c> getCategoriesByExpenseGroup(Id expenseGroupId) {
        return CategorySelector.selectByExpenseGroup(expenseGroupId);
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
