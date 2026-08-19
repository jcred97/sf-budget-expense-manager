/** Coordinates manual, synchronous, and batch recurring-expense generation. */
public with sharing class RecurringExpenseService {
    @TestVisible
    private static final Integer MAX_EXPENSES_PER_RUN = 200;
    @TestVisible
    private static final Integer MAX_EXPENSES_PER_TRANSACTION = 9000;

    /** Counts and limit status produced by a recurring-expense generation run. */
    public class GenerationResult {
        @AuraEnabled
        public Date runDate;
        @AuraEnabled
        public Integer recurringExpensesProcessed;
        @AuraEnabled
        public Integer expensesCreated;
        @AuraEnabled
        public Integer recurringExpensesUpdated;
        @AuraEnabled
        public Boolean hitGenerationLimit;

        /**
         * Creates an empty result for a generation date.
         *
         * @param runDate Inclusive generation cutoff represented by this result.
         */
        public GenerationResult(Date runDate) {
            this.runDate = runDate;
            this.recurringExpensesProcessed = 0;
            this.expensesCreated = 0;
            this.recurringExpensesUpdated = 0;
            this.hitGenerationLimit = false;
        }
    }

    /**
     * Generates due recurring expenses for today using the synchronous run cap.
     *
     * @return Generation counts and limit status.
     */
    @AuraEnabled
    public static GenerationResult generateDueExpenses() {
        return generateDueExpenses(Date.today());
    }

    /**
     * Queues the recurring-expense batch and records its queued status.
     *
     * @return Salesforce batch job ID.
     */
    @AuraEnabled
    public static Id runDueExpensesBatch() {
        if (!BudgetExpenseSettingsService.areRecurringExpensesEnabled()) {
            throw handledException(
                'Recurring expenses are disabled in Budget & Expense Manager Settings.'
            );
        }

        Id jobId = Database.executeBatch(
            new RecurringExpenseBatch(),
            RecurringExpenseBatch.DEFAULT_BATCH_SIZE
        );
        BudgetExpenseSettingsService.markRecurringRunQueued(jobId);
        return jobId;
    }

    @TestVisible
    private static GenerationResult generateDueExpenses(Date runDate) {
        if (runDate == null) {
            throw new AuraHandledException('Run date is required.');
        }

        List<Recurring_Expense__c> dueRecurringExpenses = [
            SELECT
                Id,
                Name,
                Active__c,
                Amount__c,
                Bank__c,
                Bank_Assignment__c,
                Category__c,
                Description__c,
                End_Date__c,
                Frequency__c,
                Next_Run_Date__c,
                Start_Date__c,
                Transaction_Type__c
            FROM Recurring_Expense__c
            WHERE Active__c = TRUE AND Next_Run_Date__c != NULL AND Next_Run_Date__c <= :runDate
            WITH USER_MODE
            ORDER BY Next_Run_Date__c ASC, CreatedDate ASC
            LIMIT :MAX_EXPENSES_PER_RUN
        ];

        return generateDueExpenses(dueRecurringExpenses, runDate);
    }

    /**
     * Generates expenses for the supplied recurring templates through the transaction-safe cap.
     *
     * @param dueRecurringExpenses Recurring templates eligible for processing.
     * @param runDate Inclusive generation cutoff.
     * @return Generation counts and limit status.
     */
    public static GenerationResult generateDueExpenses(
        List<Recurring_Expense__c> dueRecurringExpenses,
        Date runDate
    ) {
        return generateDueExpenses(dueRecurringExpenses, runDate, MAX_EXPENSES_PER_TRANSACTION);
    }

    private static GenerationResult generateDueExpenses(
        List<Recurring_Expense__c> dueRecurringExpenses,
        Date runDate,
        Integer maxExpenses
    ) {
        if (runDate == null) {
            throw new AuraHandledException('Run date is required.');
        }
        RecurringExpenseGenerator.GenerationOptions options = new RecurringExpenseGenerator.GenerationOptions();
        options.runDate = runDate;
        options.maxExpenses = maxExpenses;
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
