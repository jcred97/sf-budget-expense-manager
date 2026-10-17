/** Coordinates batch recurring-expense generation. */
public with sharing class RecurringExpenseService {
    public static final Integer MAX_BATCH_EXPENSES = 9000;

    /**
     * Queues the recurring-expense batch and records its queued status.
     *
     * @return Salesforce batch job ID.
     */
    public static Id runDueExpensesBatch() {
        requireRecurringExpensesEnabled();
        RecurringExpenseGenerator.requireGenerationAccess();

        Id jobId = Database.executeBatch(new RecurringExpenseBatch(), RecurringExpenseBatch.DEFAULT_BATCH_SIZE);
        BudgetExpenseSettingsService.markRecurringRunQueued();
        return jobId;
    }

    private static void requireRecurringExpensesEnabled() {
        if (!BudgetExpenseSettingsService.areRecurringExpensesEnabled()) {
            throw handledException('Recurring expenses are disabled in Budget & Expense Manager Settings.');
        }
    }

    /**
     * Generates expenses for the supplied recurring templates through the transaction-safe cap.
     *
     * @param dueRecurringExpenses Recurring templates eligible for processing.
     * @param runDate Inclusive generation cutoff.
     * @return Generation counts and limit status.
     */
    public static RecurringExpenseGenerationResult generateDueExpenses(List<Recurring_Expense__c> dueRecurringExpenses, Date runDate) {
        return generateDueExpenses(dueRecurringExpenses, runDate, MAX_BATCH_EXPENSES);
    }

    /** Generates a batch scope with a cap no greater than the transaction-safe maximum. */
    public static RecurringExpenseGenerationResult generateDueExpenses(
        List<Recurring_Expense__c> dueRecurringExpenses,
        Date runDate,
        Integer maxExpenses
    ) {
        if (runDate == null) {
            throw new AuraHandledException('Run date is required.');
        }
        RecurringExpenseGenerator.GenerationOptions options = new RecurringExpenseGenerator.GenerationOptions();
        options.runDate = runDate;
        if (maxExpenses == null || maxExpenses < 1) {
            throw new AuraHandledException('Generation limit must be positive.');
        }
        options.maxExpenses = Math.min(maxExpenses, MAX_BATCH_EXPENSES);
        options.generatedTransactionTime = getCurrentUserTime();
        return RecurringExpenseGenerator.generate(dueRecurringExpenses, options);
    }

    private static Time getCurrentUserTime() {
        Datetime currentDateTime = System.now();
        String timeZoneId = UserInfo.getTimeZone().getID();

        return Time.newInstance(
            Integer.valueOf(currentDateTime.format('H', timeZoneId)),
            Integer.valueOf(currentDateTime.format('m', timeZoneId)),
            Integer.valueOf(currentDateTime.format('s', timeZoneId)),
            0
        );
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
