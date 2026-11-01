/** User-mode dashboard aggregates; expense details never grow with the matching count. */
public with sharing class ExpenseDashboardService {
    // Schema names include the package namespace in namespaced scratch and subscriber orgs.
    private static final String EXPENSE_OBJECT = Expense__c.SObjectType.getDescribe().getName();
    private static final String CATEGORY_RELATIONSHIP = Expense__c.Category__c.getDescribe().getRelationshipName();
    private static final String ASSIGNMENT_RELATIONSHIP = Expense__c.Bank_Assignment__c.getDescribe().getRelationshipName();
    private static final String BANK_RELATIONSHIP = Expense_Group_Bank__c.Bank__c.getDescribe().getRelationshipName();
    private static final String EXPENSE_DATE_FIELD = Expense__c.Expense_Date__c.getDescribe().getName();
    private static final String TRANSACTION_TIME_FIELD = Expense__c.Transaction_Time__c.getDescribe().getName();
    private static final String BANK_FIELD = Expense__c.Bank__c.getDescribe().getName();
    private static final String AMOUNT_FIELD = Expense__c.Amount__c.getDescribe().getName();

    private static final String RECENT_ORDER =
        EXPENSE_DATE_FIELD +
        ' DESC, ' +
        TRANSACTION_TIME_FIELD +
        ' DESC NULLS LAST, CreatedDate DESC, Id DESC ';

    public static ExpenseDashboardSummary getSummary(ExpenseFilterRequest filters) {
        ExpenseDashboardSummary summary = new ExpenseDashboardSummary();
        Map<String, Object> binds = new Map<String, Object>();
        String predicate = ExpenseQueryService.expenseWhere(filters, binds);
        List<AggregateResult> totals = Database.queryWithBinds(
            'SELECT SUM(' +
                AMOUNT_FIELD +
                ') amount, COUNT(Id) qty, COUNT(' +
                EXPENSE_DATE_FIELD +
                ') dated, ' +
                'COUNT_DISTINCT(' +
                EXPENSE_DATE_FIELD +
                ') days FROM ' +
                EXPENSE_OBJECT +
                ' ' +
                predicate,
            binds,
            AccessLevel.USER_MODE
        );
        AggregateResult total = totals[0];
        summary.expenseCount = (Integer) total.get('qty');
        summary.totalAmount = (Decimal) total.get('amount');
        if (summary.totalAmount == null) {
            summary.totalAmount = 0;
        }
        summary.activeDayCount = (Integer) total.get('days');
        if ((Integer) total.get('dated') < summary.expenseCount) {
            summary.activeDayCount++;
        }
        if (summary.expenseCount == 0) {
            return summary;
        }
        // Group by display name, rather than record ID: equally named categories share a chart bar.
        List<AggregateResult> categories = Database.queryWithBinds(
            'SELECT ' +
                CATEGORY_RELATIONSHIP +
                '.Name label, SUM(' +
                AMOUNT_FIELD +
                ') amount, COUNT(Id) qty ' +
                'FROM ' +
                EXPENSE_OBJECT +
                ' ' +
                predicate +
                'GROUP BY ' +
                CATEGORY_RELATIONSHIP +
                '.Name',
            binds,
            AccessLevel.USER_MODE
        );
        for (AggregateResult category : categories) {
            summary.categoryTotals.add(buildGroup(category, 'Uncategorized'));
        }
        summary.categoryTotals.sort();
        while (summary.categoryTotals.size() > 6) {
            summary.categoryTotals.remove(summary.categoryTotals.size() - 1);
        }
        // Separate assigned and legacy paths avoid grouping by every assignment/legacy combination.
        // No group limit: an excessive chart cardinality fails rather than returning partial totals.
        List<AggregateResult> assigned = Database.queryWithBinds(
            'SELECT ' +
                ASSIGNMENT_RELATIONSHIP +
                '.' +
                BANK_RELATIONSHIP +
                '.Name label, SUM(' +
                AMOUNT_FIELD +
                ') amount, COUNT(Id) qty ' +
                'FROM ' +
                EXPENSE_OBJECT +
                ' ' +
                predicate +
                'AND ' +
                ASSIGNMENT_RELATIONSHIP +
                '.' +
                BANK_RELATIONSHIP +
                '.Name != null ' +
                'GROUP BY ' +
                ASSIGNMENT_RELATIONSHIP +
                '.' +
                BANK_RELATIONSHIP +
                '.Name',
            binds,
            AccessLevel.USER_MODE
        );
        List<AggregateResult> legacy = Database.queryWithBinds(
            'SELECT ' +
                BANK_FIELD +
                ' label, SUM(' +
                AMOUNT_FIELD +
                ') amount, COUNT(Id) qty ' +
                'FROM ' +
                EXPENSE_OBJECT +
                ' ' +
                predicate +
                'AND ' +
                ASSIGNMENT_RELATIONSHIP +
                '.' +
                BANK_RELATIONSHIP +
                '.Name = null ' +
                'GROUP BY ' +
                BANK_FIELD,
            binds,
            AccessLevel.USER_MODE
        );
        Map<String, ExpenseDashboardGroup> banks = new Map<String, ExpenseDashboardGroup>();
        mergeBanks(banks, assigned);
        mergeBanks(banks, legacy);
        summary.bankTotals.addAll(banks.values());
        summary.bankTotals.sort();
        for (ExpenseDashboardGroup bank : summary.bankTotals) {
            if (summary.topBank == null || bank.count > summary.topBank.count) {
                summary.topBank = bank;
            }
        }
        List<AggregateResult> days = Database.queryWithBinds(
            'SELECT ' +
                EXPENSE_DATE_FIELD +
                ' day, SUM(' +
                AMOUNT_FIELD +
                ') amount, COUNT(Id) qty ' +
                'FROM ' +
                EXPENSE_OBJECT +
                ' ' +
                predicate +
                'GROUP BY ' +
                EXPENSE_DATE_FIELD +
                ' ORDER BY ' +
                EXPENSE_DATE_FIELD +
                ' DESC',
            binds,
            AccessLevel.USER_MODE
        );
        for (AggregateResult day : days) {
            Decimal amount = (Decimal) day.get('amount');
            amount = amount == null ? 0 : amount;
            if (summary.topDay == null || amount > summary.topDay.total) {
                summary.topDay = new ExpenseDashboardDay();
                summary.topDay.expenseDate = (Date) day.get('day');
                summary.topDay.total = amount;
                summary.topDay.count = (Integer) day.get('qty');
            }
        }
        summary.recentExpenses = Database.queryWithBinds(
            ExpenseQueryService.expenseSelect() + predicate + 'ORDER BY ' + RECENT_ORDER + 'LIMIT 5',
            binds,
            AccessLevel.USER_MODE
        );
        List<Expense__c> largest = Database.queryWithBinds(
            ExpenseQueryService.expenseSelect() +
                predicate +
                'AND ' +
                AMOUNT_FIELD +
                ' != null ORDER BY ' +
                AMOUNT_FIELD +
                ' DESC, ' +
                RECENT_ORDER +
                'LIMIT 1',
            binds,
            AccessLevel.USER_MODE
        );
        List<Expense__c> blankAmounts = Database.queryWithBinds(
            ExpenseQueryService.expenseSelect() + predicate + 'AND ' + AMOUNT_FIELD + ' = null ORDER BY ' + RECENT_ORDER + 'LIMIT 1',
            binds,
            AccessLevel.USER_MODE
        );
        summary.largestExpense = largest.isEmpty() ? null : largest[0];
        if (
            !blankAmounts.isEmpty() &&
            (summary.largestExpense == null ||
            summary.largestExpense.Amount__c < 0 ||
            (summary.largestExpense.Amount__c == 0 && isNewer(blankAmounts[0], summary.largestExpense)))
        ) {
            summary.largestExpense = blankAmounts[0];
        }
        return summary;
    }

    private static ExpenseDashboardGroup buildGroup(AggregateResult row, String fallback) {
        String name = (String) row.get('label');
        return new ExpenseDashboardGroup(String.isBlank(name) ? fallback : name, (Decimal) row.get('amount'), (Integer) row.get('qty'));
    }

    private static Boolean isNewer(Expense__c candidate, Expense__c other) {
        // DESC dates put undated rows first, matching the existing dashboard row query.
        if (candidate.Expense_Date__c != other.Expense_Date__c) {
            return candidate.Expense_Date__c == null ||
                (other.Expense_Date__c != null &&
                candidate.Expense_Date__c > other.Expense_Date__c);
        }
        if (candidate.Transaction_Time__c != other.Transaction_Time__c) {
            return candidate.Transaction_Time__c != null &&
                (other.Transaction_Time__c == null ||
                candidate.Transaction_Time__c > other.Transaction_Time__c);
        }
        if (candidate.CreatedDate != other.CreatedDate) {
            return candidate.CreatedDate > other.CreatedDate;
        }
        return String.valueOf(candidate.Id).compareTo(String.valueOf(other.Id)) > 0;
    }

    private static void mergeBanks(Map<String, ExpenseDashboardGroup> banks, List<AggregateResult> rows) {
        for (AggregateResult row : rows) {
            ExpenseDashboardGroup next = buildGroup(row, 'No bank');
            ExpenseDashboardGroup existing = banks.get(next.name);
            if (existing == null) {
                banks.put(next.name, next);
            } else {
                existing.total += next.total;
                existing.count += next.count;
            }
        }
    }
}
