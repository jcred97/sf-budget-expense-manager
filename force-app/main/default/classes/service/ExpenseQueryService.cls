/** Builds and executes user-mode expense and recurring-template queries. */
public with sharing class ExpenseQueryService {
    // Schema names include the package namespace in namespaced scratch and subscriber orgs.
    private static final String EXPENSE_OBJECT = Expense__c.SObjectType.getDescribe().getName();
    private static final String RECURRING_OBJECT = Recurring_Expense__c.SObjectType.getDescribe().getName();
    private static final String CATEGORY_RELATIONSHIP = Expense__c.Category__c.getDescribe().getRelationshipName();
    private static final String GROUP_RELATIONSHIP = Category__c.Expense_Group__c.getDescribe().getRelationshipName();
    private static final String ASSIGNMENT_RELATIONSHIP = Expense__c.Bank_Assignment__c.getDescribe().getRelationshipName();
    private static final String BANK_RELATIONSHIP = Expense_Group_Bank__c.Bank__c.getDescribe().getRelationshipName();
    private static final String EXPENSE_DATE_FIELD = Expense__c.Expense_Date__c.getDescribe().getName();
    private static final String TRANSACTION_TIME_FIELD = Expense__c.Transaction_Time__c.getDescribe().getName();
    private static final String DESCRIPTION_FIELD = Expense__c.Description__c.getDescribe().getName();
    private static final String CATEGORY_FIELD = Expense__c.Category__c.getDescribe().getName();
    private static final String BANK_FIELD = Expense__c.Bank__c.getDescribe().getName();
    private static final String BANK_ASSIGNMENT_FIELD = Expense__c.Bank_Assignment__c.getDescribe().getName();
    private static final String TRANSACTION_TYPE_FIELD = Expense__c.Transaction_Type__c.getDescribe().getName();
    private static final String AMOUNT_FIELD = Expense__c.Amount__c.getDescribe().getName();
    private static final String ORIGINAL_AMOUNT_FIELD = Expense__c.Original_Amount__c.getDescribe().getName();
    private static final String ORIGINAL_CURRENCY_CODE_FIELD = Expense__c.Original_Currency_Code__c.getDescribe().getName();
    private static final String EXCHANGE_RATE_TO_PHP_FIELD = Expense__c.Exchange_Rate_To_PHP__c.getDescribe().getName();
    private static final String EXCHANGE_RATE_DATE_FIELD = Expense__c.Exchange_Rate_Date__c.getDescribe().getName();
    private static final String EXCHANGE_RATE_SOURCE_FIELD = Expense__c.Exchange_Rate_Source__c.getDescribe().getName();
    private static final String ACTIVE_FIELD = Recurring_Expense__c.Active__c.getDescribe().getName();
    private static final String FREQUENCY_FIELD = Recurring_Expense__c.Frequency__c.getDescribe().getName();
    private static final String NEXT_RUN_DATE_FIELD = Recurring_Expense__c.Next_Run_Date__c.getDescribe().getName();
    private static final String DUE_FOR_GENERATION_FIELD = Recurring_Expense__c.Due_For_Generation__c.getDescribe().getName();
    private static final String END_DATE_FIELD = Recurring_Expense__c.End_Date__c.getDescribe().getName();
    private static final String START_DATE_FIELD = Recurring_Expense__c.Start_Date__c.getDescribe().getName();
    private static final String EXPENSE_GROUP_FIELD = Category__c.Expense_Group__c.getDescribe().getName();

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
            'SELECT CALENDAR_YEAR(' +
            EXPENSE_DATE_FIELD +
            ') yr, ' +
            'CALENDAR_MONTH(' +
            EXPENSE_DATE_FIELD +
            ') mo, ' +
            'SUM(' +
            AMOUNT_FIELD +
            ') total ' +
            'FROM ' +
            EXPENSE_OBJECT +
            ' ' +
            'WHERE ' +
            EXPENSE_DATE_FIELD +
            ' != null ';
        query += getDateFilters(effectiveStartDate, effectiveEndDate, bindValues);
        query += getRecordFilters(safeFilters.expenseGroupId, safeFilters.categoryId, bindValues);
        query +=
            'GROUP BY CALENDAR_YEAR(' +
            EXPENSE_DATE_FIELD +
            '), CALENDAR_MONTH(' +
            EXPENSE_DATE_FIELD +
            ') ' +
            'ORDER BY CALENDAR_YEAR(' +
            EXPENSE_DATE_FIELD +
            ') ASC, CALENDAR_MONTH(' +
            EXPENSE_DATE_FIELD +
            ') ASC';

        return buildMonthlyTrend(Database.queryWithBinds(query, bindValues, AccessLevel.USER_MODE));
    }

    /**
     * Shared expense fields for recent dashboard rows and bounded list pages.
     * @return Fixed expense SELECT clause.
     */
    public static String expenseSelect() {
        return 'SELECT Id, Name, CreatedDate, ' +
            EXPENSE_DATE_FIELD +
            ', ' +
            TRANSACTION_TIME_FIELD +
            ', ' +
            DESCRIPTION_FIELD +
            ', ' +
            CATEGORY_FIELD +
            ', ' +
            CATEGORY_RELATIONSHIP +
            '.Name, ' +
            CATEGORY_RELATIONSHIP +
            '.' +
            EXPENSE_GROUP_FIELD +
            ', ' +
            CATEGORY_RELATIONSHIP +
            '.' +
            GROUP_RELATIONSHIP +
            '.Name, ' +
            BANK_FIELD +
            ', ' +
            BANK_ASSIGNMENT_FIELD +
            ', ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            ACTIVE_FIELD +
            ', ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_FIELD +
            ', ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_RELATIONSHIP +
            '.Name, ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_RELATIONSHIP +
            '.' +
            ACTIVE_FIELD +
            ', ' +
            TRANSACTION_TYPE_FIELD +
            ', ' +
            AMOUNT_FIELD +
            ', ' +
            ORIGINAL_AMOUNT_FIELD +
            ', ' +
            ORIGINAL_CURRENCY_CODE_FIELD +
            ', ' +
            EXCHANGE_RATE_TO_PHP_FIELD +
            ', ' +
            EXCHANGE_RATE_DATE_FIELD +
            ', ' +
            EXCHANGE_RATE_SOURCE_FIELD +
            ' ' +
            'FROM ' +
            EXPENSE_OBJECT +
            ' ';
    }

    /**
     * Shared bound predicates; callers must execute in user mode.
     * @param filters Expense group, category and date constraints.
     * @param bindValues Destination for bind values used by the predicates.
     * @return Bound WHERE clause.
     */
    public static String expenseWhere(ExpenseFilterRequest filters, Map<String, Object> bindValues) {
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
    public static RecurringExpenseOverviewDto getRecurringExpensePage(Id expenseGroupId, String cursor, Integer pageSize) {
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
                'SELECT ' +
                    ACTIVE_FIELD +
                    ' active, ' +
                    FREQUENCY_FIELD +
                    ' frequency, COUNT(Id) qty, SUM(' +
                    AMOUNT_FIELD +
                    ') amount ' +
                    'FROM ' +
                    RECURRING_OBJECT +
                    ' ' +
                    predicate +
                    'GROUP BY ' +
                    ACTIVE_FIELD +
                    ', ' +
                    FREQUENCY_FIELD,
                binds,
                AccessLevel.USER_MODE
            );
            for (AggregateResult total : totals) {
                Integer count = (Integer) total.get('qty');
                overview.totalCount += count;
                if ((Boolean) total.get('active') == true) {
                    overview.activeCount += count;
                    overview.monthlyTotal += getMonthlyRecurringAmount((Decimal) total.get('amount'), (String) total.get('frequency'));
                }
            }
            List<AggregateResult> due = Database.queryWithBinds(
                'SELECT COUNT(Id) qty FROM ' + RECURRING_OBJECT + ' ' + predicate + 'AND ' + DUE_FOR_GENERATION_FIELD + ' = true',
                binds,
                AccessLevel.USER_MODE
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
            recurringSelect() +
                predicate +
                after +
                'ORDER BY ' +
                ACTIVE_FIELD +
                ' DESC, ' +
                NEXT_RUN_DATE_FIELD +
                ' ASC NULLS LAST, Name ASC, Id ASC LIMIT :rowLimit',
            binds,
            AccessLevel.USER_MODE
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
                EncodingUtil.base64Decode(cursor).toString(),
                RecurringCursor.class
            );
            if (
                parsed == null ||
                parsed.scope != scope ||
                parsed.active == null ||
                parsed.name == null ||
                parsed.recordId == null ||
                parsed.recordId.getSObjectType() != Recurring_Expense__c.SObjectType
            ) {
                throw new IllegalArgumentException('Invalid cursor');
            }
            return parsed;
        } catch (Exception error) {
            AuraHandledException handled = new AuraHandledException('This recurring page is no longer valid. Refresh the recurring list.');
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
        after = '(' + NEXT_RUN_DATE_FIELD + ' = :cursorDate AND ' + after + ')';
        if (cursor.nextRunDate != null) {
            after = '(' + NEXT_RUN_DATE_FIELD + ' > :cursorDate OR ' + NEXT_RUN_DATE_FIELD + ' = null OR ' + after + ')';
        }
        after = '(' + ACTIVE_FIELD + ' = :cursorActive AND ' + after + ')';
        if (cursor.active) {
            after = '(' + ACTIVE_FIELD + ' = false OR ' + after + ')';
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

    private static String getDateFilters(Date startDate, Date endDate, Map<String, Object> bindValues) {
        String filters = '';
        if (startDate != null) {
            filters += 'AND ' + EXPENSE_DATE_FIELD + ' >= :startDate ';
            bindValues.put('startDate', startDate);
        }
        if (endDate != null) {
            filters += 'AND ' + EXPENSE_DATE_FIELD + ' <= :endDate ';
            bindValues.put('endDate', endDate);
        }
        return filters;
    }

    private static String getRecordFilters(Id expenseGroupRecordId, Id categoryRecordId, Map<String, Object> bindValues) {
        String filters = '';
        if (expenseGroupRecordId != null) {
            filters += 'AND ' + CATEGORY_RELATIONSHIP + '.' + EXPENSE_GROUP_FIELD + ' = :expenseGroupRecordId ';
            bindValues.put('expenseGroupRecordId', expenseGroupRecordId);
        }
        if (categoryRecordId != null) {
            filters += 'AND ' + CATEGORY_FIELD + ' = :categoryRecordId ';
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
        return 'SELECT Id, Name, ' +
            ACTIVE_FIELD +
            ', ' +
            AMOUNT_FIELD +
            ', ' +
            BANK_FIELD +
            ', ' +
            BANK_ASSIGNMENT_FIELD +
            ', ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            ACTIVE_FIELD +
            ', ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_FIELD +
            ', ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_RELATIONSHIP +
            '.Name, ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_RELATIONSHIP +
            '.' +
            ACTIVE_FIELD +
            ', ' +
            CATEGORY_FIELD +
            ', ' +
            CATEGORY_RELATIONSHIP +
            '.Name, ' +
            CATEGORY_RELATIONSHIP +
            '.' +
            GROUP_RELATIONSHIP +
            '.Name, ' +
            END_DATE_FIELD +
            ', ' +
            FREQUENCY_FIELD +
            ', ' +
            NEXT_RUN_DATE_FIELD +
            ', ' +
            START_DATE_FIELD +
            ', ' +
            TRANSACTION_TYPE_FIELD +
            ' ' +
            'FROM ' +
            RECURRING_OBJECT +
            ' ';
    }

    private static RecurringExpenseRowDto buildRecurringExpenseRow(Recurring_Expense__c recurringExpense, Date today) {
        RecurringExpenseRowDto row = new RecurringExpenseRowDto();
        row.id = recurringExpense.Id;
        row.name = recurringExpense.Name;
        row.categoryId = recurringExpense.Category__c;
        row.categoryName = recurringExpense.Category__r?.Name;
        row.expenseGroupName = recurringExpense.Category__r?.Expense_Group__r?.Name;
        row.amount = recurringExpense.Amount__c;
        row.monthlyAmount = getMonthlyRecurringAmount(recurringExpense.Amount__c, recurringExpense.Frequency__c);
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
