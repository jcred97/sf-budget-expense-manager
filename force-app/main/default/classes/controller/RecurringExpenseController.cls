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

    /** Returns the next bounded page in the same Expense Group context. */
    @AuraEnabled
    public static RecurringExpenseOverviewDto getRecurringExpensePage(
        Id expenseGroupId,
        String cursor,
        Integer pageSize
    ) {
        return ExpenseQueryService.getRecurringExpensePage(expenseGroupId, cursor, pageSize);
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
