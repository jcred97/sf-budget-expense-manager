/** Lightning-facing controller for recurring-template queries and commands. */
public with sharing class RecurringExpenseController {
    /**
     * Builds recurring-template rows and summary totals for an Expense Group.
     *
     * @param expenseGroupId Optional Expense Group record ID.
     * @return Recurring-template overview for the requested context.
     */
    @AuraEnabled(cacheable=true)
    public static RecurringExpenseOverviewDto getRecurringExpenseOverview(Id expenseGroupId) {
        return ExpenseQueryService.getRecurringExpenseOverview(expenseGroupId);
    }

    /**
     * Deactivates a recurring-expense template.
     *
     * @param recurringExpenseId Recurring template to deactivate.
     */
    @AuraEnabled
    public static void deactivateRecurringExpense(Id recurringExpenseId) {
        ExpenseCommandService.deactivateRecurringExpense(recurringExpenseId);
    }
}
