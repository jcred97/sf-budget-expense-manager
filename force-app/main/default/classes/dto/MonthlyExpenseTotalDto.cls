/** Monthly expense aggregate returned to dashboard charts. */
public class MonthlyExpenseTotalDto {
    /** Short display name for the calendar month. */
    @AuraEnabled
    public String month;

    /** Calendar year represented by the aggregate. */
    @AuraEnabled
    public Integer year;

    /** One-based calendar month number. */
    @AuraEnabled
    public Integer monthNum;

    /** Total expense amount for the calendar month. */
    @AuraEnabled
    public Decimal total;
}
