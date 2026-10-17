/** Processes due recurring templates in bulk and records aggregate run results. */
public with sharing class RecurringExpenseBatch implements Database.Batchable<SObject>, Database.Stateful {
    public static final Integer DEFAULT_BATCH_SIZE = 50;

    private Date runDate;
    @TestVisible
    private Integer totalExpensesCreated = 0;
    private Integer totalRecurringExpensesProcessed = 0;
    @TestVisible
    private Boolean hasCatchUpRemaining = false;
    @TestVisible
    private Integer generationLimit = RecurringExpenseService.MAX_BATCH_EXPENSES;

    /** Creates a recurring-expense batch for the current date. */
    public RecurringExpenseBatch() {
        this(Date.today());
    }

    @TestVisible
    private RecurringExpenseBatch(Date runDate) {
        if (runDate == null) {
            throw new AuraHandledException('Run date is required.');
        }
        this.runDate = runDate;
    }

    /**
     * Selects active recurring templates due on or before the batch run date.
     *
     * @param context Platform batch context.
     * @return Query locator for due recurring templates.
     */
    public Database.QueryLocator start(Database.BatchableContext context) {
        RecurringExpenseGenerator.requireGenerationAccess();
        return Database.getQueryLocator(
            [
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
            ]
        );
    }

    /**
     * Generates expenses for one batch scope and accumulates run totals.
     *
     * @param context Platform batch context.
     * @param scope Due recurring templates in the current scope.
     */
    public void execute(Database.BatchableContext context, List<SObject> scope) {
        List<Recurring_Expense__c> recurringExpenses = new List<Recurring_Expense__c>();
        for (SObject item : scope) {
            Recurring_Expense__c recurringExpense = (Recurring_Expense__c) item;
            if (RecurringExpenseCalculator.shouldGenerateForDate(recurringExpense, recurringExpense.Next_Run_Date__c, runDate)) {
                recurringExpenses.add(recurringExpense);
            }
        }

        if (recurringExpenses.isEmpty()) {
            return;
        }

        RecurringExpenseGenerationResult result = RecurringExpenseService.generateDueExpenses(recurringExpenses, runDate, generationLimit);
        recordGenerationResult(result);
    }

    @TestVisible
    private void recordGenerationResult(RecurringExpenseGenerationResult result) {
        hasCatchUpRemaining = hasCatchUpRemaining || result.hitGenerationLimit;
        totalExpensesCreated += result.expensesCreated;
        totalRecurringExpensesProcessed += result.recurringExpensesProcessed;
    }

    /**
     * Persists the completed recurring-run summary to the app settings.
     *
     * @param context Platform batch context.
     */
    public void finish(Database.BatchableContext context) {
        Id jobId = context.getJobId();
        // Read only this framework-provided batch job. App administrators do not
        // need platform job object/field access to persist automation's own result.
        finishWithJob(
            [
                SELECT Id, NumberOfErrors
                FROM AsyncApexJob
                WHERE Id = :jobId AND JobType = 'BatchApex' AND ApexClass.Name = 'RecurringExpenseBatch'
                WITH SYSTEM_MODE
            ]
        );
    }

    @TestVisible
    private void finishWithJob(AsyncApexJob job) {
        // Automation owns these outcomes; app users do not receive object write access.
        Database.upsert(
            new Recurring_Expense_Run__c(Job_Id__c = String.valueOf(job.Id), Has_Catch_Up_Remaining__c = hasCatchUpRemaining),
            Recurring_Expense_Run__c.Job_Id__c,
            AccessLevel.SYSTEM_MODE
        );
        if (job.NumberOfErrors > 0) {
            BudgetExpenseSettingsService.markRecurringRunFailed(
                totalExpensesCreated > 0 ? 'Completed with errors' : 'Failed',
                totalExpensesCreated,
                job
            );
            return;
        }
        BudgetExpenseSettingsService.markRecurringRunCompleted(totalExpensesCreated, totalRecurringExpensesProcessed, hasCatchUpRemaining);
    }
}
