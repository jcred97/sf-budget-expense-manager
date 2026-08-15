/**
 * Lightning-facing controller for expense, recurring-template, and selector operations.
 */
public with sharing class ExpenseController {
    private static final Integer MAX_SELECTOR_RESULTS = 2000;

    /** Filter values accepted by expense and monthly-trend queries. */
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

    /** Monthly expense aggregate returned to dashboard charts. */
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

    /** Recurring-template row formatted for the recurring-expense workspace. */
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

    /** Recurring-template rows and summary totals for an expense-group context. */
    public class RecurringExpenseOverview {
        @AuraEnabled
        public List<RecurringExpenseRow> rows;
        @AuraEnabled
        public Integer activeCount;
        @AuraEnabled
        public Integer dueTodayCount;
        @AuraEnabled
        public Decimal monthlyTotal;

        /** Creates an empty recurring-expense overview. */
        public RecurringExpenseOverview() {
            this.rows = new List<RecurringExpenseRow>();
            this.activeCount = 0;
            this.dueTodayCount = 0;
            this.monthlyTotal = 0;
        }
    }

    /**
     * Returns monthly expense totals matching the supplied filters.
     *
     * @param filters Expense-group, category, and date filters; null uses default filters.
     * @return Monthly totals ordered chronologically.
     */
    @AuraEnabled
    public static List<MonthlyTotal> getMonthlyTrend(ExpenseFilterRequest filters) {
        return ExpenseQueryService.getMonthlyTrend(filters);
    }

    /**
     * Returns expense groups available to the current user for workspace selection.
     *
     * @return Expense groups ordered by name, subject to the selector result cap.
     */
    @AuraEnabled(cacheable=true)
    public static List<Expense_Group__c> getAllExpenseGroups() {
        return [
            SELECT Id, Name
            FROM Expense_Group__c
            WITH USER_MODE
            ORDER BY Name
            LIMIT :MAX_SELECTOR_RESULTS
        ];
    }

    /**
     * Returns categories for an expense group or the bounded compatibility list for an all-groups request.
     *
     * @param expenseGroupId Expense-group record ID, blank value, or the All sentinel.
     * @return Categories ordered by name.
     */
    @AuraEnabled(cacheable=true)
    public static List<Category__c> getCategoriesByExpenseGroup(String expenseGroupId) {
        if (String.isBlank(expenseGroupId) || expenseGroupId == 'All') {
            return [
                SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
                FROM Category__c
                WITH USER_MODE
                ORDER BY Name
                LIMIT :MAX_SELECTOR_RESULTS
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

    /**
     * Returns expenses matching the supplied workspace filters.
     *
     * @param filters Expense-group, category, and date filters; null uses default filters.
     * @return Matching expenses ordered from newest to oldest.
     */
    @AuraEnabled
    public static List<Expense__c> getExpensesByFilters(ExpenseFilterRequest filters) {
        return ExpenseQueryService.getExpensesByFilters(filters);
    }

    /**
     * Builds recurring-template rows and summary totals for an expense group.
     *
     * @param expenseGroupId Expense-group record ID or the All sentinel.
     * @return Recurring-template overview for the requested context.
     */
    @AuraEnabled(cacheable=true)
    public static RecurringExpenseOverview getRecurringExpenseOverview(String expenseGroupId) {
        return ExpenseQueryService.getRecurringExpenseOverview(expenseGroupId);
    }

    /**
     * Deactivates a recurring-expense template.
     *
     * @param recurringExpenseId Recurring template to deactivate.
     */
    @AuraEnabled
    public static void deactivateRecurringExpense(Id recurringExpenseId) {
        ExpenseCommandService.deactivateRecurringExpense(recurringExpenseId);
    }

    /**
     * Deletes multiple expenses in one bulk operation.
     *
     * @param expenseIds Expense records to delete.
     */
    @AuraEnabled
    public static void deleteExpenses(List<Id> expenseIds) {
        ExpenseCommandService.deleteExpenses(expenseIds);
    }

    /**
     * Deletes one expense.
     *
     * @param expenseId Expense record to delete.
     */
    @AuraEnabled
    public static void deleteExpense(Id expenseId) {
        ExpenseCommandService.deleteExpense(expenseId);
    }
}
