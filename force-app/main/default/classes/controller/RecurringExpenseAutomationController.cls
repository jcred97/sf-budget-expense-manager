/** Lightning-facing controller for recurring-expense generation automation. */
public with sharing class RecurringExpenseAutomationController {
    /**
     * Generates due recurring expenses for today using the synchronous run cap.
     *
     * @return Generation counts and limit status.
     */
    @AuraEnabled
    public static RecurringExpenseGenerationResult generateDueExpenses() {
        return RecurringExpenseService.generateDueExpenses();
    }

    /**
     * Queues the recurring-expense batch and records its queued status.
     *
     * @return Salesforce batch job ID.
     */
    @AuraEnabled
    public static Id runDueExpensesBatch() {
        return RecurringExpenseService.runDueExpensesBatch();
    }
}
