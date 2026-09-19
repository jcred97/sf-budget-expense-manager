/** Search and cursor options for bounded expense reads. */
public class ExpensePageRequest {
    /** Optional literal search across displayed expense fields. */
    @AuraEnabled
    public String searchTerm { get; set; }
    /** Requested page size, clamped to 1 through 200; defaults to 20. */
    @AuraEnabled
    public Integer pageSize { get; set; }
    /** Continuation returned by the previous page; null starts a new result. */
    @AuraEnabled
    public String cursor { get; set; }
}
