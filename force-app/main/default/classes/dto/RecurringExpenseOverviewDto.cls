/** Recurring-template rows and summary totals for an expense-group context. */
public class RecurringExpenseOverviewDto {
    @AuraEnabled
    public List<RecurringExpenseRowDto> rows;
    @AuraEnabled
    public Integer activeCount;
    @AuraEnabled
    public Integer dueTodayCount;
    @AuraEnabled
    public Decimal monthlyTotal;

    /** Creates an empty recurring-expense overview. */
    public RecurringExpenseOverviewDto() {
        this.rows = new List<RecurringExpenseRowDto>();
        this.activeCount = 0;
        this.dueTodayCount = 0;
        this.monthlyTotal = 0;
    }
}
