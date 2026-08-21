/** Filter values accepted by expense and monthly-trend queries. */
public class ExpenseFilterRequest {
    /** Selected expense group record ID. */
    @AuraEnabled
    public Id expenseGroupId { get; set; }

    /** Selected category record ID. */
    @AuraEnabled
    public Id categoryId { get; set; }

    /** Inclusive expense date range start. */
    @AuraEnabled
    public Date startDate { get; set; }

    /** Inclusive expense date range end. */
    @AuraEnabled
    public Date endDate { get; set; }
}
