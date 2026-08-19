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

    /**
     * Validates the request and returns the normalized first day of its month.
     *
     * @return First day of the requested budget month.
     */
    public Date validateAndNormalizeMonth() {
        if (expenseGroupId == null) {
            throw handledException('Expense Group Id is required.');
        }
        if (budgetMonth == null) {
            throw handledException('Budget month is required.');
        }
        if (amount == null || amount <= 0) {
            throw handledException('Budget amount must be greater than zero.');
        }
        return budgetMonth.toStartOfMonth();
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
