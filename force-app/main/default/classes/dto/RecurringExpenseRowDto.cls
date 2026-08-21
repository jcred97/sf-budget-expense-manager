/** Recurring-template row formatted for the recurring-expense workspace. */
public class RecurringExpenseRowDto {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id categoryId;
    @AuraEnabled
    public String categoryName;
    @AuraEnabled
    public String expenseGroupName;
    @AuraEnabled
    public Decimal amount;
    @AuraEnabled
    public Decimal monthlyAmount;
    @AuraEnabled
    public String bank;
    @AuraEnabled
    public String transactionType;
    @AuraEnabled
    public String frequency;
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date nextRunDate;
    @AuraEnabled
    public Date endDate;
    @AuraEnabled
    public Boolean active;
    @AuraEnabled
    public Boolean dueToday;
}
