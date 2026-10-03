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
    @AuraEnabled
    public Id expenseGroupId;
    @AuraEnabled
    public Integer totalCount;
    @AuraEnabled
    public Boolean hasMore;
    @AuraEnabled
    public String nextCursor;

    /** Creates an empty recurring-expense overview. */
    public RecurringExpenseOverviewDto() {
        this.rows = new List<RecurringExpenseRowDto>();
        this.activeCount = 0;
        this.dueTodayCount = 0;
        this.monthlyTotal = 0;
        this.totalCount = 0;
        this.hasMore = false;
    }
}
