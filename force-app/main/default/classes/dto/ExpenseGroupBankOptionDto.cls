/** Lightning response DTO for one Bank available to an Expense Group. */
public class ExpenseGroupBankOptionDto {
    /** Expense Group/Bank assignment selected by Expense and Recurring records. */
    @AuraEnabled
    public Id assignmentId { get; set; }
    /** Global Bank record represented by the assignment. */
    @AuraEnabled
    public Id bankId { get; set; }
    /** User-facing global Bank name. */
    @AuraEnabled
    public String bankName { get; set; }
    /** Expense Group that owns the assignment. */
    @AuraEnabled
    public Id expenseGroupId { get; set; }
    /** Bank payment methods supported by this Expense Group assignment. */
    @AuraEnabled
    public List<String> supportedTransactionTypes { get; set; }

    /**
     * Creates a selector response from an active Expense Group/Bank assignment.
     *
     * @param assignment Active assignment returned by the selector query.
     */
    public ExpenseGroupBankOptionDto(Expense_Group_Bank__c assignment) {
        this.assignmentId = assignment.Id;
        this.bankId = assignment.Bank__c;
        this.bankName = assignment.Bank__r?.Name;
        this.expenseGroupId = assignment.Expense_Group__c;
        this.supportedTransactionTypes = new List<String>();
        if (assignment.Supported_Credit_Card__c == true) {
            supportedTransactionTypes.add('Credit Card');
        }
        if (assignment.Supported_Debit_Card__c == true) {
            supportedTransactionTypes.add('Debit Card');
        }
        if (assignment.Supported_Bank_Payment__c == true) {
            supportedTransactionTypes.add('Bank Payment');
        }
        if (assignment.Supported_Bank_Transfer__c == true) {
            supportedTransactionTypes.add('Bank Transfer');
        }
    }
}
