/** Settings and scheduler state returned to the settings LWC. */
public class BudgetExpenseSettingsState {
    @AuraEnabled
    public Id settingsId;
    @AuraEnabled
    public Boolean recurringExpensesEnabled;
    @AuraEnabled
    public String globalRecurringRunTime;
    @AuraEnabled
    public Datetime lastRecurringRunDateTime;
    @AuraEnabled
    public String lastRecurringRunStatus;
    @AuraEnabled
    public String lastRecurringRunMessage;
    @AuraEnabled
    public Boolean recurringScheduleActive;
    @AuraEnabled
    public String recurringScheduleState;
    @AuraEnabled
    public Datetime recurringScheduleNextRunDateTime;
    @AuraEnabled
    public String recurringScheduleTimeZone;
    @AuraEnabled
    public String recurringScheduleCronExpression;
}
