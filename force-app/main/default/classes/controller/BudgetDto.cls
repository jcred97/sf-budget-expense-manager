/** Lightning-safe representation of one optional monthly expense-group budget. */
public class BudgetDto {
    /** Budget record ID. */
    @AuraEnabled
    public Id id { get; set; }

    /** Expense group that owns the budget. */
    @AuraEnabled
    public Id expenseGroupId { get; set; }

    /** First day of the budget month. */
    @AuraEnabled
    public Date budgetMonth { get; set; }

    /** Positive monthly budget amount. */
    @AuraEnabled
    public Decimal amount { get; set; }

    /** Optional budget notes. */
    @AuraEnabled
    public String description { get; set; }

    /**
     * Builds a Lightning-safe response from a queried budget record.
     *
     * @param budget Persisted monthly budget.
     */
    public BudgetDto(Budget__c budget) {
        this.id = budget.Id;
        this.expenseGroupId = budget.Expense_Group__c;
        this.budgetMonth = budget.Budget_Month__c;
        this.amount = budget.Amount__c;
        this.description = budget.Description__c;
    }
}
