/** Delegates Expense trigger normalization and validation to focused domain services. */
public inherited sharing class ExpenseTriggerHandler {
    /**
     * Routes supported Expense trigger operations.
     *
     * @param operation Current trigger operation.
     * @param expenses New Expense record values.
     * @param oldExpenses Prior Expense values keyed by record ID.
     */
    public static void run(
        System.TriggerOperation operation,
        List<Expense__c> expenses,
        Map<Id, Expense__c> oldExpenses
    ) {
        if (
            operation == System.TriggerOperation.BEFORE_INSERT ||
            operation == System.TriggerOperation.BEFORE_UPDATE
        ) {
            ExpenseCurrencyService.normalizeAndValidate(expenses);
            BankAssignmentValidator.validateExpenses(expenses, oldExpenses);
        }
    }
}
