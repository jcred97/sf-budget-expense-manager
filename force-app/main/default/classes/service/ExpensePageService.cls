/** User-mode keyset pagination; no OFFSET limit or client-supplied query fragments. */
public with sharing class ExpensePageService {
    // Schema names include the package namespace in namespaced scratch and subscriber orgs.
    private static final String EXPENSE_OBJECT = Expense__c.SObjectType.getDescribe().getName();
    private static final String CATEGORY_RELATIONSHIP = Expense__c.Category__c.getDescribe().getRelationshipName();
    private static final String GROUP_RELATIONSHIP = Category__c.Expense_Group__c.getDescribe().getRelationshipName();
    private static final String ASSIGNMENT_RELATIONSHIP = Expense__c.Bank_Assignment__c.getDescribe().getRelationshipName();
    private static final String BANK_RELATIONSHIP = Expense_Group_Bank__c.Bank__c.getDescribe().getRelationshipName();
    private static final String EXPENSE_DATE_FIELD = Expense__c.Expense_Date__c.getDescribe().getName();
    private static final String TRANSACTION_TIME_FIELD = Expense__c.Transaction_Time__c.getDescribe().getName();
    private static final String BANK_FIELD = Expense__c.Bank__c.getDescribe().getName();
    private static final String TRANSACTION_TYPE_FIELD = Expense__c.Transaction_Type__c.getDescribe().getName();
    private static final String AMOUNT_FIELD = Expense__c.Amount__c.getDescribe().getName();
    private static final String ORIGINAL_CURRENCY_CODE_FIELD = Expense__c.Original_Currency_Code__c.getDescribe().getName();

    private static final String PAGE_ORDER =
        'ORDER BY ' +
        EXPENSE_DATE_FIELD +
        ' DESC NULLS LAST, ' +
        TRANSACTION_TIME_FIELD +
        ' DESC NULLS LAST, CreatedDate DESC, Id DESC ';

    /**
     * Returns a bounded page; totals describe all matches, not only this page.
     * @param filters Expense group, category and date constraints.
     * @param pagination Search, bounded page size and optional continuation cursor.
     * @return One ordered page and a cursor when more records exist.
     */
    public static ExpensePageDto getPage(ExpenseFilterRequest filters, ExpensePageRequest pagination) {
        ExpensePageRequest options = pagination == null ? new ExpensePageRequest() : pagination;
        Integer size = options.pageSize == null ? 20 : Math.max(1, Math.min(200, options.pageSize));
        Map<String, Object> binds = new Map<String, Object>();
        String predicate = ExpenseQueryService.expenseWhere(filters, binds) + searchWhere(options.searchTerm, binds);
        String scope = EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(JSON.serialize(binds))));
        ExpensePageDto page = new ExpensePageDto();
        String after = '';
        if (String.isBlank(options.cursor)) {
            List<AggregateResult> totals = Database.queryWithBinds(
                'SELECT COUNT(Id) qty, SUM(' + AMOUNT_FIELD + ') total FROM ' + EXPENSE_OBJECT + ' ' + predicate,
                binds,
                AccessLevel.USER_MODE
            );
            page.totalCount = (Integer) totals[0].get('qty');
            page.totalAmount = (Decimal) totals[0].get('total');
            if (page.totalAmount == null) {
                page.totalAmount = 0;
            }
        } else {
            after = afterWhere(readCursor(options.cursor, scope), binds);
        }
        binds.put('rowLimit', size + 1);
        page.rows = Database.queryWithBinds(
            ExpenseQueryService.expenseSelect() + predicate + after + PAGE_ORDER + 'LIMIT :rowLimit',
            binds,
            AccessLevel.USER_MODE
        );
        page.hasMore = page.rows.size() > size;
        if (page.hasMore) {
            page.rows.remove(size);
            PageCursor next = new PageCursor();
            Expense__c last = page.rows[page.rows.size() - 1];
            next.expenseDate = last.Expense_Date__c;
            next.transactionTime = last.Transaction_Time__c;
            next.created = last.CreatedDate;
            next.recordId = last.Id;
            next.scope = scope;
            page.nextCursor = EncodingUtil.base64Encode(Blob.valueOf(JSON.serialize(next)));
        }
        return page;
    }

    private static PageCursor readCursor(String cursor, String scope) {
        try {
            PageCursor parsed = (PageCursor) JSON.deserializeStrict(EncodingUtil.base64Decode(cursor).toString(), PageCursor.class);
            if (
                parsed == null ||
                parsed.scope != scope ||
                parsed.created == null ||
                parsed.recordId == null ||
                parsed.recordId.getSObjectType() != Expense__c.SObjectType
            ) {
                throw new IllegalArgumentException('Invalid page cursor');
            }
            return parsed;
        } catch (Exception error) {
            throw new AuraHandledException('This expense page is no longer valid. Refresh the expense list.');
        }
    }

    private static String afterWhere(PageCursor cursor, Map<String, Object> binds) {
        binds.put('cursorDate', cursor.expenseDate);
        binds.put('cursorTime', cursor.transactionTime);
        binds.put('cursorCreated', cursor.created);
        binds.put('cursorId', cursor.recordId);
        String older = '(CreatedDate < :cursorCreated OR (CreatedDate = :cursorCreated AND Id < :cursorId))';
        older = '(' + TRANSACTION_TIME_FIELD + ' = :cursorTime AND ' + older + ')';
        if (cursor.transactionTime != null) {
            older = '(' + TRANSACTION_TIME_FIELD + ' < :cursorTime OR ' + TRANSACTION_TIME_FIELD + ' = null OR ' + older + ')';
        }
        older = '(' + EXPENSE_DATE_FIELD + ' = :cursorDate AND ' + older + ')';
        if (cursor.expenseDate != null) {
            older = '(' + EXPENSE_DATE_FIELD + ' < :cursorDate OR ' + EXPENSE_DATE_FIELD + ' = null OR ' + older + ')';
        }
        return 'AND ' + older + ' ';
    }

    private static String searchWhere(String searchTerm, Map<String, Object> binds) {
        if (String.isBlank(searchTerm)) {
            return '';
        }
        String term = searchTerm.trim().toLowerCase();
        binds.put('search', '%' + term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%');
        binds.put('bankValues', matchingValues(Expense__c.Bank__c, term));
        binds.put('typeValues', matchingValues(Expense__c.Transaction_Type__c, term));
        return 'AND (Name LIKE :search OR ' +
            CATEGORY_RELATIONSHIP +
            '.Name LIKE :search OR ' +
            CATEGORY_RELATIONSHIP +
            '.' +
            GROUP_RELATIONSHIP +
            '.Name LIKE :search ' +
            'OR ' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_RELATIONSHIP +
            '.Name LIKE :search ' +
            'OR (' +
            ASSIGNMENT_RELATIONSHIP +
            '.' +
            BANK_RELATIONSHIP +
            '.Name = null AND ' +
            BANK_FIELD +
            ' IN :bankValues) ' +
            'OR ' +
            TRANSACTION_TYPE_FIELD +
            ' IN :typeValues OR ' +
            ORIGINAL_CURRENCY_CODE_FIELD +
            ' LIKE :search) ';
    }

    private static List<String> matchingValues(Schema.SObjectField field, String term) {
        List<String> matches = new List<String>();
        for (Schema.PicklistEntry entry : field.getDescribe().getPicklistValues()) {
            if (entry.getValue().toLowerCase().contains(term)) {
                matches.add(entry.getValue());
            }
        }
        return matches;
    }

    private class PageCursor {
        public Date expenseDate;
        public Time transactionTime;
        public Datetime created;
        public Id recordId;
        public String scope;
    }
}
