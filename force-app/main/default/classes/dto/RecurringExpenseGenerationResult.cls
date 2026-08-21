/** Counts and limit status produced by a recurring-expense generation run. */
public class RecurringExpenseGenerationResult {
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
    public RecurringExpenseGenerationResult(Date runDate) {
        this.runDate = runDate;
        this.recurringExpensesProcessed = 0;
        this.expensesCreated = 0;
        this.recurringExpensesUpdated = 0;
        this.hitGenerationLimit = false;
    }
}
