/** Complete expense aggregates and bounded dashboard detail records. */
public class ExpenseDashboardSummary {
    @AuraEnabled
    public Decimal totalAmount { get; set; }
    @AuraEnabled
    public Integer expenseCount { get; set; }
    @AuraEnabled
    public Integer activeDayCount { get; set; }
    @AuraEnabled
    public List<ExpenseDashboardGroup> categoryTotals { get; set; }
    @AuraEnabled
    public List<ExpenseDashboardGroup> bankTotals { get; set; }
    @AuraEnabled
    public ExpenseDashboardGroup topBank { get; set; }
    @AuraEnabled
    public ExpenseDashboardDay topDay { get; set; }
    @AuraEnabled
    public Expense__c largestExpense { get; set; }
    @AuraEnabled
    public List<Expense__c> recentExpenses { get; set; }

    public ExpenseDashboardSummary() {
        totalAmount = 0;
        expenseCount = 0;
        activeDayCount = 0;
        categoryTotals = new List<ExpenseDashboardGroup>();
        bankTotals = new List<ExpenseDashboardGroup>();
        recentExpenses = new List<Expense__c>();
    }
}
