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
    public static List<MonthlyExpenseTotalDto> getMonthlyTrend(ExpenseFilterRequest filters) {
        ExpenseFilterRequest safeFilters = getSafeFilters(filters);
        Date effectiveStartDate = safeFilters.startDate;
        Date effectiveEndDate = safeFilters.endDate;
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
        query += getRecordFilters(safeFilters.expenseGroupId, safeFilters.categoryId, bindValues);
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
    public static List<Expense__c> getExpensesByFilters(ExpenseFilterRequest filters) {
        ExpenseFilterRequest safeFilters = getSafeFilters(filters);
        Map<String, Object> bindValues = new Map<String, Object>();
        String query =
            'SELECT Id, Name, Expense_Date__c, Transaction_Time__c, Description__c, ' +
            'Category__c, Category__r.Name, ' +
            'Category__r.Expense_Group__c, Category__r.Expense_Group__r.Name, ' +
            'Bank__c, Bank_Assignment__c, Bank_Assignment__r.Active__c, ' +
            'Bank_Assignment__r.Bank__c, Bank_Assignment__r.Bank__r.Name, ' +
            'Bank_Assignment__r.Bank__r.Active__c, Transaction_Type__c, Amount__c ' +
            'FROM Expense__c WHERE Id != null ';
        query += getRecordFilters(safeFilters.expenseGroupId, safeFilters.categoryId, bindValues);
        query += getDateFilters(safeFilters.startDate, safeFilters.endDate, bindValues);
        query += 'ORDER BY Expense_Date__c DESC, Transaction_Time__c DESC NULLS LAST, CreatedDate DESC';

        return Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE);
    }

    /**
     * Builds recurring-template rows and summary totals for a workspace context.
     *
     * @param expenseGroupId Optional Expense Group record ID.
     * @return Recurring-template overview for the requested context.
     */
    public static RecurringExpenseOverviewDto getRecurringExpenseOverview(Id expenseGroupId) {
        RecurringExpenseOverviewDto overview = new RecurringExpenseOverviewDto();
        Date today = Date.today();

        for (Recurring_Expense__c recurringExpense : queryRecurringExpenses(expenseGroupId)) {
            RecurringExpenseRowDto row = buildRecurringExpenseRow(recurringExpense, today);
            overview.rows.add(row);
            updateRecurringOverview(overview, row);
        }

        return overview;
    }

    private static ExpenseFilterRequest getSafeFilters(ExpenseFilterRequest filters) {
        return filters == null ? new ExpenseFilterRequest() : filters;
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

    private static List<MonthlyExpenseTotalDto> buildMonthlyTrend(List<AggregateResult> results) {
        List<MonthlyExpenseTotalDto> trend = new List<MonthlyExpenseTotalDto>();
        for (AggregateResult aggregateRow : results) {
            MonthlyExpenseTotalDto monthlyTotal = new MonthlyExpenseTotalDto();
            monthlyTotal.year = (Integer) aggregateRow.get('yr');
            monthlyTotal.monthNum = (Integer) aggregateRow.get('mo');
            monthlyTotal.month = MONTH_NAMES[monthlyTotal.monthNum - 1];
            monthlyTotal.total = (Decimal) aggregateRow.get('total');
            trend.add(monthlyTotal);
        }
        return trend;
    }

    private static List<Recurring_Expense__c> queryRecurringExpenses(Id expenseGroupId) {
        Map<String, Object> bindValues = new Map<String, Object>();
        String query =
            'SELECT Id, Name, Active__c, Amount__c, Bank__c, Bank_Assignment__c, ' +
            'Bank_Assignment__r.Active__c, Bank_Assignment__r.Bank__c, ' +
            'Bank_Assignment__r.Bank__r.Name, Bank_Assignment__r.Bank__r.Active__c, ' +
            'Category__c, Category__r.Name, ' +
            'Category__r.Expense_Group__r.Name, End_Date__c, Frequency__c, Next_Run_Date__c, ' +
            'Start_Date__c, Transaction_Type__c ' +
            'FROM Recurring_Expense__c WHERE Id != null ';

        if (expenseGroupId != null) {
            query += 'AND Category__r.Expense_Group__c = :expenseGroupId ';
            bindValues.put('expenseGroupId', expenseGroupId);
        }
        query += 'ORDER BY Active__c DESC, Next_Run_Date__c ASC NULLS LAST, Name ASC LIMIT 500';

        return Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE);
    }

    private static RecurringExpenseRowDto buildRecurringExpenseRow(
        Recurring_Expense__c recurringExpense,
        Date today
    ) {
        RecurringExpenseRowDto row = new RecurringExpenseRowDto();
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
        row.bank = recurringExpense.Bank_Assignment__r?.Bank__r?.Name;
        if (String.isBlank(row.bank)) {
            row.bank = recurringExpense.Bank__c;
        }
        row.transactionType = recurringExpense.Transaction_Type__c;
        row.frequency = recurringExpense.Frequency__c;
        row.startDate = recurringExpense.Start_Date__c;
        row.nextRunDate = recurringExpense.Next_Run_Date__c;
        row.endDate = recurringExpense.End_Date__c;
        row.active = recurringExpense.Active__c;
        row.dueToday =
            recurringExpense.Active__c == true &&
            recurringExpense.Next_Run_Date__c != null &&
            recurringExpense.Next_Run_Date__c <= today &&
            (recurringExpense.End_Date__c == null ||
            recurringExpense.Next_Run_Date__c <= recurringExpense.End_Date__c);
        return row;
    }

    private static void updateRecurringOverview(
        RecurringExpenseOverviewDto overview,
        RecurringExpenseRowDto row
    ) {
        if (row.active == true) {
            overview.activeCount++;
            overview.monthlyTotal += row.monthlyAmount == null ? 0 : row.monthlyAmount;
        }
        if (row.dueToday == true) {
            overview.dueTodayCount++;
        }
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
