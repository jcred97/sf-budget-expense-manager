/** Lightning-facing controller for optional monthly expense-group budgets. */
public with sharing class BudgetController {
    /**
     * Returns the optional budget for an expense group and calendar month.
     *
     * @param expenseGroupId Expense group that owns the budget.
     * @param budgetMonth Any date in the requested calendar month.
     * @return The monthly budget or null when the group has not opted in.
     */
    @AuraEnabled(cacheable=true)
    public static BudgetDto getMonthlyBudget(Id expenseGroupId, Date budgetMonth) {
        return BudgetService.getMonthlyBudget(expenseGroupId, budgetMonth);
    }

    /**
     * Creates or updates the budget for an expense group and calendar month.
     *
     * @param request Budget values to persist.
     * @return The persisted monthly budget.
     */
    @AuraEnabled
    public static BudgetDto saveMonthlyBudget(BudgetSaveRequest request) {
        return BudgetService.saveMonthlyBudget(request);
    }

    /**
     * Deletes one accessible monthly budget.
     *
     * @param budgetId Budget record to delete.
     */
    @AuraEnabled
    public static void deleteMonthlyBudget(Id budgetId) {
        BudgetService.deleteMonthlyBudget(budgetId);
    }
}
