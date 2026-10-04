/** Highest spending date and its complete aggregate. */
public class ExpenseDashboardDay {
    @AuraEnabled
    public Date expenseDate { get; set; }
    @AuraEnabled
    public Decimal total { get; set; }
    @AuraEnabled
    public Integer count { get; set; }
}
