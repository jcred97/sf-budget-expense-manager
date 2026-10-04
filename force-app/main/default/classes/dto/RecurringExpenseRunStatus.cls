/** Job-specific progress for a manual recurring-expense batch. */
public class RecurringExpenseRunStatus {
    @AuraEnabled
    public Id jobId;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Boolean isTerminal;
    @AuraEnabled
    public Integer numberOfErrors;
    @AuraEnabled
    public Integer jobItemsProcessed;
    @AuraEnabled
    public Integer totalJobItems;
}
