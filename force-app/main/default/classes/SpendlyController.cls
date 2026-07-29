public with sharing class SpendlyController {
    public class ExpenseFilterRequest {
        /** Selected expense group record ID. */
        @AuraEnabled
        public String expenseGroupId { get; set; }
        /** Selected category record ID. */
        @AuraEnabled
        public String categoryId { get; set; }
        /** Inclusive expense date range start. */
        @AuraEnabled
        public Date startDate { get; set; }
        /** Inclusive expense date range end. */
        @AuraEnabled
        public Date endDate { get; set; }
    }

    public class MonthlyTotal {
        @AuraEnabled
        public String month;
        @AuraEnabled
        public Integer year;
        @AuraEnabled
        public Integer monthNum;
        @AuraEnabled
        public Decimal total;
    }

    public class RecurringExpenseRow {
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

    public class RecurringExpenseOverview {
        @AuraEnabled
        public List<RecurringExpenseRow> rows;
        @AuraEnabled
        public Integer activeCount;
        @AuraEnabled
        public Integer dueTodayCount;
        @AuraEnabled
        public Decimal monthlyTotal;

        public RecurringExpenseOverview() {
            this.rows = new List<RecurringExpenseRow>();
            this.activeCount = 0;
            this.dueTodayCount = 0;
            this.monthlyTotal = 0;
        }
    }

    @AuraEnabled
    public static List<MonthlyTotal> getMonthlyTrend(ExpenseFilterRequest filters) {
        return SpendlyExpenseQueryService.getMonthlyTrend(filters);
    }

    @AuraEnabled(cacheable=true)
    public static List<Expense_Group__c> getAllExpenseGroups() {
        return [
            SELECT Id, Name
            FROM Expense_Group__c
            WITH USER_MODE
            ORDER BY Name
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<Category__c> getCategoriesByExpenseGroup(String expenseGroupId) {
        if (String.isBlank(expenseGroupId) || expenseGroupId == 'All') {
            return [
                SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
                FROM Category__c
                WITH USER_MODE
                ORDER BY Name
            ];
        }

        Id expenseGroupRecordId = Id.valueOf(expenseGroupId);
        return [
            SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
            FROM Category__c
            WHERE Expense_Group__c = :expenseGroupRecordId
            WITH USER_MODE
            ORDER BY Name
        ];
    }

    @AuraEnabled
    public static List<Expense__c> getExpensesByFilters(ExpenseFilterRequest filters) {
        return SpendlyExpenseQueryService.getExpensesByFilters(filters);
    }

    @AuraEnabled(cacheable=true)
    public static RecurringExpenseOverview getRecurringExpenseOverview(String expenseGroupId) {
        return SpendlyExpenseQueryService.getRecurringExpenseOverview(expenseGroupId);
    }

    @AuraEnabled
    public static void deactivateRecurringExpense(Id recurringExpenseId) {
        SpendlyExpenseCommandService.deactivateRecurringExpense(recurringExpenseId);
    }

    @AuraEnabled
    public static void deleteExpenses(List<Id> expenseIds) {
        SpendlyExpenseCommandService.deleteExpenses(expenseIds);
    }

    @AuraEnabled
    public static void deleteExpense(Id expenseId) {
        SpendlyExpenseCommandService.deleteExpense(expenseId);
    }
}
