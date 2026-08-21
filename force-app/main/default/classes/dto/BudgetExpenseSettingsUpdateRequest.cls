/** User-editable settings values accepted from the settings LWC. */
public class BudgetExpenseSettingsUpdateRequest {
    /** Whether recurring expense automation should be enabled. */
    @AuraEnabled
    public String recurringExpensesEnabled { get; set; }

    /** Daily recurring expense run time in HH:mm format. */
    @AuraEnabled
    public String globalRecurringRunTime { get; set; }
}
