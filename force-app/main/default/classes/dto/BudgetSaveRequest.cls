/** Lightning request for creating or updating one monthly expense-group budget. */
public class BudgetSaveRequest {
    /** Existing budget record ID; null creates or finds the month budget. */
    @AuraEnabled
    public Id budgetId { get; set; }

    /** Expense group that owns the budget. */
    @AuraEnabled
    public Id expenseGroupId { get; set; }

    /** Any date in the requested budget month. */
    @AuraEnabled
    public Date budgetMonth { get; set; }

    /** Positive monthly budget amount. */
    @AuraEnabled
    public Decimal amount { get; set; }

    /** Optional budget notes. */
    @AuraEnabled
    public String description { get; set; }
}
