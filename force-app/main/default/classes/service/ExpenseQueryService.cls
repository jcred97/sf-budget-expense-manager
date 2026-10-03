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
        Map<String, Object> bindValues = new Map<String, Object>();
        String query = expenseSelect() + expenseWhere(filters, bindValues);
        query += 'ORDER BY Expense_Date__c DESC, Transaction_Time__c DESC NULLS LAST, CreatedDate DESC';
        return Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE);
    }

    /**
     * Shared expense fields for full dashboard reads and bounded list pages.
     * @return Fixed expense SELECT clause.
     */
    public static String expenseSelect() {
        return 'SELECT Id, Name, CreatedDate, Expense_Date__c, Transaction_Time__c, Description__c, ' +
            'Category__c, Category__r.Name, ' +
            'Category__r.Expense_Group__c, Category__r.Expense_Group__r.Name, ' +
            'Bank__c, Bank_Assignment__c, Bank_Assignment__r.Active__c, ' +
            'Bank_Assignment__r.Bank__c, Bank_Assignment__r.Bank__r.Name, ' +
            'Bank_Assignment__r.Bank__r.Active__c, Transaction_Type__c, Amount__c, ' +
            'Original_Amount__c, Original_Currency_Code__c, Exchange_Rate_To_PHP__c, ' +
            'Exchange_Rate_Date__c, Exchange_Rate_Source__c ' +
            'FROM Expense__c ';
    }

    /**
     * Shared bound predicates; callers must execute in user mode.
     * @param filters Expense group, category and date constraints.
     * @param bindValues Destination for bind values used by the predicates.
     * @return Bound WHERE clause.
     */
    public static String expenseWhere(
        ExpenseFilterRequest filters,
        Map<String, Object> bindValues
    ) {
        ExpenseFilterRequest safeFilters = getSafeFilters(filters);
        return 'WHERE Id != null ' +
            getRecordFilters(safeFilters.expenseGroupId, safeFilters.categoryId, bindValues) +
            getDateFilters(safeFilters.startDate, safeFilters.endDate, bindValues);
    }

    /**
     * Builds recurring-template rows and summary totals for a workspace context.
     *
     * @param expenseGroupId Optional Expense Group record ID.
     * @return Recurring-template overview for the requested context.
     */
    public static RecurringExpenseOverviewDto getRecurringExpenseOverview(Id expenseGroupId) {
        return getRecurringExpensePage(expenseGroupId, null, 50);
    }

    /** Bounded keyset page; first-page totals cover all visible matching templates. */
    public static RecurringExpenseOverviewDto getRecurringExpensePage(
        Id expenseGroupId,
        String cursor,
        Integer pageSize
    ) {
        RecurringExpenseOverviewDto overview = new RecurringExpenseOverviewDto();
        overview.expenseGroupId = expenseGroupId;
        Date today = Date.today();
        Integer size = pageSize == null ? 50 : Math.max(1, Math.min(200, pageSize));
        Map<String, Object> binds = new Map<String, Object>();
        String predicate = 'WHERE Id != null ' + getRecordFilters(expenseGroupId, null, binds);
        String scope = String.valueOf(expenseGroupId);
        String after = '';
        if (String.isBlank(cursor)) {
            List<AggregateResult> totals = Database.queryWithBinds(
                'SELECT Active__c active, Frequency__c frequency, COUNT(Id) qty, SUM(Amount__c) amount ' +
                'FROM Recurring_Expense__c ' + predicate + 'GROUP BY Active__c, Frequency__c',
                binds, AccessLevel.USER_MODE
            );
            for (AggregateResult total : totals) {
                Integer count = (Integer) total.get('qty');
                overview.totalCount += count;
                if ((Boolean) total.get('active') == true) {
                    overview.activeCount += count;
                    overview.monthlyTotal += getMonthlyRecurringAmount(
                        (Decimal) total.get('amount'), (String) total.get('frequency')
                    );
                }
            }
            List<AggregateResult> due = Database.queryWithBinds(
                'SELECT COUNT(Id) qty FROM Recurring_Expense__c ' + predicate +
                'AND Due_For_Generation__c = true', binds, AccessLevel.USER_MODE
            );
            overview.dueTodayCount = (Integer) due[0].get('qty');
        } else {
            after = recurringAfterWhere(readRecurringCursor(cursor, scope), binds);
            overview.totalCount = null;
            overview.activeCount = null;
            overview.dueTodayCount = null;
            overview.monthlyTotal = null;
        }
        binds.put('rowLimit', size + 1);
        List<Recurring_Expense__c> records = Database.queryWithBinds(
            recurringSelect() + predicate + after +
            'ORDER BY Active__c DESC, Next_Run_Date__c ASC NULLS LAST, Name ASC, Id ASC LIMIT :rowLimit',
            binds, AccessLevel.USER_MODE
        );
        overview.hasMore = records.size() > size;
        if (overview.hasMore) {
            records.remove(size);
            Recurring_Expense__c last = records[records.size() - 1];
            RecurringCursor next = new RecurringCursor();
            next.active = last.Active__c;
            next.nextRunDate = last.Next_Run_Date__c;
            next.name = last.Name;
            next.recordId = last.Id;
            next.scope = scope;
            overview.nextCursor = EncodingUtil.base64Encode(Blob.valueOf(JSON.serialize(next)));
        }
        for (Recurring_Expense__c recurringExpense : records) {
            overview.rows.add(buildRecurringExpenseRow(recurringExpense, today));
        }
        return overview;
    }

    private static RecurringCursor readRecurringCursor(String cursor, String scope) {
        try {
            if (cursor.length() > 4096) {
                throw new IllegalArgumentException('Invalid cursor');
            }
            RecurringCursor parsed = (RecurringCursor) JSON.deserializeStrict(
                EncodingUtil.base64Decode(cursor).toString(), RecurringCursor.class
            );
            if (parsed == null || parsed.scope != scope || parsed.active == null ||
                parsed.name == null || parsed.recordId == null ||
                parsed.recordId.getSObjectType() != Recurring_Expense__c.SObjectType) {
                throw new IllegalArgumentException('Invalid cursor');
            }
            return parsed;
        } catch (Exception error) {
            AuraHandledException handled = new AuraHandledException(
                'This recurring page is no longer valid. Refresh the recurring list.'
            );
            handled.setMessage('This recurring page is no longer valid. Refresh the recurring list.');
            throw handled;
        }
    }

    private static String recurringAfterWhere(RecurringCursor cursor, Map<String, Object> binds) {
        binds.put('cursorActive', cursor.active);
        binds.put('cursorDate', cursor.nextRunDate);
        binds.put('cursorName', cursor.name);
        binds.put('cursorId', cursor.recordId);
        String after = '(Name > :cursorName OR (Name = :cursorName AND Id > :cursorId))';
        after = '(Next_Run_Date__c = :cursorDate AND ' + after + ')';
        if (cursor.nextRunDate != null) {
            after = '(Next_Run_Date__c > :cursorDate OR Next_Run_Date__c = null OR ' + after + ')';
        }
        after = '(Active__c = :cursorActive AND ' + after + ')';
        if (cursor.active) {
            after = '(Active__c = false OR ' + after + ')';
        }
        return 'AND ' + after + ' ';
    }

    private class RecurringCursor {
        public Boolean active;
        public Date nextRunDate;
        public String name;
        public Id recordId;
        public String scope;
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

    private static String recurringSelect() {
        return
            'SELECT Id, Name, Active__c, Amount__c, Bank__c, Bank_Assignment__c, ' +
            'Bank_Assignment__r.Active__c, Bank_Assignment__r.Bank__c, ' +
            'Bank_Assignment__r.Bank__r.Name, Bank_Assignment__r.Bank__r.Active__c, ' +
            'Category__c, Category__r.Name, ' +
            'Category__r.Expense_Group__r.Name, End_Date__c, Frequency__c, Next_Run_Date__c, ' +
            'Start_Date__c, Transaction_Type__c ' +
            'FROM Recurring_Expense__c ';
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
