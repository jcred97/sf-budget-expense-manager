/** Normalizes and validates monthly budget records before persistence. */
public inherited sharing class BudgetTriggerHandler {
    /**
     * Enforces the monthly budget invariants for every insert and update path.
     *
     * @param budgets Budget records in the current before-save context.
     */
    public static void beforeSave(List<Budget__c> budgets) {
        for (Budget__c budget : budgets) {
            normalizeBudget(budget);
        }
    }

    private static void normalizeBudget(Budget__c budget) {
        if (budget.Expense_Group__c == null) {
            budget.addError('Expense Group is required.');
        }
        if (budget.Budget_Month__c == null) {
            budget.addError('Budget Month is required.');
        }
        if (budget.Amount__c == null || budget.Amount__c <= 0) {
            budget.addError('Budget Amount must be greater than zero.');
        }
        if (budget.Expense_Group__c == null || budget.Budget_Month__c == null) {
            return;
        }

        Date normalizedBudgetMonth = budget.Budget_Month__c.toStartOfMonth();
        budget.Budget_Month__c = normalizedBudgetMonth;
        budget.Budget_Key__c = buildBudgetKey(budget.Expense_Group__c, normalizedBudgetMonth);
    }

    private static String buildBudgetKey(Id expenseGroupId, Date budgetMonth) {
        return String.valueOf(expenseGroupId) +
            '-' +
            String.valueOf(budgetMonth.year()) +
            '-' +
            String.valueOf(budgetMonth.month()).leftPad(2, '0');
    }
}
