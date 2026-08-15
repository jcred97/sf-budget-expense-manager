/** Builds and executes user-mode expense and recurring-template queries. */
public with sharing class ExpenseQueryService {
    private static final List<String> MONTH_NAMES = new List<String>{
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
    };

    /**
     * Aggregates expenses into chronological monthly totals.
     *
     * @param filters Expense-group, category, and date filters; null uses default filters.
     * @return Monthly totals matching the supplied filters.
     */
    public static List<ExpenseController.MonthlyTotal> getMonthlyTrend(
        ExpenseController.ExpenseFilterRequest filters
    ) {
        ExpenseController.ExpenseFilterRequest safeFilters = getSafeFilters(filters);
        Date effectiveStartDate = safeFilters.startDate;
        Date effectiveEndDate = safeFilters.endDate;
        Id expenseGroupRecordId = getFilterId(safeFilters.expenseGroupId);
        Id categoryRecordId = getFilterId(safeFilters.categoryId);
        Map<String, Object> bindValues = new Map<String, Object>();

        if (effectiveStartDate == null && effectiveEndDate == null) {
            effectiveStartDate = Date.today().addMonths(-5).toStartOfMonth();
        }

        String query =
            'SELECT CALENDAR_YEAR(Expense_Date__c) yr, ' +
            'CALENDAR_MONTH(Expense_Date__c) mo, ' +
            'SUM(Amount__c) total ' +
            'FROM Expense__c ' +
            'WHERE Expense_Date__c != null ';
        query += getDateFilters(effectiveStartDate, effectiveEndDate, bindValues);
        query += getRecordFilters(expenseGroupRecordId, categoryRecordId, bindValues);
        query +=
            'GROUP BY CALENDAR_YEAR(Expense_Date__c), CALENDAR_MONTH(Expense_Date__c) ' +
            'ORDER BY CALENDAR_YEAR(Expense_Date__c) ASC, CALENDAR_MONTH(Expense_Date__c) ASC';

        return buildMonthlyTrend(Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE));
    }

    /**
     * Queries expense rows for the selected group, category, and date range.
     *
     * @param filters Expense-group, category, and date filters; null uses default filters.
     * @return Matching expenses ordered from newest to oldest.
     */
    public static List<Expense__c> getExpensesByFilters(
        ExpenseController.ExpenseFilterRequest filters
    ) {
        ExpenseController.ExpenseFilterRequest safeFilters = getSafeFilters(filters);
        Id expenseGroupRecordId = getFilterId(safeFilters.expenseGroupId);
        Id categoryRecordId = getFilterId(safeFilters.categoryId);
        Map<String, Object> bindValues = new Map<String, Object>();
        String query =
            'SELECT Id, Name, Expense_Date__c, Transaction_Time__c, Description__c, ' +
            'Category__c, Category__r.Name, ' +
            'Category__r.Expense_Group__c, Category__r.Expense_Group__r.Name, ' +
            'Bank__c, Transaction_Type__c, Amount__c ' +
            'FROM Expense__c WHERE Id != null ';
        query += getRecordFilters(expenseGroupRecordId, categoryRecordId, bindValues);
        query += getDateFilters(safeFilters.startDate, safeFilters.endDate, bindValues);
        query += 'ORDER BY Expense_Date__c DESC, Transaction_Time__c DESC NULLS LAST, CreatedDate DESC';

        return Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE);
    }

    /**
     * Builds recurring-template rows and summary totals for a workspace context.
     *
     * @param expenseGroupId Expense-group record ID or the All sentinel.
     * @return Recurring-template overview for the requested context.
     */
    public static ExpenseController.RecurringExpenseOverview getRecurringExpenseOverview(
        String expenseGroupId
    ) {
        ExpenseController.RecurringExpenseOverview overview = new ExpenseController.RecurringExpenseOverview();
        Date today = Date.today();

        for (Recurring_Expense__c recurringExpense : queryRecurringExpenses(expenseGroupId)) {
            ExpenseController.RecurringExpenseRow row = buildRecurringExpenseRow(
                recurringExpense,
                today
            );
            overview.rows.add(row);
            updateRecurringOverview(overview, row);
        }

        return overview;
    }

    private static ExpenseController.ExpenseFilterRequest getSafeFilters(
        ExpenseController.ExpenseFilterRequest filters
    ) {
        return filters == null ? new ExpenseController.ExpenseFilterRequest() : filters;
    }

    private static String getDateFilters(
        Date startDate,
        Date endDate,
        Map<String, Object> bindValues
    ) {
        String filters = '';
        if (startDate != null) {
            filters += 'AND Expense_Date__c >= :startDate ';
            bindValues.put('startDate', startDate);
        }
        if (endDate != null) {
            filters += 'AND Expense_Date__c <= :endDate ';
            bindValues.put('endDate', endDate);
        }
        return filters;
    }

    private static String getRecordFilters(
        Id expenseGroupRecordId,
        Id categoryRecordId,
        Map<String, Object> bindValues
    ) {
        String filters = '';
        if (expenseGroupRecordId != null) {
            filters += 'AND Category__r.Expense_Group__c = :expenseGroupRecordId ';
            bindValues.put('expenseGroupRecordId', expenseGroupRecordId);
        }
        if (categoryRecordId != null) {
            filters += 'AND Category__c = :categoryRecordId ';
            bindValues.put('categoryRecordId', categoryRecordId);
        }
        return filters;
    }

    private static List<ExpenseController.MonthlyTotal> buildMonthlyTrend(
        List<AggregateResult> results
    ) {
        List<ExpenseController.MonthlyTotal> trend = new List<ExpenseController.MonthlyTotal>();
        for (AggregateResult aggregateRow : results) {
            ExpenseController.MonthlyTotal monthlyTotal = new ExpenseController.MonthlyTotal();
            monthlyTotal.year = (Integer) aggregateRow.get('yr');
            monthlyTotal.monthNum = (Integer) aggregateRow.get('mo');
            monthlyTotal.month = MONTH_NAMES[monthlyTotal.monthNum - 1];
            monthlyTotal.total = (Decimal) aggregateRow.get('total');
            trend.add(monthlyTotal);
        }
        return trend;
    }

    private static List<Recurring_Expense__c> queryRecurringExpenses(String expenseGroupId) {
        Id expenseGroupRecordId = getFilterId(expenseGroupId);
        Map<String, Object> bindValues = new Map<String, Object>();
        String query =
            'SELECT Id, Name, Active__c, Amount__c, Bank__c, Category__c, Category__r.Name, ' +
            'Category__r.Expense_Group__r.Name, End_Date__c, Frequency__c, Next_Run_Date__c, ' +
            'Start_Date__c, Transaction_Type__c ' +
            'FROM Recurring_Expense__c WHERE Id != null ';

        if (expenseGroupRecordId != null) {
            query += 'AND Category__r.Expense_Group__c = :expenseGroupRecordId ';
            bindValues.put('expenseGroupRecordId', expenseGroupRecordId);
        }
        query += 'ORDER BY Active__c DESC, Next_Run_Date__c ASC NULLS LAST, Name ASC LIMIT 500';

        return Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE);
    }

    private static ExpenseController.RecurringExpenseRow buildRecurringExpenseRow(
        Recurring_Expense__c recurringExpense,
        Date today
    ) {
        ExpenseController.RecurringExpenseRow row = new ExpenseController.RecurringExpenseRow();
        row.id = recurringExpense.Id;
        row.name = recurringExpense.Name;
        row.categoryId = recurringExpense.Category__c;
        row.categoryName = recurringExpense.Category__r?.Name;
        row.expenseGroupName = recurringExpense.Category__r?.Expense_Group__r?.Name;
        row.amount = recurringExpense.Amount__c;
        row.monthlyAmount = getMonthlyRecurringAmount(
            recurringExpense.Amount__c,
            recurringExpense.Frequency__c
        );
        row.bank = recurringExpense.Bank__c;
        row.transactionType = recurringExpense.Transaction_Type__c;
        row.frequency = recurringExpense.Frequency__c;
        row.startDate = recurringExpense.Start_Date__c;
        row.nextRunDate = recurringExpense.Next_Run_Date__c;
        row.endDate = recurringExpense.End_Date__c;
        row.active = recurringExpense.Active__c;
        row.dueToday =
            recurringExpense.Active__c == true &&
            recurringExpense.Next_Run_Date__c != null &&
            recurringExpense.Next_Run_Date__c <= today;
        return row;
    }

    private static void updateRecurringOverview(
        ExpenseController.RecurringExpenseOverview overview,
        ExpenseController.RecurringExpenseRow row
    ) {
        if (row.active == true) {
            overview.activeCount++;
            overview.monthlyTotal += row.monthlyAmount == null ? 0 : row.monthlyAmount;
        }
        if (row.dueToday == true) {
            overview.dueTodayCount++;
        }
    }

    private static Id getFilterId(String recordId) {
        return String.isBlank(recordId) || recordId == 'All' ? null : Id.valueOf(recordId);
    }

    private static Decimal getMonthlyRecurringAmount(Decimal amount, String frequency) {
        Decimal safeAmount = amount == null ? 0 : amount;

        if (frequency == 'Daily') {
            return safeAmount * 30;
        }
        if (frequency == 'Weekly') {
            return (safeAmount * 52) / 12;
        }
        if (frequency == 'Yearly') {
            return safeAmount / 12;
        }
        return safeAmount;
    }
}
