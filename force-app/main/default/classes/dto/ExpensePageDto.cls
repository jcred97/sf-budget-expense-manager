/** One bounded expense page with full-filter totals on the first page. */
public class ExpensePageDto {
    @AuraEnabled
    public List<Expense__c> rows;
    @AuraEnabled
    public String nextCursor;
    @AuraEnabled
    public Boolean hasMore;
    @AuraEnabled
    public Integer totalCount;
    @AuraEnabled
    public Decimal totalAmount;
}
